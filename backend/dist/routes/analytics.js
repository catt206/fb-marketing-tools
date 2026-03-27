import { Router } from "express";
import { z } from "zod";
import { PostJobModel } from "../models/PostJob.js";
import { FacebookAccountModel } from "../models/FacebookAccount.js";
import { getBasicEngagement } from "../services/facebookApi.js";
import { getUserAccessToken } from "../services/facebookTokenStore.js";
const summaryQuerySchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional()
});
export function analyticsRoutes(params) {
    const router = Router();
    const fbConfig = {
        appId: params.env.FACEBOOK_APP_ID,
        appSecret: params.env.FACEBOOK_APP_SECRET,
        apiVersion: params.env.FACEBOOK_API_VERSION
    };
    router.get("/summary", async (req, res, next) => {
        try {
            const authReq = req;
            const query = summaryQuerySchema.parse(req.query);
            const from = query.from ? new Date(query.from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const to = query.to ? new Date(query.to) : new Date();
            const posted = await PostJobModel.countDocuments({
                userId: authReq.auth.userId,
                status: "POSTED",
                postedAt: { $gte: from, $lte: to }
            });
            const failed = await PostJobModel.countDocuments({
                userId: authReq.auth.userId,
                status: "FAILED",
                updatedAt: { $gte: from, $lte: to }
            });
            const scheduled = await PostJobModel.countDocuments({
                userId: authReq.auth.userId,
                status: { $in: ["SCHEDULED", "READY", "POSTING"] }
            });
            res.json({ summary: { posted, failed, scheduled, from, to } });
        }
        catch (err) {
            next(err);
        }
    });
    router.get("/posts", async (req, res, next) => {
        try {
            const authReq = req;
            const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
            const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
            const filter = { userId: authReq.auth.userId, status: "POSTED", fbPostId: { $exists: true } };
            if (cursor)
                filter._id = { $lt: cursor };
            const posts = await PostJobModel.find(filter)
                .sort({ _id: -1 })
                .limit(limit)
                .lean();
            const accountIds = Array.from(new Set(posts.map((p) => p.accountId.toString())));
            const accounts = await FacebookAccountModel.find({ userId: authReq.auth.userId, _id: { $in: accountIds } }).lean();
            const accountById = new Map(accounts.map((a) => [a._id.toString(), a]));
            const withEngagement = await Promise.all(posts.map(async (p) => {
                const account = accountById.get(p.accountId.toString());
                if (!account || !p.fbPostId) {
                    return { ...p, engagement: null };
                }
                try {
                    const accessToken = await getUserAccessToken({ env: params.env, accountId: account._id.toString() });
                    const engagement = await getBasicEngagement({
                        config: fbConfig,
                        postId: p.fbPostId,
                        accessToken
                    });
                    return { ...p, engagement };
                }
                catch {
                    return { ...p, engagement: null };
                }
            }));
            const nextCursor = posts.length > 0 ? posts[posts.length - 1]._id.toString() : null;
            res.json({ posts: withEngagement, nextCursor });
        }
        catch (err) {
            next(err);
        }
    });
    return router;
}
