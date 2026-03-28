import { apiFetch } from "./shared/api";
import { mustGetElement, setText } from "./shared/dom";
import { getAuthState, getConfig, setConfig, setJwtToken } from "./shared/storage";

type FacebookAccount = {
  _id: string;
  name: string;
  fbUserId: string;
  scopes: string[];
  tokenExpiresAt: string;
};

type Template = { _id: string; name: string; text: string; imageUrl?: string };

type Settings = {
  postsPerDayLimit: number;
  randomDelayMinSeconds: number;
  randomDelayMaxSeconds: number;
};

type Job = {
  _id: string;
  accountId: string;
  targetType: "PAGE" | "GROUP";
  targetId: string;
  message: string;
  imageUrl?: string;
  scheduledAt: string;
  nextRunAt: string;
  status: string;
  fbPostId?: string;
  lastError?: string;
};

type AuditLog = {
  _id: string;
  createdAt: string;
  action: string;
  status: "SUCCESS" | "FAIL";
  entityType?: string;
  entityId?: string;
  message?: string;
};

let auditCursor: string | null = null;

async function init() {
  await loadConfigUi();

  const auth = await getAuthState();
  setText("dashStatus", auth.jwtToken ? "AUTHENTICATED" : "NOT_AUTHENTICATED");
  mustGetElement<HTMLButtonElement>("dashLogout").disabled = !auth.jwtToken;
  if (!auth.jwtToken) {
    setText("accountsMsg", "Mở popup để đăng nhập trước.");
    return;
  }

  await Promise.all([loadSettingsUi(), refreshAccounts(), refreshTemplates(), refreshJobs(), refreshAudit(true)]);
  await refreshJobAccountOptions();
}

async function loadConfigUi() {
  const config = await getConfig();
  mustGetElement<HTMLInputElement>("backendBaseUrl").value = config.backendBaseUrl;
  mustGetElement<HTMLInputElement>("facebookAppId").value = config.facebookAppId;

  mustGetElement<HTMLButtonElement>("saveConfig").addEventListener("click", async () => {
    try {
      const backendBaseUrl = mustGetElement<HTMLInputElement>("backendBaseUrl").value.trim();
      const facebookAppId = mustGetElement<HTMLInputElement>("facebookAppId").value.trim();
      await setConfig({ backendBaseUrl, facebookAppId });
      setText("configMsg", "Saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setText("configMsg", message);
    }
  });
}

async function loadSettingsUi() {
  const data = await apiFetch<{ settings: Settings }>("/api/settings");
  mustGetElement<HTMLInputElement>("postsPerDayLimit").value = `${data.settings.postsPerDayLimit}`;
  mustGetElement<HTMLInputElement>("delayMin").value = `${data.settings.randomDelayMinSeconds}`;
  mustGetElement<HTMLInputElement>("delayMax").value = `${data.settings.randomDelayMaxSeconds}`;

  mustGetElement<HTMLButtonElement>("saveSettings").addEventListener("click", async () => {
    const postsPerDayLimit = Number(mustGetElement<HTMLInputElement>("postsPerDayLimit").value);
    const randomDelayMinSeconds = Number(mustGetElement<HTMLInputElement>("delayMin").value);
    const randomDelayMaxSeconds = Number(mustGetElement<HTMLInputElement>("delayMax").value);
    await apiFetch<{ settings: Settings }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ postsPerDayLimit, randomDelayMinSeconds, randomDelayMaxSeconds })
    });
    setText("settingsMsg", "Saved.");
  });
}

async function refreshAccounts() {
  try {
    const data = await apiFetch<{ accounts: FacebookAccount[] }>("/api/facebook/accounts");
    renderAccounts(data.accounts);
    setText("accountsMsg", data.accounts.length ? "" : "Chưa có account nào.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setText("accountsMsg", message);
  }
}

function renderAccounts(accounts: FacebookAccount[]) {
  const list = mustGetElement<HTMLDivElement>("accountsList");
  list.innerHTML = "";
  for (const acc of accounts) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="meta">
        <div>${escapeHtml(acc.name)} <span class="badge">${escapeHtml(acc.fbUserId)}</span></div>
        <div class="muted">Scopes: ${escapeHtml(acc.scopes?.join(", ") ?? "")}</div>
      </div>
      <div class="row" style="align-items:flex-start">
        <button data-action="pages" data-id="${acc._id}">Pages</button>
        <button class="danger" data-action="delete" data-id="${acc._id}">Remove</button>
      </div>
    `;
    el.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = (btn as HTMLButtonElement).dataset.action;
        const id = (btn as HTMLButtonElement).dataset.id;
        if (!action || !id) return;
        if (action === "delete") {
          await apiFetch(`/api/facebook/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
          await refreshAccounts();
          await refreshJobAccountOptions();
        } else if (action === "pages") {
          await loadPagesForAccount(id);
        }
      });
    });
    list.appendChild(el);
  }
}

