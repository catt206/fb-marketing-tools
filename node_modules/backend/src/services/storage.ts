import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Env } from "../config/env.js";

export type StoredFile = {
  url: string;
  key: string;
};

export type StorageProvider = {
  putImage: (params: { buffer: Buffer; contentType: string; originalName: string }) => Promise<StoredFile>;
};

export function createStorageProvider(params: { env: Env }): StorageProvider {
  if (params.env.S3_ENABLED) {
    if (!params.env.S3_REGION || !params.env.S3_BUCKET || !params.env.S3_ACCESS_KEY_ID || !params.env.S3_SECRET_ACCESS_KEY) {
      throw new Error("S3 is enabled but missing configuration");
    }
    const s3 = new S3Client({
      region: params.env.S3_REGION,
      credentials: {
        accessKeyId: params.env.S3_ACCESS_KEY_ID,
        secretAccessKey: params.env.S3_SECRET_ACCESS_KEY
      }
    });
    return {
      async putImage(input) {
        const ext = path.extname(input.originalName).toLowerCase();
        const key = `images/${randomUUID()}${ext}`;
        await s3.send(
          new PutObjectCommand({
            Bucket: params.env.S3_BUCKET!,
            Key: key,
            Body: input.buffer,
            ContentType: input.contentType
          })
        );
        const base = params.env.S3_PUBLIC_BASE_URL
          ? params.env.S3_PUBLIC_BASE_URL.replace(/\/+$/, "")
          : `https://${params.env.S3_BUCKET}.s3.${params.env.S3_REGION}.amazonaws.com`;
        return { key, url: `${base}/${key}` };
      }
    };
  }

  const uploadsDir = path.resolve(process.cwd(), params.env.UPLOADS_DIR);
  return {
    async putImage(input) {
      const ext = path.extname(input.originalName).toLowerCase();
      const filename = `${randomUUID()}${ext}`;
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.writeFile(path.join(uploadsDir, filename), input.buffer);

      const url = new URL(params.env.PUBLIC_BASE_URL);
      url.pathname = `/uploads/${encodeURIComponent(filename)}`;
      return { key: filename, url: url.toString() };
    }
  };
}

