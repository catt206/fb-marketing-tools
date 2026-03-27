import { Router } from "express";
import multer from "multer";
import type { Env } from "../config/env.js";
import { createStorageProvider } from "../services/storage.js";

export function uploadsRoutes(params: { env: Env }) {
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter(_req, file, cb) {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowed.includes(file.mimetype)) {
        cb(new Error("UNSUPPORTED_FILE_TYPE"));
        return;
      }
      cb(null, true);
    }
  });

  router.post("/image", upload.single("image"), async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "NO_FILE" });
        return;
      }
      const storage = createStorageProvider({ env: params.env });
      const stored = await storage.putImage({
        buffer: file.buffer,
        contentType: file.mimetype,
        originalName: file.originalname
      });
      res.status(201).json({ url: stored.url, key: stored.key });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
