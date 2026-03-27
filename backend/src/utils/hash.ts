import crypto from "crypto";

export function sha256Base64Url(input: string): string {
  const digest = crypto.createHash("sha256").update(input, "utf8").digest("base64");
  return digest.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

