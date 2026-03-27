import { Router } from "express";
import { z } from "zod";
import type { Env } from "../config/env.js";
import type { AuthenticatedRequest } from "../middlewares/auth.js";
import { AuditLogModel } from "../models/AuditLog.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  cursor: z.string().min(1).optional()
});

export function auditRoutes(_params: { env: Env }) {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const authReq = req as unknown as AuthenticatedRequest;
      const query = listQuerySchema.parse(req.query);
      const limit = query.limit ?? 50;

      const filter: Record<string, unknown> = { userId: authReq.auth.userId };
      if (query.cursor) {
        filter._id = { $lt: query.cursor };
      }

      const logs = await AuditLogModel.find(filter).sort({ _id: -1 }).limit(limit).lean();
      const nextCursor = logs.length > 0 ? logs[logs.length - 1]!._id.toString() : null;
      res.json({ logs, nextCursor });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

