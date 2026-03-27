import type { Env } from "../config/env.js";
import { DailyUsageModel } from "../models/DailyUsage.js";
import { FacebookAccountModel } from "../models/FacebookAccount.js";
import { PostJobModel, type PostJob } from "../models/PostJob.js";
import { UserSettingsModel } from "../models/UserSettings.js";
import { addUtcDays, startOfUtcDay, toUtcDateKey } from "../utils/date.js";
import { randomIntInclusive, sleepMs } from "../utils/random.js";
import { createGroupTextPost, createPagePhotoPost, createPageTextPost, exchangeForLongLivedUserToken, getMyPages } from "./facebookApi.js";
import { encryptAccessToken, getUserAccessTokenFromAccountDoc } from "./facebookTokenStore.js";
import { writeAuditLog } from "./audit.js";
import { logger } from "../logger.js";

export type SchedulerHandle = { stop: () => void };

export function startScheduler(params: { env: Env }): SchedulerHandle {
  let stopped = false;
  let inTick = false;

  const fbConfig = {
    appId: params.env.FACEBOOK_APP_ID,
    appSecret: params.env.FACEBOOK_APP_SECRET,
    apiVersion: params.env.FACEBOOK_API_VERSION
  };

  const tick = async () => {
    if (stopped || inTick) return;
    inTick = true;
    try {
      const now = new Date();
      await PostJobModel.updateMany({ status: "SCHEDULED", nextRunAt: { $lte: now } }, { $set: { status: "READY" } });
      for (let i = 0; i < 5; i += 1) {
        const job = await PostJobModel.findOneAndUpdate(
          { status: "READY", nextRunAt: { $lte: new Date() } },
          { $set: { status: "POSTING" }, $inc: { attempts: 1 } },
          { new: true }
        ).lean();
        if (!job) break;
        await processJob({ env: params.env, fbConfig, job });
        await sleepMs(300);
      }
    } finally {
      inTick = false;
    }
  };

  const interval = setInterval(() => {
    void tick();
  }, 5_000);

  void tick();

  return {
    stop() {
      stopped = true;
      clearInterval(interval);
    }
  };
}

