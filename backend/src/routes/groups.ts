import { Router } from "express";
import { z } from "zod";
import type { Env } from "../config/env.js";
import type { AuthenticatedRequest } from "../middlewares/auth.js";
import { SavedGroupModel } from "../models/SavedGroup.js";
import { PostJobModel } from "../models/PostJob.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  cursor: z.string().min(1).optional()
});

const createSchema = z.object({
  groupId: z.string().min(1),
  name: z.string().min(1).max(200).optional()
});

export function groupsRoutes(_params: { env: Env }) {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const authReq = req as unknown as AuthenticatedRequest;
      const query = listQuerySchema.parse(req.query);
      const limit = query.limit ?? 200;

      const filter: Record<string, unknown> = { userId: authReq.auth.userId };
      if (query.cursor) {
        filter._id = { $lt: query.cursor };
      }

      const groups = await SavedGroupModel.find(filter).sort({ _id: -1 }).limit(limit).lean();
      const groupIds = groups.map((g) => g.groupId);

      const posted = await PostJobModel.find({
        userId: authReq.auth.userId,
        targetType: "GROUP",
        targetId: { $in: groupIds },
        status: "POSTED"
      })
        .select({ targetId: 1 })
        .lean();
      const postedSet = new Set(posted.map((p) => p.targetId));

      const nextCursor = groups.length > 0 ? groups[groups.length - 1]!._id.toString() : null;
      res.json({
        groups: groups.map((g) => ({
          ...g,
          postedBefore: postedSet.has(g.groupId)
        })),
        nextCursor
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const authReq = req as unknown as AuthenticatedRequest;
      const body = createSchema.parse(req.body);
      const groupId = body.groupId.trim();
      const name = body.name?.trim();

      const doc = await SavedGroupModel.findOneAndUpdate(
        { userId: authReq.auth.userId, groupId },
        { $set: { name } },
        { upsert: true, new: true }
      ).lean();

      res.status(201).json({ group: doc });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const authReq = req as unknown as AuthenticatedRequest;
      const result = await SavedGroupModel.deleteOne({ _id: req.params.id, userId: authReq.auth.userId });
      if (result.deletedCount === 0) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

