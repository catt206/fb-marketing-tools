import { Router } from "express";
import { z } from "zod";
import { FacebookAccountModel } from "../models/FacebookAccount.js";
import { debugUserToken, exchangeCodeForUserToken, exchangeForLongLivedUserToken, getGroupBasicInfo, getMe, getMyPages } from "../services/facebookApi.js";
import { encryptAccessToken, getUserAccessToken } from "../services/facebookTokenStore.js";
import { writeAuditLog } from "../services/audit.js";
const connectExchangeSchema = z.object({
    code: z.string().min(1),
    redirectUri: z.string().url()
});
const validateGroupSchema = z.object({
    accountId: z.string().min(1),
    groupId: z.string().min(1)
});
export function facebookRoutes(params) {
    const router = Router();
    const fbConfig = {
        appId: params.env.FACEBOOK_APP_ID,
        appSecret: params.env.FACEBOOK_APP_SECRET,
        apiVersion: params.env.FACEBOOK_API_VERSION
    };
    router.post("/connect/exchange", async (req, res, next) => {
        try {
            const authReq = req;
            const body = connectExchangeSchema.parse(req.body);
            const shortLived = await exchangeCodeForUserToken({
                config: fbConfig,
                code: body.code,
                redirectUri: body.redirectUri
            });
            const longLived = await exchangeForLongLivedUserToken({
                config: fbConfig,
                shortLivedUserAccessToken: shortLived.access_token
            });
            const me = await getMe({ config: fbConfig, userAccessToken: longLived.access_token });
            const debug = await debugUserToken({ config: fbConfig, userAccessToken: longLived.access_token });
            if (!debug.data.is_valid) {
                res.status(400).json({ error: "FACEBOOK_TOKEN_INVALID" });
                return;
            }
            const tokenExpiresAt = new Date(Date.now() + longLived.expires_in * 1000);
            const scopes = debug.data.scopes ?? [];
            const encryptedToken = encryptAccessToken({ env: params.env, userAccessToken: longLived.access_token });
            const account = await FacebookAccountModel.findOneAndUpdate({ userId: authReq.auth.userId, fbUserId: me.id }, {
                $set: {
                    name: me.name,
                    userAccessTokenCiphertext: encryptedToken.userAccessTokenCiphertext,
                    userAccessTokenIv: encryptedToken.userAccessTokenIv,
                    userAccessTokenTag: encryptedToken.userAccessTokenTag,
                    tokenExpiresAt,
                    scopes
                }
            }, { upsert: true, new: true }).lean();
            await writeAuditLog({
                env: params.env,
                userId: authReq.auth.userId,
                requestId: req.ctx?.requestId,
                action: "FACEBOOK_CONNECT",
                status: "SUCCESS",
                entityType: "FacebookAccount",
                entityId: account?._id?.toString(),
                metadata: { fbUserId: me.id, scopes }
            });
            res.json({ account });
        }
        catch (err) {
            next(err);
        }
    });
    router.get("/accounts", async (req, res, next) => {
        try {
            const authReq = req;
            const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
            const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
            const filter = { userId: authReq.auth.userId };
            if (cursor)
                filter._id = { $lt: cursor };
            const accounts = await FacebookAccountModel.find(filter, {
                userAccessToken: 0,
                userAccessTokenCiphertext: 0,
                userAccessTokenIv: 0,
                userAccessTokenTag: 0
            })
                .sort({ _id: -1 })
                .limit(limit)
                .lean();
            const nextCursor = accounts.length > 0 ? accounts[accounts.length - 1]._id.toString() : null;
            res.json({ accounts, nextCursor });
        }
        catch (err) {
            next(err);
        }
    });
    router.delete("/accounts/:id", async (req, res, next) => {
        try {
            const authReq = req;
            const result = await FacebookAccountModel.deleteOne({ _id: req.params.id, userId: authReq.auth.userId });
            if (result.deletedCount === 0) {
                res.status(404).json({ error: "NOT_FOUND" });
                return;
            }
            res.status(204).end();
        }
        catch (err) {
            next(err);
        }
    });
    router.get("/accounts/:id/pages", async (req, res, next) => {
        try {
            const authReq = req;
            const account = await FacebookAccountModel.findOne({ _id: req.params.id, userId: authReq.auth.userId }).lean();
            if (!account) {
                res.status(404).json({ error: "NOT_FOUND" });
                return;
            }
            const userAccessToken = await getUserAccessToken({ env: params.env, accountId: req.params.id });
            const pages = await getMyPages({ config: fbConfig, userAccessToken });
            res.json({
                pages: pages.map((p) => ({
                    id: p.id,
                    name: p.name,
                    hasAccessToken: Boolean(p.access_token)
                }))
            });
        }
        catch (err) {
            next(err);
        }
    });
    router.post("/groups/validate", async (req, res, next) => {
        try {
            const authReq = req;
            const body = validateGroupSchema.parse(req.body);
            const account = await FacebookAccountModel.findOne({ _id: body.accountId, userId: authReq.auth.userId }).lean();
            if (!account) {
                res.status(404).json({ error: "NOT_FOUND" });
                return;
            }
            const userAccessToken = await getUserAccessToken({ env: params.env, accountId: body.accountId });
            const info = await getGroupBasicInfo({
                config: fbConfig,
                groupId: body.groupId,
                userAccessToken
            });
            res.json({ group: info });
        }
        catch (err) {
            next(err);
        }
    });
    return router;
}