async function connectFacebook() {
  setText("accountsMsg", "Đang mở Facebook Login...");
  const oauthResp = await chrome.runtime.sendMessage({ type: "FB_OAUTH_START" });
  if (!oauthResp?.ok) {
    setText("accountsMsg", oauthResp?.error ?? "Không thể bắt đầu OAuth");
    return;
  }
  const { code, redirectUri } = oauthResp.result as { code: string; redirectUri: string };
  await apiFetch("/api/facebook/connect/exchange", {
    method: "POST",
    body: JSON.stringify({ code, redirectUri })
  });
  setText("accountsMsg", "Connected.");
  await refreshAccounts();
  await refreshJobAccountOptions();
}

async function refreshTemplates() {
  try {
    const data = await apiFetch<{ templates: Template[] }>("/api/templates");
    renderTemplates(data.templates);
    await refreshJobTemplateOptions(data.templates);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setText("tplMsg", message);
  }
}

function renderTemplates(templates: Template[]) {
  const list = mustGetElement<HTMLDivElement>("templatesList");
  list.innerHTML = "";
  for (const tpl of templates) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="meta">
        <div>${escapeHtml(tpl.name)}</div>
        <div class="muted">${escapeHtml(tpl.text.slice(0, 160))}${tpl.text.length > 160 ? "..." : ""}</div>
      </div>
      <div class="row" style="align-items:flex-start">
        <button class="danger" data-action="delete" data-id="${tpl._id}">Delete</button>
      </div>
    `;
    const delBtn = el.querySelector("button[data-action='delete']") as HTMLButtonElement | null;
    delBtn?.addEventListener("click", async () => {
      await apiFetch(`/api/templates/${encodeURIComponent(tpl._id)}`, { method: "DELETE" });
      await refreshTemplates();
    });
    list.appendChild(el);
  }
}

async function createTemplate() {
  const name = mustGetElement<HTMLInputElement>("tplName").value.trim();
  const text = mustGetElement<HTMLTextAreaElement>("tplText").value;
  const imageUrl = mustGetElement<HTMLInputElement>("tplImageUrl").value.trim();
  await apiFetch<{ template: Template }>("/api/templates", {
    method: "POST",
    body: JSON.stringify({ name, text, imageUrl: imageUrl || undefined })
  });
  mustGetElement<HTMLInputElement>("tplName").value = "";
  mustGetElement<HTMLTextAreaElement>("tplText").value = "";
  mustGetElement<HTMLInputElement>("tplImageUrl").value = "";
  setText("tplMsg", "Created.");
  await refreshTemplates();
}

async function spinPreview() {
  const text = mustGetElement<HTMLTextAreaElement>("tplText").value;
  const data = await apiFetch<{ result: { text: string; variantsEstimate: number } }>("/api/templates/spin/preview", {
    method: "POST",
    body: JSON.stringify({ text })
  });
  setText("tplMsg", `Preview: ${data.result.text} (≈${data.result.variantsEstimate} variants)`);
}

async function refreshJobAccountOptions() {
  const data = await apiFetch<{ accounts: FacebookAccount[] }>("/api/facebook/accounts");
  const sel = mustGetElement<HTMLSelectElement>("jobAccount");
  sel.innerHTML = "";
  for (const acc of data.accounts) {
    const opt = document.createElement("option");
    opt.value = acc._id;
    opt.textContent = `${acc.name} (${acc.fbUserId})`;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", async () => {
    await loadPagesForAccount(sel.value);
  });
  if (data.accounts[0]) {
    await loadPagesForAccount(data.accounts[0]._id);
  }
}

async function refreshJobTemplateOptions(templates: Template[]) {
  const sel = mustGetElement<HTMLSelectElement>("jobTemplate");
  const current = sel.value;
  sel.innerHTML = `<option value="">(none)</option>`;
  for (const tpl of templates) {
    const opt = document.createElement("option");
    opt.value = tpl._id;
    opt.textContent = tpl.name;
    sel.appendChild(opt);
  }
  if (current) sel.value = current;
}

async function loadPagesForAccount(accountId: string) {
  if (!accountId) return;
  try {
    const data = await apiFetch<{ pages: { id: string; name: string; hasAccessToken: boolean }[] }>(
      `/api/facebook/accounts/${encodeURIComponent(accountId)}/pages`
    );
    const sel = mustGetElement<HTMLSelectElement>("jobPage");
    sel.innerHTML = "";
    for (const p of data.pages) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name}${p.hasAccessToken ? "" : " (no token)"}`;
      sel.appendChild(opt);
    }
    setText("jobMsg", data.pages.length ? "" : "Không tìm thấy page.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setText("jobMsg", message);
  }
}

