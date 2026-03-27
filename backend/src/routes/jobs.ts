import { Router } from "express";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { type AuthenticatedRequest } from "../middlewares/auth.js";
import { FacebookAccountModel } from "../models/FacebookAccount.js";
import { PostJobModel, type PostTargetType } from "../models/PostJob.js";
import { ContentTemplateModel } from "../models/ContentTemplate.js";
import { UserSettingsModel } from "../models/UserSettings.js";
import type { RequestWithContext } from "../middlewares/requestContext.js";
import { writeAuditLog } from "../services/audit.js";
import { sha256Base64Url } from "../utils/hash.js";
import { randomIntInclusive } from "../utils/random.js";
import { startOfUtcDay, toUtcDateKey } from "../utils/date.js";
import { spinText } from "../services/spintax.js";

const scheduleJobSchema = z.object({
  accountId: z.string().min(1),
  targetType: z.enum(["PAGE", "GROUP"]),
  targetId: z.string().min(1),
  scheduledAt: z.string().datetime(),

  templateId: z.string().optional(),
  message: z.string().min(1).max(5000).optional(),
  imageUrl: z.string().url().optional(),
  enableSpin: z.boolean().optional().default(true)
});

export function jobsRoutes(params: { env: Env }) {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const authReq = req as unknown as AuthenticatedRequest;
      const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

      const filter: Record<string, unknown> = { userId: authReq.auth.userId };
      if (status) filter.status = status;
      if (cursor) filter._id = { $lt: cursor };

      const jobs = await PostJobModel.find(filter).sort({ _id: -1 }).limit(limit).lean();
      const nextCursor = jobs.length > 0 ? jobs[jobs.length - 1]!._id.toString() : null;
      res.json({ jobs, nextCursor });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const authReq = req as unknown as AuthenticatedRequest;
      const body = scheduleJobSchema.parse(req.body);

      const scheduledAt = new Date(body.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        res.status(400).json({ error: "INVALID_DATETIME" });
        return;
      }
      if (scheduledAt.getTime() < Date.now() - 30_000) {
        res.status(400).json({ error: "SCHEDULED_TIME_IN_PAST" });
        return;
      }

      const account = await FacebookAccountModel.findOne({ _id: body.accountId, userId: authReq.auth.userId }).lean();
      if (!account) {
        res.status(404).json({ error: "FACEBOOK_ACCOUNT_NOT_FOUND" });
        return;
      }

      const settings = await UserSettingsModel.findOne({ userId: authReq.auth.userId }).lean();
      if (!settings) {
        res.status(500).json({ error: "SETTINGS_NOT_FOUND" });
        return;
      }

      const template = body.templateId
        ? await ContentTemplateModel.findOne({ _id: body.templateId, userId: authReq.auth.userId }).lean()
        : null;

      const baseMessage = body.message ?? template?.text;
      if (!baseMessage) {
        res.status(400).json({ error: "MESSAGE_REQUIRED" });
        return;
      }

      const baseImageUrl = body.imageUrl ?? template?.imageUrl;
      const finalMessage = body.enableSpin ? spinText(baseMessage).text : baseMessage.trim();

      const normalizedForHash = `${finalMessage.trim()}\n${baseImageUrl ?? ""}`.trim();
      const contentHash = sha256Base64Url(normalizedForHash);

      const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentDuplicate = await PostJobModel.findOne({
        userId: authReq.auth.userId,
        targetType: body.targetType,
        targetId: body.targetId,
        contentHash,
        status: "POSTED",
        postedAt: { $gte: last7Days }
      })
        .select({ _id: 1 })
        .lean();

      if (recentDuplicate) {
        res.status(409).json({ error: "DUPLICATE_CONTENT_RECENTLY_POSTED" });
        return;
      }

      const reuseWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const reuseCount = await PostJobModel.countDocuments({
        userId: authReq.auth.userId,
        contentHash,
        createdAt: { $gte: reuseWindowStart },
        status: { $in: ["SCHEDULED", "READY", "POSTING", "POSTED"] }
      });

      if (reuseCount >= 3) {
        res.status(429).json({ error: "CONTENT_REUSE_LIMIT" });
        return;
      }

      const dayStart = startOfUtcDay(scheduledAt);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const scheduledCountToday = await PostJobModel.countDocuments({
        userId: authReq.auth.userId,
        accountId: account._id,
        scheduledAt: { $gte: dayStart, $lt: dayEnd },
        status: { $in: ["SCHEDULED", "READY", "POSTING", "POSTED"] }
      });

      if (scheduledCountToday >= settings.postsPerDayLimit) {
        res.status(429).json({ error: "DAILY_LIMIT_REACHED" });
        return;
      }

      const delaySeconds = randomIntInclusive(settings.randomDelayMinSeconds, settings.randomDelayMaxSeconds);
      const proposedNextRunAt = new Date(scheduledAt.getTime() + delaySeconds * 1000);

      const lastJob = await PostJobModel.findOne({
        userId: authReq.auth.userId,
        accountId: account._id,
        status: { $in: ["SCHEDULED", "READY", "POSTING"] }
      })
        .sort({ nextRunAt: -1 })
        .lean();

      const minSpacingSeconds = Math.max(5, settings.randomDelayMinSeconds);
      let nextRunAt = proposedNextRunAt;
      if (lastJob && lastJob.nextRunAt.getTime() + minSpacingSeconds * 1000 > nextRunAt.getTime()) {
        const spacingSeconds = randomIntInclusive(settings.randomDelayMinSeconds, settings.randomDelayMaxSeconds);
        nextRunAt = new Date(lastJob.nextRunAt.getTime() + spacingSeconds * 1000);
      }

      const created = await PostJobModel.create({
        userId: authReq.auth.userId,
        accountId: account._id,
        targetType: body.targetType as PostTargetType,
        targetId: body.targetId,
        templateId: template?._id,
        message: finalMessage,
        imageUrl: baseImageUrl,
        scheduledAt,
        nextRunAt,
        status: "SCHEDULED",
        contentHash,
        attempts: 0
      });

      await writeAuditLog({
        env: params.env,
        userId: authReq.auth.userId,
        requestId: (req as unknown as RequestWithContext).ctx?.requestId,
        action: "JOB_SCHEDULE",
        status: "SUCCESS",
        entityType: "PostJob",
        entityId: created._id.toString(),
        metadata: { targetType: body.targetType, targetId: body.targetId, scheduledAt: body.scheduledAt }
      });

      res.status(201).json({ job: created.toJSON(), dateKey: toUtcDateKey(scheduledAt) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/cancel", async (req, res, next) => {
    try {
      const authReq = req as unknown as AuthenticatedRequest;
      const job = await PostJobModel.findOneAndUpdate(
        { _id: req.params.id, userId: authReq.auth.userId, status: { $in: ["SCHEDULED", "READY"] } },
        { $set: { status: "CANCELLED" } },
        { new: true }
      ).lean();
      if (!job) {
        res.status(404).json({ error: "NOT_FOUND_OR_NOT_CANCELLABLE" });
        return;
      }
      await writeAuditLog({
        env: params.env,
        userId: authReq.auth.userId,
        requestId: (req as unknown as RequestWithContext).ctx?.requestId,
        action: "JOB_CANCEL",
        status: "SUCCESS",
        entityType: "PostJob",
        entityId: req.params.id
      });
      res.json({ job });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/run-now", async (req, res, next) => {
    try {
      const authReq = req as unknown as AuthenticatedRequest;
      const job = await PostJobModel.findOneAndUpdate(
        { _id: req.params.id, userId: authReq.auth.userId, status: { $in: ["SCHEDULED", "READY"] } },
        { $set: { nextRunAt: new Date(), status: "READY" } },
        { new: true }
      ).lean();
      if (!job) {
        res.status(404).json({ error: "NOT_FOUND_OR_NOT_RUNNABLE" });
        return;
      }
      await writeAuditLog({
        env: params.env,
        userId: authReq.auth.userId,
        requestId: (req as unknown as RequestWithContext).ctx?.requestId,
        action: "JOB_RUN_NOW",
        status: "SUCCESS",
        entityType: "PostJob",
        entityId: req.params.id
      });
      res.json({ job });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
