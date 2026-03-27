import { logger } from "../logger.js";
export function requestLoggerMiddleware(req, res, next) {
    const start = Date.now();
    const requestId = req.ctx?.requestId;
    res.on("finish", () => {
        const durationMs = Date.now() - start;
        logger.info({
            requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs
        }, "http_request");
    });
    next();
}
