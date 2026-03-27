import { RateLimiterMemory } from "rate-limiter-flexible";
export function createApiRateLimiter(params) {
    const limiter = new RateLimiterMemory({
        points: params.env.API_RATE_LIMIT_POINTS,
        duration: params.env.API_RATE_LIMIT_DURATION_SECONDS
    });
    return async (req, res, next) => {
        const requestId = req.ctx?.requestId;
        const userId = req?.auth?.userId;
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        const key = userId ? `u:${userId}` : `ip:${ip}`;
        try {
            const result = await limiter.consume(key, 1);
            res.setHeader("x-ratelimit-limit", `${params.env.API_RATE_LIMIT_POINTS}`);
            res.setHeader("x-ratelimit-remaining", `${result.remainingPoints}`);
            res.setHeader("x-ratelimit-reset", `${Math.ceil(result.msBeforeNext / 1000)}`);
            next();
        }
        catch (rejRes) {
            const msBeforeNext = rejRes && typeof rejRes === "object" && "msBeforeNext" in rejRes ? rejRes.msBeforeNext : 1000;
            res.setHeader("retry-after", `${Math.ceil(msBeforeNext / 1000)}`);
            res.status(429).json({ error: "RATE_LIMITED", message: "Too many requests", requestId });
        }
    };
}
