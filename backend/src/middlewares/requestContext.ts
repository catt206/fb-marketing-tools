import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";

export type RequestContext = {
  requestId: string;
};

export type RequestWithContext = Request & { ctx: RequestContext };

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = req.header("x-request-id")?.trim() || randomUUID();
  (req as RequestWithContext).ctx = { requestId };
  res.setHeader("x-request-id", requestId);
  next();
}