async function createJob() {
  const accountId = mustGetElement<HTMLSelectElement>("jobAccount").value;
  const targetType = mustGetElement<HTMLSelectElement>("jobTargetType").value as "PAGE" | "GROUP";
  const targetId =
    targetType === "PAGE" ? mustGetElement<HTMLSelectElement>("jobPage").value : mustGetElement<HTMLInputElement>("jobGroupId").value.trim();
  const templateId = mustGetElement<HTMLSelectElement>("jobTemplate").value;
  const imageUrl = mustGetElement<HTMLInputElement>("jobImageUrl").value.trim();
  const message = mustGetElement<HTMLTextAreaElement>("jobMessage").value;
  const scheduledAt = mustGetElement<HTMLInputElement>("jobScheduledAt").value.trim();
  const enableSpin = mustGetElement<HTMLInputElement>("jobEnableSpin").checked;

  if (!accountId) throw new Error("ACCOUNT_REQUIRED");
  if (!targetId) throw new Error("TARGET_REQUIRED");
  if (!scheduledAt) throw new Error("SCHEDULED_AT_REQUIRED");

  await apiFetch("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      accountId,
      targetType,
      targetId,
      templateId: templateId || undefined,
      imageUrl: imageUrl || undefined,
      message: message.trim() ? message : undefined,
      scheduledAt,
      enableSpin
    })
  });
  setText("jobMsg", "Scheduled.");
  await refreshJobs();
}

async function validateGroup() {
  const accountId = mustGetElement<HTMLSelectElement>("jobAccount").value;
  const groupId = mustGetElement<HTMLInputElement>("jobGroupId").value.trim();
  if (!groupId) {
    setText("jobMsg", "Nhập Group ID trước.");
    return;
  }
  const data = await apiFetch<{ group: { id: string; name?: string; privacy?: string } }>("/api/facebook/groups/validate", {
    method: "POST",
    body: JSON.stringify({ accountId, groupId })
  });
  setText("jobMsg", `Group: ${data.group.name ?? data.group.id} (${data.group.privacy ?? "unknown"})`);
}

async function refreshJobs() {
  try {
    const status = mustGetElement<HTMLSelectElement>("jobsFilter").value;
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    const data = await apiFetch<{ jobs: Job[] }>(`/api/jobs${q}`);
    renderJobs(data.jobs);
    setText("jobsMsg", "");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setText("jobsMsg", message);
  }
}

