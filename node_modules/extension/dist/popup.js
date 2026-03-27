"use strict";
(() => {
  // src/shared/storage.ts
  var CONFIG_KEY = "config";
  var AUTH_KEY = "auth";
  async function getConfig() {
    const result = await chrome.storage.local.get(CONFIG_KEY);
    const stored = result[CONFIG_KEY] ?? null;
    return {
      backendBaseUrl: stored?.backendBaseUrl ?? "http://localhost:4000",
      facebookAppId: stored?.facebookAppId ?? ""
    };
  }
  async function getAuthState() {
    const result = await chrome.storage.local.get(AUTH_KEY);
    const stored = result[AUTH_KEY] ?? null;
    return { jwtToken: stored?.jwtToken ?? null };
  }
  async function setJwtToken(jwtToken) {
    const current = await getAuthState();
    await chrome.storage.local.set({ [AUTH_KEY]: { ...current, jwtToken } });
  }

  // src/shared/api.ts
  var ApiError = class extends Error {
    status;
    payload;
    constructor(params) {
      super(params.message);
      this.status = params.status;
      this.payload = params.payload;
    }
  };
  async function apiFetch(path, init) {
    const [config, auth] = await Promise.all([getConfig(), getAuthState()]);
    const url = new URL(path, config.backendBaseUrl);
    const headers = new Headers(init?.headers ?? {});
    headers.set("content-type", "application/json");
    if (auth.jwtToken) headers.set("authorization", `Bearer ${auth.jwtToken}`);
    const response = await fetch(url.toString(), { ...init, headers });
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = json && typeof json === "object" && json !== null && "message" in json && typeof json.message === "string" ? json.message : `Request failed (${response.status})`;
      throw new ApiError({ status: response.status, message, payload: json });
    }
    return json;
  }

  // src/shared/dom.ts
  function mustGetElement(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element: ${id}`);
    return el;
  }
  function setText(id, text) {
    mustGetElement(id).textContent = text;
  }

  // src/popup.ts
  async function refreshAuthUi() {
    const auth = await getAuthState();
    setText("status", auth.jwtToken ? "\u0110\xE3 \u0111\u0103ng nh\u1EADp" : "Ch\u01B0a \u0111\u0103ng nh\u1EADp");
    mustGetElement("logout").disabled = !auth.jwtToken;
    mustGetElement("connectFb").disabled = !auth.jwtToken;
    mustGetElement("refreshSummary").disabled = !auth.jwtToken;
  }
  async function refreshSummary() {
    const auth = await getAuthState();
    if (!auth.jwtToken) {
      setText("summary", "\u0110\u0103ng nh\u1EADp \u0111\u1EC3 xem analytics.");
      return;
    }
    try {
      const data = await apiFetch("/api/analytics/summary");
      setText(
        "summary",
        `Posted: ${data.summary.posted} | Failed: ${data.summary.failed} | Scheduled: ${data.summary.scheduled}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setText("summary", message);
    }
  }
  function getEmailPassword() {
    const email = mustGetElement("email").value.trim();
    const password = mustGetElement("password").value;
    return { email, password };
  }
  async function login() {
    const { email, password } = getEmailPassword();
    const result = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    await setJwtToken(result.token);
    setText("authMsg", `Xin ch\xE0o ${result.user.email}`);
  }
  async function register() {
    const { email, password } = getEmailPassword();
    const result = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    await setJwtToken(result.token);
    setText("authMsg", `T\u1EA1o t\xE0i kho\u1EA3n & \u0111\u0103ng nh\u1EADp: ${result.user.email}`);
  }
  async function logout() {
    await setJwtToken(null);
    setText("authMsg", "\u0110\xE3 logout");
    setText("fbMsg", "");
    setText("summary", "...");
  }
  async function connectFacebook() {
    setText("fbMsg", "\u0110ang m\u1EDF Facebook Login...");
    const oauthResp = await chrome.runtime.sendMessage({ type: "FB_OAUTH_START" });
    if (!oauthResp?.ok) {
      setText("fbMsg", oauthResp?.error ?? "Kh\xF4ng th\u1EC3 b\u1EAFt \u0111\u1EA7u OAuth");
      return;
    }
    const { code, redirectUri } = oauthResp.result;
    setText("fbMsg", "\u0110ang x\xE1c th\u1EF1c token v\u1EDBi backend...");
    await apiFetch("/api/facebook/connect/exchange", {
      method: "POST",
      body: JSON.stringify({ code, redirectUri })
    });
    setText("fbMsg", "K\u1EBFt n\u1ED1i Facebook th\xE0nh c\xF4ng.");
  }
  async function main() {
    mustGetElement("openOptions").addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
    mustGetElement("login").addEventListener("click", async () => {
      try {
        await login();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setText("authMsg", message);
      } finally {
        await refreshAuthUi();
        await refreshSummary();
      }
    });
    mustGetElement("register").addEventListener("click", async () => {
      try {
        await register();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setText("authMsg", message);
      } finally {
        await refreshAuthUi();
        await refreshSummary();
      }
    });
    mustGetElement("logout").addEventListener("click", async () => {
      await logout();
      await refreshAuthUi();
    });
    mustGetElement("connectFb").addEventListener("click", async () => {
      try {
        await connectFacebook();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setText("fbMsg", message);
      }
    });
    mustGetElement("refreshSummary").addEventListener("click", async () => {
      await refreshSummary();
    });
    await refreshAuthUi();
    await refreshSummary();
  }
  void main();
})();
//# sourceMappingURL=popup.js.map
