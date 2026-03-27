import { ZodError } from "zod";
import { ApiError } from "../errors/ApiError.js";
import { logger } from "../logger.js";
export function errorMiddleware(err, req, res, _next) {
    const requestId = req.ctx?.requestId;
    if (err instanceof ZodError) {
        res.status(400).json({
            error: "BAD_REQUEST",
            message: "Invalid request",
            requestId,
            details: err.issues
        });
        return;
    }
    if (err instanceof ApiError) {
        res.status(err.status).json({
            error: err.code,
            message: err.message,
            requestId,
            details: err.details ?? undefined
        });
        return;
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    logger.error({ requestId, err }, "Unhandled error");
    res.status(500).json({ error: "INTERNAL_ERROR", message, requestId });
}
