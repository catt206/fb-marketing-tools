import { Router } from "express";
import type { Env } from "../config/env.js";
import { requireAuth } from "../middlewares/auth.js";
import { createApiRateLimiter } from "../middlewares/rateLimit.js";
import { authRoutes } from "./auth.js";
import { settingsRoutes } from "./settings.js";
import { templatesRoutes } from "./templates.js";
import { facebookRoutes } from "./facebook.js";
import { uploadsRoutes } from "./uploads.js";
import { jobsRoutes } from "./jobs.js";
import { analyticsRoutes } from "./analytics.js";
import { auditRoutes } from "./audit.js";
import { groupsRoutes } from "./groups.js";

export function apiRoutes(params: { env: Env }) {
  const router = Router();
  const rateLimit = createApiRateLimiter({ env: params.env });

  router.use("/auth", rateLimit, authRoutes(params));
  router.use("/uploads", requireAuth({ jwtSecret: params.env.JWT_SECRET }), rateLimit, uploadsRoutes(params));
  router.use("/settings", requireAuth({ jwtSecret: params.env.JWT_SECRET }), rateLimit, settingsRoutes(params));
  router.use("/templates", requireAuth({ jwtSecret: params.env.JWT_SECRET }), rateLimit, templatesRoutes(params));
  router.use("/facebook", requireAuth({ jwtSecret: params.env.JWT_SECRET }), rateLimit, facebookRoutes(params));
  router.use("/jobs", requireAuth({ jwtSecret: params.env.JWT_SECRET }), rateLimit, jobsRoutes(params));
  router.use("/groups", requireAuth({ jwtSecret: params.env.JWT_SECRET }), rateLimit, groupsRoutes(params));
  router.use("/analytics", requireAuth({ jwtSecret: params.env.JWT_SECRET }), rateLimit, analyticsRoutes(params));
  router.use("/audit", requireAuth({ jwtSecret: params.env.JWT_SECRET }), rateLimit, auditRoutes(params));

  return router;
}
