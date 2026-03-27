"use strict";
(() => {
  // src/shared/storage.ts
  var CONFIG_KEY = "config";
  async function getConfig() {
    const result = await chrome.storage.local.get(CONFIG_KEY);
    const stored = result[CONFIG_KEY] ?? null;
    return {
      backendBaseUrl: stored?.backendBaseUrl ?? "http://localhost:4000",
      facebookAppId: stored?.facebookAppId ?? ""
    };
  }

  // src/background.ts
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "FB_OAUTH_START") {
      void (async () => {
        try {
          const result = await startFacebookOAuth({ scopes: message.scopes });
          sendResponse({ ok: true, result });
        } catch (err) {
          const message2 = err instanceof Error ? err.message : "Unknown error";
          sendResponse({ ok: false, error: message2 });
        }
      })();
      return true;
    }
    return false;
  });
  async function startFacebookOAuth(params) {
    const config = await getConfig();
    if (!config.facebookAppId) {
      throw new Error("FACEBOOK_APP_ID_NOT_CONFIGURED");
    }
    const redirectUri = chrome.identity.getRedirectURL("fb");
    const scopes = params.scopes ?? ["public_profile", "pages_show_list", "pages_manage_posts", "pages_read_engagement"];
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
})();
//# sourceMappingURL=background.js.map
