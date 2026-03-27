import "dotenv/config";
import path from "path";
import fs from "fs";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { getEnv } from "./config/env.js";
import { connectMongo } from "./db/mongoose.js";
import { apiRoutes } from "./routes/index.js";
import { requestContextMiddleware } from "./middlewares/requestContext.js";
import { requestLoggerMiddleware } from "./middlewares/requestLogger.js";
import { errorMiddleware } from "./middlewares/error.js";
import { startScheduler } from "./services/scheduler.js";
import { logger } from "./logger.js";
const env = getEnv();
await connectMongo(env.MONGODB_URI);
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(requestContextMiddleware);
app.use(requestLoggerMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(cors({
    origin(origin, callback) {
        if (!origin) {
            callback(null, true);
            return;
        }
        if (origin.startsWith("chrome-extension://")) {
            callback(null, true);
            return;
        }
        try {
            const parsed = new URL(origin);
            if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
                callback(null, true);
                return;
            }
        }
        catch {
            callback(null, false);
            return;
        }
        callback(null, false);
    }
}));
const uploadsDir = path.resolve(process.cwd(), env.UPLOADS_DIR);
if (!env.S3_ENABLED) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    app.use("/uploads", express.static(uploadsDir, { fallthrough: false }));
}
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", apiRoutes({ env }));
app.use(errorMiddleware);
const scheduler = startScheduler({ env });
process.on("SIGINT", () => {
    scheduler.stop();
    process.exit(0);
});
process.on("SIGTERM", () => {
    scheduler.stop();
    process.exit(0);
});
app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Backend started");
});
