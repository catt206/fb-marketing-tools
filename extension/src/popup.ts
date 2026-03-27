import { apiFetch } from "./shared/api";
import { mustGetElement, setText } from "./shared/dom";
import { getAuthState, setJwtToken } from "./shared/storage";

type LoginResponse = { token: string; user: { email: string } };

async function refreshAuthUi() {
  const auth = await getAuthState();
  setText("status", auth.jwtToken ? "Đã đăng nhập" : "Chưa đăng nhập");

  mustGetElement<HTMLButtonElement>("logout").disabled = !auth.jwtToken;
  mustGetElement<HTMLButtonElement>("connectFb").disabled = !auth.jwtToken;
  mustGetElement<HTMLButtonElement>("refreshSummary").disabled = !auth.jwtToken;
}

async function refreshSummary() {
  const auth = await getAuthState();
  if (!auth.jwtToken) {
    setText("summary", "Đăng nhập để xem analytics.");
    return;
  }
  try {
    const data = await apiFetch<{ summary: { posted: number; failed: number; scheduled: number } }>("/api/analytics/summary");
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
  const email = mustGetElement<HTMLInputElement>("email").value.trim();
  const password = mustGetElement<HTMLInputElement>("password").value;
  return { email, password };
}

async function login() {
  const { email, password } = getEmailPassword();
  const result = await apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  await setJwtToken(result.token);
  setText("authMsg", `Xin chào ${result.user.email}`);
}

async function register() {
  const { email, password } = getEmailPassword();
  const result = await apiFetch<LoginResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  await setJwtToken(result.token);
  setText("authMsg", `Tạo tài khoản & đăng nhập: ${result.user.email}`);
}

async function logout() {
  await setJwtToken(null);
  setText("authMsg", "Đã logout");
  setText("fbMsg", "");
  setText("summary", "...");
}

async function connectFacebook() {
  setText("fbMsg", "Đang mở Facebook Login...");
  const oauthResp = await chrome.runtime.sendMessage({ type: "FB_OAUTH_START" });
  if (!oauthResp?.ok) {
    setText("fbMsg", oauthResp?.error ?? "Không thể bắt đầu OAuth");
    return;
  }
  const { code, redirectUri } = oauthResp.result as { code: string; redirectUri: string };
  setText("fbMsg", "Đang xác thực token với backend...");
  await apiFetch("/api/facebook/connect/exchange", {
    method: "POST",
    body: JSON.stringify({ code, redirectUri })
  });
  setText("fbMsg", "Kết nối Facebook thành công.");
}

async function main() {
  mustGetElement<HTMLButtonElement>("openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  mustGetElement<HTMLButtonElement>("login").addEventListener("click", async () => {
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

  mustGetElement<HTMLButtonElement>("register").addEventListener("click", async () => {
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

  mustGetElement<HTMLButtonElement>("logout").addEventListener("click", async () => {
    await logout();
    await refreshAuthUi();
  });

  mustGetElement<HTMLButtonElement>("connectFb").addEventListener("click", async () => {
    try {
      await connectFacebook();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setText("fbMsg", message);
    }
  });

  mustGetElement<HTMLButtonElement>("refreshSummary").addEventListener("click", async () => {
    await refreshSummary();
  });

  await refreshAuthUi();
  await refreshSummary();
}

void main();

