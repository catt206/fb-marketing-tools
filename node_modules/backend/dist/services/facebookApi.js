import { z } from "zod";
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
async function fetchFacebookJson(url, init) {
    const response = await fetch(url, init);
    const json = (await response.json());
    const errorParsed = fbErrorSchema.safeParse(json);
    if (!response.ok || errorParsed.success) {
        const message = errorParsed.success ? errorParsed.data.error.message : `Facebook API error (${response.status})`;
        throw new Error(message);
    }
    return json;
}
export async function exchangeCodeForUserToken(params) {
    const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/oauth/access_token`);
    url.searchParams.set("client_id", params.config.appId);
    url.searchParams.set("client_secret", params.config.appSecret);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("code", params.code);
    return fetchFacebookJson(url.toString());
}
export async function exchangeForLongLivedUserToken(params) {
    const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/oauth/access_token`);
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", params.config.appId);
    url.searchParams.set("client_secret", params.config.appSecret);
    url.searchParams.set("fb_exchange_token", params.shortLivedUserAccessToken);
    return fetchFacebookJson(url.toString());
}
export async function getMe(params) {
    const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/me`);
    url.searchParams.set("fields", "id,name");
    url.searchParams.set("access_token", params.userAccessToken);
    return fetchFacebookJson(url.toString());
}
export async function debugUserToken(params) {
    const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/debug_token`);
    url.searchParams.set("input_token", params.userAccessToken);
    url.searchParams.set("access_token", `${params.config.appId}|${params.config.appSecret}`);
    return fetchFacebookJson(url.toString());
}
export async function getMyPages(params) {
    const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/me/accounts`);
    url.searchParams.set("fields", "id,name,access_token");
    url.searchParams.set("access_token", params.userAccessToken);
    const result = await fetchFacebookJson(url.toString());
    return result.data ?? [];
}
export async function createPageTextPost(params) {
    const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/${params.pageId}/feed`);
    url.searchParams.set("message", params.message);
    url.searchParams.set("access_token", params.pageAccessToken);
    return fetchFacebookJson(url.toString(), { method: "POST" });
}
export async function createPagePhotoPost(params) {
    const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/${params.pageId}/photos`);
    url.searchParams.set("url", params.imageUrl);
    url.searchParams.set("caption", params.caption);
    url.searchParams.set("published", "true");
    url.searchParams.set("access_token", params.pageAccessToken);
    return fetchFacebookJson(url.toString(), { method: "POST" });
}
export async function createGroupTextPost(params) {
    const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/${params.groupId}/feed`);
    url.searchParams.set("message", params.message);
    url.searchParams.set("access_token", params.userAccessToken);
    return fetchFacebookJson(url.toString(), { method: "POST" });
}
export async function getGroupBasicInfo(params) {
    const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/${params.groupId}`);
    url.searchParams.set("fields", "id,name,privacy");
    url.searchParams.set("access_token", params.userAccessToken);
    return fetchFacebookJson(url.toString());
}
export async function getBasicEngagement(params) {
    const url = new URL(`https://graph.facebook.com/${params.config.apiVersion}/${params.postId}`);
    url.searchParams.set("fields", "reactions.summary(true).limit(0),comments.summary(true).limit(0)");
    url.searchParams.set("access_token", params.accessToken);
    const result = await fetchFacebookJson(url.toString());
    return {
        reactions: result.reactions?.summary?.total_count ?? 0,
        comments: result.comments?.summary?.total_count ?? 0
    };
}
