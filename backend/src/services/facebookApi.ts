import { z } from "zod";

export type FacebookApiConfig = {
  appId: string;
  appSecret: string;
  apiVersion: string;
};

const fbErrorSchema = z
  .object({
    error: z.object({
      message: z.string(),
      type: z.string().optional(),
      code: z.number().optional(),
      error_subcode: z.number().optional(),
      fbtrace_id: z.string().optional()
    })
  })
  .passthrough();

async function fetchFacebookJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = (await response.json()) as unknown;

  const errorParsed = fbErrorSchema.safeParse(json);
  if (!response.ok || errorParsed.success) {
    const message = errorParsed.success ? errorParsed.data.error.message : `Facebook API error (${response.status})`;
    throw new Error(message);
  }
  return json as T;
}

export type FacebookTokenExchangeResult = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export async function exchangeCodeForUserToken(params: {
  config: FacebookApiConfig;
  code: string;
  redirectUri: string;
}): Promise<FacebookTokenExchangeResult> {
  const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/oauth/access_token`);
  url.searchParams.set("client_id", params.config.appId);
  url.searchParams.set("client_secret", params.config.appSecret);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("code", params.code);
  return fetchFacebookJson<FacebookTokenExchangeResult>(url.toString());
}

export type FacebookLongLivedTokenResult = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export async function exchangeForLongLivedUserToken(params: {
  config: FacebookApiConfig;
  shortLivedUserAccessToken: string;
}): Promise<FacebookLongLivedTokenResult> {
  const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", params.config.appId);
  url.searchParams.set("client_secret", params.config.appSecret);
  url.searchParams.set("fb_exchange_token", params.shortLivedUserAccessToken);
  return fetchFacebookJson<FacebookLongLivedTokenResult>(url.toString());
}

export type FacebookMeResult = {
  id: string;
  name: string;
};

export async function getMe(params: { config: FacebookApiConfig; userAccessToken: string }): Promise<FacebookMeResult> {
  const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/me`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", params.userAccessToken);
  return fetchFacebookJson<FacebookMeResult>(url.toString());
}

export type FacebookDebugTokenResult = {
  data: {
    app_id: string;
    is_valid: boolean;
    user_id?: string;
    scopes?: string[];
    expires_at?: number;
  };
};

export async function debugUserToken(params: {
  config: FacebookApiConfig;
  userAccessToken: string;
}): Promise<FacebookDebugTokenResult> {
  const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/debug_token`);
  url.searchParams.set("input_token", params.userAccessToken);
  url.searchParams.set("access_token", `${params.config.appId}|${params.config.appSecret}`);
  return fetchFacebookJson<FacebookDebugTokenResult>(url.toString());
}

export type FacebookPage = { id: string; name: string; access_token?: string };

export async function getMyPages(params: {
  config: FacebookApiConfig;
  userAccessToken: string;
}): Promise<FacebookPage[]> {
  const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("access_token", params.userAccessToken);
  const result = await fetchFacebookJson<{ data: FacebookPage[] }>(url.toString());
  return result.data ?? [];
}

export async function createPageTextPost(params: {
  config: FacebookApiConfig;
  pageId: string;
  pageAccessToken: string;
  message: string;
}): Promise<{ id: string }> {
  const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/${params.pageId}/feed`);
  url.searchParams.set("message", params.message);
  url.searchParams.set("access_token", params.pageAccessToken);
  return fetchFacebookJson<{ id: string }>(url.toString(), { method: "POST" });
}

export async function createPagePhotoPost(params: {
  config: FacebookApiConfig;
  pageId: string;
  pageAccessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<{ id: string; post_id?: string }> {
  const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/${params.pageId}/photos`);
  url.searchParams.set("url", params.imageUrl);
  url.searchParams.set("caption", params.caption);
  url.searchParams.set("published", "true");
  url.searchParams.set("access_token", params.pageAccessToken);
  return fetchFacebookJson<{ id: string; post_id?: string }>(url.toString(), { method: "POST" });
}

export async function createGroupTextPost(params: {
  config: FacebookApiConfig;
  groupId: string;
  userAccessToken: string;
  message: string;
}): Promise<{ id: string }> {
  const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/${params.groupId}/feed`);
  url.searchParams.set("message", params.message);
  url.searchParams.set("access_token", params.userAccessToken);
  return fetchFacebookJson<{ id: string }>(url.toString(), { method: "POST" });
}

export async function getGroupBasicInfo(params: {
  config: FacebookApiConfig;
  groupId: string;
  userAccessToken: string;
}): Promise<{ id: string; name?: string; privacy?: string }> {
  const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/${params.groupId}`);
  url.searchParams.set("fields", "id,name,privacy");
  url.searchParams.set("access_token", params.userAccessToken);
  return fetchFacebookJson<{ id: string; name?: string; privacy?: string }>(url.toString());
}

export async function getBasicEngagement(params: {
  config: FacebookApiConfig;
  postId: string;
  accessToken: string;
}): Promise<{ reactions: number; comments: number }> {
  const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/${params.postId}`);
  url.searchParams.set("fields", "reactions.summary(true).limit(0),comments.summary(true).limit(0)");
  url.searchParams.set("access_token", params.accessToken);
  const result = await fetchFacebookJson<{
    reactions?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
  }>(url.toString());
  return {
    reactions: result.reactions?.summary?.total_count ?? 0,
    comments: result.comments?.summary?.total_count ?? 0
  };
}