async function processJob(params: {
  env: Env;
  fbConfig: { appId: string; appSecret: string; apiVersion: string };
  job: PostJob;
}): Promise<void> {
  const jobId = params.job._id;
  try {
    const accountDoc = await FacebookAccountModel.findById(params.job.accountId);
    const account = accountDoc?.toObject();
    if (!account) {
      await PostJobModel.updateOne({ _id: jobId }, { $set: { status: "FAILED", lastError: "FACEBOOK_ACCOUNT_NOT_FOUND" } });
      await writeAuditLog({
        env: params.env,
        userId: params.job.userId.toString(),
        action: "JOB_POST",
        status: "FAIL",
        entityType: "PostJob",
        entityId: jobId.toString(),
        message: "FACEBOOK_ACCOUNT_NOT_FOUND"
      });
      return;
    }

    if (account.tokenExpiresAt.getTime() <= Date.now()) {
      await PostJobModel.updateOne({ _id: jobId }, { $set: { status: "FAILED", lastError: "FACEBOOK_TOKEN_EXPIRED" } });
      await writeAuditLog({
        env: params.env,
        userId: params.job.userId.toString(),
        action: "JOB_POST",
        status: "FAIL",
        entityType: "PostJob",
        entityId: jobId.toString(),
        message: "FACEBOOK_TOKEN_EXPIRED"
      });
      return;
    }

    const userAccessToken = await getUserAccessTokenFromAccountDoc({ env: params.env, accountDoc: accountDoc! });
    await refreshTokenIfNeeded({ env: params.env, fbConfig: params.fbConfig, accountId: accountDoc!._id.toString(), tokenExpiresAt: accountDoc!.tokenExpiresAt, userAccessToken });

    const settings = await UserSettingsModel.findOne({ userId: params.job.userId }).lean();
    if (!settings) {
      await PostJobModel.updateOne({ _id: jobId }, { $set: { status: "FAILED", lastError: "SETTINGS_NOT_FOUND" } });
      await writeAuditLog({
        env: params.env,
        userId: params.job.userId.toString(),
        action: "JOB_POST",
        status: "FAIL",
        entityType: "PostJob",
        entityId: jobId.toString(),
        message: "SETTINGS_NOT_FOUND"
      });
      return;
    }

    const todayKey = toUtcDateKey(new Date());
    const usage = await DailyUsageModel.findOneAndUpdate(
      { userId: params.job.userId, accountId: params.job.accountId, dateKey: todayKey },
      { $setOnInsert: { postsCount: 0 } },
      { upsert: true, new: true }
    ).lean();

    if (!usage || usage.postsCount >= settings.postsPerDayLimit) {
      const tomorrow = addUtcDays(startOfUtcDay(new Date()), 1);
      tomorrow.setUTCHours(9, 0, 0, 0);
      const jitterSeconds = randomIntInclusive(settings.randomDelayMinSeconds, settings.randomDelayMaxSeconds);
      await PostJobModel.updateOne(
        { _id: jobId },
        { $set: { status: "SCHEDULED", nextRunAt: new Date(tomorrow.getTime() + jitterSeconds * 1000), lastError: "DAILY_LIMIT_REACHED" } }
      );
      await writeAuditLog({
        env: params.env,
        userId: params.job.userId.toString(),
        action: "JOB_POST_DEFER",
        status: "SUCCESS",
        entityType: "PostJob",
        entityId: jobId.toString(),
        message: "DAILY_LIMIT_REACHED"
      });
      return;
    }

    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const duplicate = await PostJobModel.findOne({
      userId: params.job.userId,
      targetType: params.job.targetType,
      targetId: params.job.targetId,
      contentHash: params.job.contentHash,
      status: "POSTED",
      postedAt: { $gte: last7Days }
    })
      .select({ _id: 1 })
      .lean();

    if (duplicate) {
      await PostJobModel.updateOne({ _id: jobId }, { $set: { status: "CANCELLED", lastError: "DUPLICATE_CONTENT_RECENTLY_POSTED" } });
      await writeAuditLog({
        env: params.env,
        userId: params.job.userId.toString(),
        action: "JOB_CANCEL",
        status: "SUCCESS",
        entityType: "PostJob",
        entityId: jobId.toString(),
        message: "DUPLICATE_CONTENT_RECENTLY_POSTED"
      });
      return;
    }

    const message = params.job.message.trim();
    if (params.job.targetType === "PAGE") {
      const pages = await getMyPages({ config: params.fbConfig, userAccessToken });
      const page = pages.find((p) => p.id === params.job.targetId);
      if (!page?.access_token) {
        await PostJobModel.updateOne({ _id: jobId }, { $set: { status: "FAILED", lastError: "PAGE_ACCESS_TOKEN_NOT_AVAILABLE" } });
        await writeAuditLog({
          env: params.env,
          userId: params.job.userId.toString(),
          action: "JOB_POST",
          status: "FAIL",
          entityType: "PostJob",
          entityId: jobId.toString(),
          message: "PAGE_ACCESS_TOKEN_NOT_AVAILABLE"
        });
        return;
      }

      const result = params.job.imageUrl
        ? await createPagePhotoPost({
            config: params.fbConfig,
            pageId: params.job.targetId,
            pageAccessToken: page.access_token,
            imageUrl: params.job.imageUrl,
            caption: message
          })
        : await createPageTextPost({
            config: params.fbConfig,
            pageId: params.job.targetId,
            pageAccessToken: page.access_token,
            message
          });

      const fbPostId = "post_id" in result && result.post_id ? result.post_id : result.id;
      await PostJobModel.updateOne(
        { _id: jobId },
        { $set: { status: "POSTED", postedAt: new Date(), fbPostId, lastError: undefined } }
      );
      await writeAuditLog({
        env: params.env,
        userId: params.job.userId.toString(),
        action: "JOB_POST",
        status: "SUCCESS",
        entityType: "PostJob",
        entityId: jobId.toString(),
        metadata: { fbPostId, targetType: "PAGE", targetId: params.job.targetId }
      });
    } else {
      const result = await createGroupTextPost({
        config: params.fbConfig,
        groupId: params.job.targetId,
        userAccessToken,
        message
      });
      await PostJobModel.updateOne(
        { _id: jobId },
        { $set: { status: "POSTED", postedAt: new Date(), fbPostId: result.id, lastError: undefined } }
      );
      await writeAuditLog({
        env: params.env,
        userId: params.job.userId.toString(),
        action: "JOB_POST",
        status: "SUCCESS",
        entityType: "PostJob",
        entityId: jobId.toString(),
        metadata: { fbPostId: result.id, targetType: "GROUP", targetId: params.job.targetId }
      });
    }

    await DailyUsageModel.updateOne(
      { userId: params.job.userId, accountId: params.job.accountId, dateKey: todayKey },
      { $inc: { postsCount: 1 } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await PostJobModel.updateOne({ _id: jobId }, { $set: { status: "FAILED", lastError: message } });
    await writeAuditLog({
      env: params.env,
      userId: params.job.userId.toString(),
      action: "JOB_POST",
      status: "FAIL",
      entityType: "PostJob",
      entityId: jobId.toString(),
      message
    });
  }
}

async function refreshTokenIfNeeded(params: {
  env: Env;
  fbConfig: { appId: string; appSecret: string; apiVersion: string };
  accountId: string;
  tokenExpiresAt: Date;
  userAccessToken: string;
}): Promise<void> {
  const refreshThresholdMs = 7 * 24 * 60 * 60 * 1000;
  if (params.tokenExpiresAt.getTime() - Date.now() > refreshThresholdMs) {
    return;
  }
  try {
    const refreshed = await exchangeForLongLivedUserToken({
      config: params.fbConfig,
      shortLivedUserAccessToken: params.userAccessToken
    });
    const tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    const encryptedToken = encryptAccessToken({ env: params.env, userAccessToken: refreshed.access_token });

    await FacebookAccountModel.updateOne(
      { _id: params.accountId },
      {
        $set: {
          userAccessTokenCiphertext: encryptedToken.userAccessTokenCiphertext,
          userAccessTokenIv: encryptedToken.userAccessTokenIv,
          userAccessTokenTag: encryptedToken.userAccessTokenTag,
          tokenExpiresAt
        }
      }
    );
    logger.info({ accountId: params.accountId }, "facebook_token_refreshed");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.warn({ accountId: params.accountId, message }, "facebook_token_refresh_failed");
  }
}