async function refreshAudit(reset: boolean) {
  try {
    if (reset) {
      auditCursor = null;
      mustGetElement<HTMLDivElement>("auditList").innerHTML = "";
    }
    const q = new URLSearchParams();
    q.set("limit", "50");
    if (auditCursor) q.set("cursor", auditCursor);
    const data = await apiFetch<{ logs: AuditLog[]; nextCursor: string | null }>(`/api/audit?${q.toString()}`);
    renderAuditLogs(data.logs);
    auditCursor = data.nextCursor;
    setText("auditMsg", auditCursor ? "" : "End.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setText("auditMsg", message);
  }
}

function renderAuditLogs(logs: AuditLog[]) {
  const list = mustGetElement<HTMLDivElement>("auditList");
  for (const log of logs) {
    const el = document.createElement("div");
    el.className = "item";
    const title = `${log.action} | ${log.status}`;
    const sub = `${new Date(log.createdAt).toLocaleString()}${log.entityType ? ` | ${log.entityType}` : ""}${
      log.entityId ? `:${log.entityId}` : ""
    }`;
    el.innerHTML = `
      <div class="meta">
        <div>${escapeHtml(title)} <span class="badge">${escapeHtml(log.status)}</span></div>
        <div class="muted">${escapeHtml(sub)}</div>
        <div class="muted">${escapeHtml(log.message ?? "")}</div>
      </div>
    `;
    list.appendChild(el);
  }
}

function renderJobs(jobs: Job[]) {
  const list = mustGetElement<HTMLDivElement>("jobsList");
  list.innerHTML = "";
  for (const j of jobs) {
    const el = document.createElement("div");
    el.className = "item";
    const title = `${j.targetType}:${j.targetId}`;
    const sub = `${new Date(j.nextRunAt).toLocaleString()} | ${j.status}${j.lastError ? ` | ${j.lastError}` : ""}`;
    el.innerHTML = `
      <div class="meta">
        <div>${escapeHtml(title)} <span class="badge">${escapeHtml(j.status)}</span></div>
        <div class="muted">${escapeHtml(sub)}</div>
        <div class="muted">${escapeHtml(j.message.slice(0, 160))}${j.message.length > 160 ? "..." : ""}</div>
      </div>
      <div class="row" style="align-items:flex-start">
        <button data-action="run" data-id="${j._id}">Run now</button>
        <button class="danger" data-action="cancel" data-id="${j._id}">Cancel</button>
      </div>
    `;
    const runBtn = el.querySelector("button[data-action='run']") as HTMLButtonElement | null;
    const cancelBtn = el.querySelector("button[data-action='cancel']") as HTMLButtonElement | null;
    runBtn?.addEventListener("click", async () => {
      await apiFetch(`/api/jobs/${encodeURIComponent(j._id)}/run-now`, { method: "POST" });
      await refreshJobs();
    });
    cancelBtn?.addEventListener("click", async () => {
      await apiFetch(`/api/jobs/${encodeURIComponent(j._id)}/cancel`, { method: "POST" });
      await refreshJobs();
    });
    list.appendChild(el);
  }
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

mustGetElement<HTMLButtonElement>("connectFbDash").addEventListener("click", async () => {
  try {
    await connectFacebook();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setText("accountsMsg", message);
  }
});

mustGetElement<HTMLButtonElement>("tplCreate").addEventListener("click", async () => {
  try {
    await createTemplate();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setText("tplMsg", message);
  }
});

mustGetElement<HTMLButtonElement>("tplSpinPreview").addEventListener("click", async () => {
  try {
    await spinPreview();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setText("tplMsg", message);
  }
});

mustGetElement<HTMLButtonElement>("jobCreate").addEventListener("click", async () => {
  try {
    await createJob();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setText("jobMsg", message);
  }
});

mustGetElement<HTMLButtonElement>("jobValidateGroup").addEventListener("click", async () => {
  try {
    await validateGroup();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setText("jobMsg", message);
  }
});

mustGetElement<HTMLButtonElement>("jobsRefresh").addEventListener("click", async () => {
  await refreshJobs();
});

mustGetElement<HTMLSelectElement>("jobsFilter").addEventListener("change", async () => {
  await refreshJobs();
});

mustGetElement<HTMLButtonElement>("auditRefresh").addEventListener("click", async () => {
  await refreshAudit(true);
});

mustGetElement<HTMLButtonElement>("auditMore").addEventListener("click", async () => {
  await refreshAudit(false);
});

mustGetElement<HTMLButtonElement>("dashLogout").addEventListener("click", async () => {
  await setJwtToken(null);
  location.reload();
});

mustGetElement<HTMLSelectElement>("jobTargetType").addEventListener("change", async () => {
  const targetType = mustGetElement<HTMLSelectElement>("jobTargetType").value;
  const isPage = targetType === "PAGE";
  mustGetElement<HTMLSelectElement>("jobPage").disabled = !isPage;
  mustGetElement<HTMLInputElement>("jobGroupId").disabled = isPage;
});

void init();
