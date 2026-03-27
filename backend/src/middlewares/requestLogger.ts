import type { NextFunction, Request, Response } from "express";
import { logger } from "../logger.js";
import type { RequestWithContext } from "./requestContext.js";

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = (req as RequestWithContext).ctx?.requestId;

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    logger.info(
      {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs
      },
      "http_request"
    );
  });

  next();
}

