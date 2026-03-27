import { Router } from "express";
import { z } from "zod";
import { UserSettingsModel } from "../models/UserSettings.js";
import { writeAuditLog } from "../services/audit.js";
const updateSettingsSchema = z.object({
    postsPerDayLimit: z.number().int().positive().max(200),
    randomDelayMinSeconds: z.number().int().nonnegative().max(3600),
    randomDelayMaxSeconds: z.number().int().positive().max(3600)
});
export function settingsRoutes(params) {
    const router = Router();
    router.get("/", async (req, res, next) => {
        try {
            const authReq = req;
            const settings = await UserSettingsModel.findOne({ userId: authReq.auth.userId }).lean();
            if (!settings) {
                res.status(404).json({ error: "NOT_FOUND" });
                return;
            }
            res.json({ settings });
        }
        catch (err) {
            next(err);
        }
    });
    router.put("/", async (req, res, next) => {
        try {
            const authReq = req;
            const body = updateSettingsSchema.parse(req.body);
            if (body.randomDelayMaxSeconds < body.randomDelayMinSeconds) {
                res.status(400).json({ error: "INVALID_DELAY_RANGE" });
                return;
            }
            const settings = await UserSettingsModel.findOneAndUpdate({ userId: authReq.auth.userId }, { $set: body }, { new: true }).lean();
            if (!settings) {
                res.status(404).json({ error: "NOT_FOUND" });
                return;
            }
            await writeAuditLog({
                env: params.env,
                userId: authReq.auth.userId,
                requestId: req.ctx?.requestId,
                action: "SETTINGS_UPDATE",
                status: "SUCCESS",
                entityType: "UserSettings",
                entityId: authReq.auth.userId,
                metadata: body
            });
            res.json({ settings });
        }
        catch (err) {
            next(err);
        }
    });
    return router;
}
