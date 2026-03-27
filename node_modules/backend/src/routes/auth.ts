import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { UserModel } from "../models/User.js";
import { UserSettingsModel } from "../models/UserSettings.js";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth.js";
import type { RequestWithContext } from "../middlewares/requestContext.js";
import { writeAuditLog } from "../services/audit.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export function authRoutes(params: { env: Env }) {
  const router = Router();

  router.post("/register", async (req, res, next) => {
    try {
      const body = registerSchema.parse(req.body);
      const existing = await UserModel.findOne({ email: body.email }).lean();
      if (existing) {
        res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
        return;
      }

      const passwordHash = await bcrypt.hash(body.password, 12);
      const user = await UserModel.create({ email: body.email, passwordHash });

      await UserSettingsModel.create({
        userId: user._id,
        postsPerDayLimit: params.env.POSTS_PER_DAY_LIMIT_DEFAULT,
        randomDelayMinSeconds: params.env.RANDOM_DELAY_MIN_SECONDS,
        randomDelayMaxSeconds: params.env.RANDOM_DELAY_MAX_SECONDS
      });

      const token = jwt.sign({ userId: user._id.toString() }, params.env.JWT_SECRET, {
        expiresIn: params.env.JWT_EXPIRES_IN as any
      });

      await writeAuditLog({
        env: params.env,
        userId: user._id.toString(),
        requestId: (req as unknown as RequestWithContext).ctx?.requestId,
        action: "AUTH_REGISTER",
        status: "SUCCESS",
        entityType: "User",
        entityId: user._id.toString(),
        metadata: { email: body.email }
      });

      res.json({ token, user: user.toJSON() });
    } catch (err) {
      next(err);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const body = loginSchema.parse(req.body);
      const user = await UserModel.findOne({ email: body.email });
      if (!user) {
        res.status(401).json({ error: "INVALID_CREDENTIALS" });
        return;
      }

      const ok = await bcrypt.compare(body.password, user.passwordHash);
      if (!ok) {
        res.status(401).json({ error: "INVALID_CREDENTIALS" });
        return;
      }

      const token = jwt.sign({ userId: user._id.toString() }, params.env.JWT_SECRET, {
        expiresIn: params.env.JWT_EXPIRES_IN as any
      });

      await writeAuditLog({
        env: params.env,
        userId: user._id.toString(),
        requestId: (req as unknown as RequestWithContext).ctx?.requestId,
        action: "AUTH_LOGIN",
        status: "SUCCESS",
        entityType: "User",
        entityId: user._id.toString(),
        metadata: { email: body.email }
      });

      res.json({ token, user: user.toJSON() });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/me",
    requireAuth({ jwtSecret: params.env.JWT_SECRET }),
    async (req, res, next) => {
      try {
        const authReq = req as unknown as AuthenticatedRequest;
        const user = await UserModel.findById(authReq.auth.userId);
        if (!user) {
          res.status(404).json({ error: "NOT_FOUND" });
          return;
        }
        res.json({ user: user.toJSON() });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
