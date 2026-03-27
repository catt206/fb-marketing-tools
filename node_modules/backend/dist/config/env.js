import { z } from "zod";
const envSchema = z.object({
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z.string().min(1),
    JWT_SECRET: z.string().min(16),
    JWT_EXPIRES_IN: z.string().min(1).default("7d"),
    FACEBOOK_APP_ID: z.string().min(1),
    FACEBOOK_APP_SECRET: z.string().min(1),
    FACEBOOK_API_VERSION: z.string().min(1).default("v20.0"),
    TOKEN_ENCRYPTION_KEY_BASE64: z.string().min(1),
    PUBLIC_BASE_URL: z.string().url().default("http://localhost:4000"),
    UPLOADS_DIR: z.string().min(1).default("uploads"),
    LOG_LEVEL: z.string().min(1).default("info"),
    API_RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(300),
    API_RATE_LIMIT_DURATION_SECONDS: z.coerce.number().int().positive().default(60),
    POSTS_PER_DAY_LIMIT_DEFAULT: z.coerce.number().int().positive().default(10),
    RANDOM_DELAY_MIN_SECONDS: z.coerce.number().int().nonnegative().default(15),
    RANDOM_DELAY_MAX_SECONDS: z.coerce.number().int().positive().default(90),
    S3_ENABLED: z.coerce.boolean().default(false),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_BASE_URL: z.string().url().optional()
});
export function getEnv() {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        const message = result.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join(", ");
        throw new Error(`Invalid environment variables: ${message}`);
    }
    return result.data;
}
