import dotenv from "dotenv";
import { fileURLToPath } from "url";
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

function loadDotEnv(): { dotEnvPath: string | null; parsedKeysCount: number; dotenvError?: string } {
  const candidates = [
    path.resolve(process.cwd(), "backend", "env.local"),
    path.resolve(process.cwd(), "backend", "env.local.example"),
    path.resolve(process.cwd(), "env.local"),
    path.resolve(process.cwd(), "env.local.example"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), ".env.example"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", ".env.example"),
    path.resolve(process.cwd(), "backend", ".env"),
    path.resolve(process.cwd(), "backend", ".env.example"),
    path.resolve(process.cwd(), "..", "backend", ".env"),
    path.resolve(process.cwd(), "..", "backend", ".env.example"),
    fileURLToPath(new URL("../env.local", import.meta.url)),
    fileURLToPath(new URL("../env.local.example", import.meta.url)),
    fileURLToPath(new URL("../.env", import.meta.url)),
    fileURLToPath(new URL("../.env.example", import.meta.url))
  ];

  let lastError: string | undefined;
  for (const candidate of candidates) {
    const result = dotenv.config({ path: candidate, override: true });
    if (!result.error && result.parsed && Object.keys(result.parsed).length > 0) {
      return { dotEnvPath: candidate, parsedKeysCount: Object.keys(result.parsed).length };
    }
    if (result.error instanceof Error) {
      lastError = result.error.message;
    }
  }

  return { dotEnvPath: null, parsedKeysCount: 0, dotenvError: lastError };
}

const dotEnvInfo = loadDotEnv();
logger.info(dotEnvInfo, "dotenv_loaded");

const env = getEnv();

function redactMongoUri(uri: string): string {
  const schemeSeparatorIndex = uri.indexOf("://");
  const scheme = schemeSeparatorIndex >= 0 ? uri.slice(0, schemeSeparatorIndex) : "mongodb";
  const rest = schemeSeparatorIndex >= 0 ? uri.slice(schemeSeparatorIndex + 3) : uri;
  const withoutCredentials = rest.lastIndexOf("@") >= 0 ? rest.slice(rest.lastIndexOf("@") + 1) : rest;
  const hostPart = withoutCredentials.split("/")[0] ?? "";
  return `${scheme}://${hostPart}`;
}

logger.info(
  {
    mongodbUri: redactMongoUri(env.MONGODB_URI),
    mongodbUsesSrv: env.MONGODB_URI.startsWith("mongodb+srv://")
  },
  "mongo_config"
);

await connectMongo(env.MONGODB_URI);

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(requestContextMiddleware);
app.use(requestLoggerMiddleware);
app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
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
      } catch {
        callback(null, false);
        return;
      }
      callback(null, false);
    }
  })
);

const uploadsDir = path.resolve(process.cwd(), env.UPLOADS_DIR);
if (!env.S3_ENABLED) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use("/uploads", express.static(uploadsDir, { fallthrough: false }));
}

app.get("/", (_req, res) =>
  res.json({
    ok: true,
    service: "fb-marketing-tools-backend",
    health: "/health",
    api: "/api"
  })
);
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
