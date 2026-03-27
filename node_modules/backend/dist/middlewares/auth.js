import { verify } from "jsonwebtoken";
export function requireAuth(params) {
    return (req, res, next) => {
        const authorization = req.header("authorization");
        if (!authorization?.startsWith("Bearer ")) {
            res.status(401).json({ error: "UNAUTHORIZED" });
            return;
        }
        const token = authorization.slice("Bearer ".length);
        try {
            const payload = verify(token, params.jwtSecret);
            if (typeof payload !== "object" || payload === null || typeof payload.userId !== "string") {
                res.status(401).json({ error: "UNAUTHORIZED" });
                return;
            }
            req.auth = { userId: payload.userId };
            next();
        }
        catch {
            res.status(401).json({ error: "UNAUTHORIZED" });
        }
    };
}
