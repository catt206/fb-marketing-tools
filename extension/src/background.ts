import { getConfig } from "./shared/storage";

type Message =
  | {
      type: "FB_OAUTH_START";
      scopes?: string[];
    };

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === "FB_OAUTH_START") {
    void (async () => {
      try {
        const result = await startFacebookOAuth({ scopes: message.scopes });
        sendResponse({ ok: true, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        sendResponse({ ok: false, error: message });
      }
    })();
    return true;
  }
  return false;
});

async function startFacebookOAuth(params: { scopes?: string[] }): Promise<{ code: string; redirectUri: string }> {
  const config = await getConfig();
  if (!config.facebookAppId) {
    throw new Error("FACEBOOK_APP_ID_NOT_CONFIGURED");
  }

  const redirectUri = chrome.identity.getRedirectURL("fb");
  const scopes = params.scopes ?? ["public_profile", "pages_show_list", "pages_read_engagement"];

  const authUrl = new URL("https://www.facebook.com/v20.0/dialog/oauth");
  authUrl.searchParams.set("client_id", config.facebookAppId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(","));

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true
  });

  if (!responseUrl) {
    throw new Error("OAUTH_CANCELLED");
  }

  const responseParsed = new URL(responseUrl);
  const code = responseParsed.searchParams.get("code");
  const error = responseParsed.searchParams.get("error_message") ?? responseParsed.searchParams.get("error");

  if (error) throw new Error(error);
  if (!code) throw new Error("NO_CODE_RETURNED");

  return { code, redirectUri };
}
