import crypto from "crypto";
export function decodeAes256KeyFromBase64(keyBase64) {
    const key = Buffer.from(keyBase64, "base64");
    if (key.length !== 32) {
        throw new Error("TOKEN_ENCRYPTION_KEY_BASE64 must be 32 bytes (base64)");
    }
    return key;
}
export function encryptAes256Gcm(params) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", params.key, iv);
    const ciphertext = Buffer.concat([cipher.update(params.plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        ciphertextBase64: ciphertext.toString("base64"),
        ivBase64: iv.toString("base64"),
        tagBase64: tag.toString("base64")
    };
}
export function decryptAes256Gcm(params) {
    const iv = Buffer.from(params.payload.ivBase64, "base64");
    const ciphertext = Buffer.from(params.payload.ciphertextBase64, "base64");
    const tag = Buffer.from(params.payload.tagBase64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", params.key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
}
