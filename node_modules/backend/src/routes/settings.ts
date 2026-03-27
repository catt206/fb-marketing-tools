import { Router } from "express";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { type AuthenticatedRequest } from "../middlewares/auth.js";
import { UserSettingsModel } from "../models/UserSettings.js";
import type { RequestWithContext } from "../middlewares/requestContext.js";
import { writeAuditLog } from "../services/audit.js";

const updateSettingsSchema = z.object({
  postsPerDayLimit: z.number().int().positive().max(200),
  randomDelayMinSeconds: z.number().int().nonnegative().max(3600),
  randomDelayMaxSeconds: z.number().int().positive().max(3600)
});

export function settingsRoutes(params: { env: Env }) {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const authReq = req as unknown as AuthenticatedRequest;
      const settings = await UserSettingsModel.findOne({ userId: authReq.auth.userId }).lean();
      if (!settings) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  });

  router.put("/", async (req, res, next) => {
    try {
      const authReq = req as unknown as AuthenticatedRequest;
      const body = updateSettingsSchema.parse(req.body);
      if (body.randomDelayMaxSeconds < body.randomDelayMinSeconds) {
        res.status(400).json({ error: "INVALID_DELAY_RANGE" });
        return;
      }
      const settings = await UserSettingsModel.findOneAndUpdate(
        { userId: authReq.auth.userId },
        { $set: body },
        { new: true }
      ).lean();
      if (!settings) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }
      await writeAuditLog({
        env: params.env,
        userId: authReq.auth.userId,
        requestId: (req as unknown as RequestWithContext).ctx?.requestId,
        action: "SETTINGS_UPDATE",
        status: "SUCCESS",
        entityType: "UserSettings",
        entityId: authReq.auth.userId,
        metadata: body
      });
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
