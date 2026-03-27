import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type AuthenticatedRequest = Request & { auth: { userId: string } };

export function requireAuth(params: { jwtSecret: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authorization = req.header("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    const token = authorization.slice("Bearer ".length);
    try {
      const payload = jwt.verify(token, params.jwtSecret);
      if (typeof payload !== "object" || payload === null || typeof (payload as any).userId !== "string") {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }
      (req as AuthenticatedRequest).auth = { userId: (payload as any).userId };
      next();
    } catch {
      res.status(401).json({ error: "UNAUTHORIZED" });
    }
  };
}
