import type { Env } from "../config/env.js";
import { FacebookAccountModel, type FacebookAccount } from "../models/FacebookAccount.js";
import { decodeAes256KeyFromBase64, decryptAes256Gcm, encryptAes256Gcm } from "../utils/encryption.js";

export function decryptUserAccessTokenFromAccount(params: { env: Env; account: FacebookAccount }): string {
  const key = decodeAes256KeyFromBase64(params.env.TOKEN_ENCRYPTION_KEY_BASE64);
  const ciphertext = params.account.userAccessTokenCiphertext;
  const iv = params.account.userAccessTokenIv;
  const tag = params.account.userAccessTokenTag;
  if (!ciphertext || !iv || !tag) {
    throw new Error("FACEBOOK_TOKEN_MISSING");
  }
  return decryptAes256Gcm({ key, payload: { ciphertextBase64: ciphertext, ivBase64: iv, tagBase64: tag } });
}

export async function getUserAccessToken(params: { env: Env; accountId: string }): Promise<string> {
  const accountDoc = await FacebookAccountModel.findById(params.accountId);
  if (!accountDoc) {
    throw new Error("FACEBOOK_ACCOUNT_NOT_FOUND");
  }
  return getUserAccessTokenFromAccountDoc({ env: params.env, accountDoc });
}

export async function getUserAccessTokenFromAccountDoc(params: {
  env: Env;
  accountDoc: {
    save: () => Promise<unknown>;
    userAccessToken?: string | null;
    userAccessTokenCiphertext?: string | null;
    userAccessTokenIv?: string | null;
    userAccessTokenTag?: string | null;
  };
}): Promise<string> {
  const key = decodeAes256KeyFromBase64(params.env.TOKEN_ENCRYPTION_KEY_BASE64);

  const ciphertext = params.accountDoc.userAccessTokenCiphertext ?? undefined;
  const iv = params.accountDoc.userAccessTokenIv ?? undefined;
  const tag = params.accountDoc.userAccessTokenTag ?? undefined;
  if (ciphertext && iv && tag) {
    return decryptAes256Gcm({ key, payload: { ciphertextBase64: ciphertext, ivBase64: iv, tagBase64: tag } });
  }

  const plaintext = params.accountDoc.userAccessToken ?? undefined;
  if (!plaintext) {
    throw new Error("FACEBOOK_TOKEN_MISSING");
  }

  const encrypted = encryptAes256Gcm({ plaintext, key });
  params.accountDoc.userAccessTokenCiphertext = encrypted.ciphertextBase64;
  params.accountDoc.userAccessTokenIv = encrypted.ivBase64;
  params.accountDoc.userAccessTokenTag = encrypted.tagBase64;
  params.accountDoc.userAccessToken = undefined;
  await params.accountDoc.save();

  return plaintext;
}

export function encryptAccessToken(params: { env: Env; userAccessToken: string }): Pick<
  FacebookAccount,
  "userAccessTokenCiphertext" | "userAccessTokenIv" | "userAccessTokenTag"
> {
  const key = decodeAes256KeyFromBase64(params.env.TOKEN_ENCRYPTION_KEY_BASE64);
  const encrypted = encryptAes256Gcm({ plaintext: params.userAccessToken, key });
  return {
    userAccessTokenCiphertext: encrypted.ciphertextBase64,
    userAccessTokenIv: encrypted.ivBase64,
    userAccessTokenTag: encrypted.tagBase64
  };
}
