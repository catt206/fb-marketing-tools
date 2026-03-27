import { randomUUID } from "crypto";
export function requestContextMiddleware(req, res, next) {
    const requestId = req.header("x-request-id")?.trim() || randomUUID();
    req.ctx = { requestId };
    res.setHeader("x-request-id", requestId);
    next();
}
