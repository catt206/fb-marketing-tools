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
  async function setConfig(config) {
    await chrome.storage.local.set({ [CONFIG_KEY]: config });
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
  async function apiFetch(path, init2) {
    const [config, auth] = await Promise.all([getConfig(), getAuthState()]);
    const url = new URL(path, config.backendBaseUrl);
    const headers = new Headers(init2?.headers ?? {});
    headers.set("content-type", "application/json");
    if (auth.jwtToken) headers.set("authorization", `Bearer ${auth.jwtToken}`);
    const response = await fetch(url.toString(), { ...init2, headers });
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

  // src/options.ts
  var auditCursor = null;
  async function init() {
    const auth = await getAuthState();
    setText("dashStatus", auth.jwtToken ? "AUTHENTICATED" : "NOT_AUTHENTICATED");
    mustGetElement("dashLogout").disabled = !auth.jwtToken;
    if (!auth.jwtToken) {
      setText("accountsMsg", "M\u1EDF popup \u0111\u1EC3 \u0111\u0103ng nh\u1EADp tr\u01B0\u1EDBc.");
      return;
    }
    await Promise.all([loadConfigUi(), loadSettingsUi(), refreshAccounts(), refreshTemplates(), refreshJobs(), refreshAudit(true)]);
    await refreshJobAccountOptions();
  }
  async function loadConfigUi() {
    const config = await getConfig();
    mustGetElement("backendBaseUrl").value = config.backendBaseUrl;
    mustGetElement("facebookAppId").value = config.facebookAppId;
    mustGetElement("saveConfig").addEventListener("click", async () => {
      const backendBaseUrl = mustGetElement("backendBaseUrl").value.trim();
      const facebookAppId = mustGetElement("facebookAppId").value.trim();
      await setConfig({ backendBaseUrl, facebookAppId });
      setText("configMsg", "Saved.");
    });
  }
  async function loadSettingsUi() {
    const data = await apiFetch("/api/settings");
    mustGetElement("postsPerDayLimit").value = `${data.settings.postsPerDayLimit}`;
    mustGetElement("delayMin").value = `${data.settings.randomDelayMinSeconds}`;
    mustGetElement("delayMax").value = `${data.settings.randomDelayMaxSeconds}`;
    mustGetElement("saveSettings").addEventListener("click", async () => {
      const postsPerDayLimit = Number(mustGetElement("postsPerDayLimit").value);
      const randomDelayMinSeconds = Number(mustGetElement("delayMin").value);
      const randomDelayMaxSeconds = Number(mustGetElement("delayMax").value);
      await apiFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ postsPerDayLimit, randomDelayMinSeconds, randomDelayMaxSeconds })
      });
      setText("settingsMsg", "Saved.");
    });
  }
  async function refreshAccounts() {
    try {
      const data = await apiFetch("/api/facebook/accounts");
      renderAccounts(data.accounts);
      setText("accountsMsg", data.accounts.length ? "" : "Ch\u01B0a c\xF3 account n\xE0o.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setText("accountsMsg", message);
    }
  }
  function renderAccounts(accounts) {
    const list = mustGetElement("accountsList");
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
          const action = btn.dataset.action;
          const id = btn.dataset.id;
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
    setText("accountsMsg", "\u0110ang m\u1EDF Facebook Login...");
    const oauthResp = await chrome.runtime.sendMessage({ type: "FB_OAUTH_START" });
    if (!oauthResp?.ok) {
      setText("accountsMsg", oauthResp?.error ?? "Kh\xF4ng th\u1EC3 b\u1EAFt \u0111\u1EA7u OAuth");
      return;
    }
    const { code, redirectUri } = oauthResp.result;
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
      const data = await apiFetch("/api/templates");
      renderTemplates(data.templates);
      await refreshJobTemplateOptions(data.templates);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setText("tplMsg", message);
    }
  }
  function renderTemplates(templates) {
    const list = mustGetElement("templatesList");
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
      const delBtn = el.querySelector("button[data-action='delete']");
      delBtn?.addEventListener("click", async () => {
        await apiFetch(`/api/templates/${encodeURIComponent(tpl._id)}`, { method: "DELETE" });
        await refreshTemplates();
      });
      list.appendChild(el);
    }
  }
  async function createTemplate() {
    const name = mustGetElement("tplName").value.trim();
    const text = mustGetElement("tplText").value;
    const imageUrl = mustGetElement("tplImageUrl").value.trim();
    await apiFetch("/api/templates", {
      method: "POST",
      body: JSON.stringify({ name, text, imageUrl: imageUrl || void 0 })
    });
    mustGetElement("tplName").value = "";
    mustGetElement("tplText").value = "";
    mustGetElement("tplImageUrl").value = "";
    setText("tplMsg", "Created.");
    await refreshTemplates();
  }
  async function spinPreview() {
    const text = mustGetElement("tplText").value;
    const data = await apiFetch("/api/templates/spin/preview", {
      method: "POST",
      body: JSON.stringify({ text })
    });
    setText("tplMsg", `Preview: ${data.result.text} (\u2248${data.result.variantsEstimate} variants)`);
  }
  async function refreshJobAccountOptions() {
    const data = await apiFetch("/api/facebook/accounts");
    const sel = mustGetElement("jobAccount");
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
  async function refreshJobTemplateOptions(templates) {
    const sel = mustGetElement("jobTemplate");
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
  async function loadPagesForAccount(accountId) {
    if (!accountId) return;
    try {
      const data = await apiFetch(
        `/api/facebook/accounts/${encodeURIComponent(accountId)}/pages`
      );
      const sel = mustGetElement("jobPage");
      sel.innerHTML = "";
      for (const p of data.pages) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = `${p.name}${p.hasAccessToken ? "" : " (no token)"}`;
        sel.appendChild(opt);
      }
      setText("jobMsg", data.pages.length ? "" : "Kh\xF4ng t\xECm th\u1EA5y page.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setText("jobMsg", message);
    }
  }
  async function createJob() {
    const accountId = mustGetElement("jobAccount").value;
    const targetType = mustGetElement("jobTargetType").value;
    const targetId = targetType === "PAGE" ? mustGetElement("jobPage").value : mustGetElement("jobGroupId").value.trim();
    const templateId = mustGetElement("jobTemplate").value;
    const imageUrl = mustGetElement("jobImageUrl").value.trim();
    const message = mustGetElement("jobMessage").value;
    const scheduledAt = mustGetElement("jobScheduledAt").value.trim();
    const enableSpin = mustGetElement("jobEnableSpin").checked;
    if (!accountId) throw new Error("ACCOUNT_REQUIRED");
    if (!targetId) throw new Error("TARGET_REQUIRED");
    if (!scheduledAt) throw new Error("SCHEDULED_AT_REQUIRED");
    await apiFetch("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        accountId,
        targetType,
        targetId,
        templateId: templateId || void 0,
        imageUrl: imageUrl || void 0,
        message: message.trim() ? message : void 0,
        scheduledAt,
        enableSpin
      })
    });
    setText("jobMsg", "Scheduled.");
    await refreshJobs();
  }
  async function validateGroup() {
    const accountId = mustGetElement("jobAccount").value;
    const groupId = mustGetElement("jobGroupId").value.trim();
    if (!groupId) {
      setText("jobMsg", "Nh\u1EADp Group ID tr\u01B0\u1EDBc.");
      return;
    }
    const data = await apiFetch("/api/facebook/groups/validate", {
      method: "POST",
      body: JSON.stringify({ accountId, groupId })
    });
    setText("jobMsg", `Group: ${data.group.name ?? data.group.id} (${data.group.privacy ?? "unknown"})`);
  }
  async function refreshJobs() {
    try {
      const status = mustGetElement("jobsFilter").value;
      const q = status ? `?status=${encodeURIComponent(status)}` : "";
      const data = await apiFetch(`/api/jobs${q}`);
      renderJobs(data.jobs);
      setText("jobsMsg", "");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setText("jobsMsg", message);
    }
  }
  async function refreshAudit(reset) {
    try {
      if (reset) {
        auditCursor = null;
        mustGetElement("auditList").innerHTML = "";
      }
      const q = new URLSearchParams();
      q.set("limit", "50");
      if (auditCursor) q.set("cursor", auditCursor);
      const data = await apiFetch(`/api/audit?${q.toString()}`);
      renderAuditLogs(data.logs);
      auditCursor = data.nextCursor;
      setText("auditMsg", auditCursor ? "" : "End.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setText("auditMsg", message);
    }
  }
  function renderAuditLogs(logs) {
    const list = mustGetElement("auditList");
    for (const log of logs) {
      const el = document.createElement("div");
      el.className = "item";
      const title = `${log.action} | ${log.status}`;
      const sub = `${new Date(log.createdAt).toLocaleString()}${log.entityType ? ` | ${log.entityType}` : ""}${log.entityId ? `:${log.entityId}` : ""}`;
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
  function renderJobs(jobs) {
    const list = mustGetElement("jobsList");
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
      const runBtn = el.querySelector("button[data-action='run']");
      const cancelBtn = el.querySelector("button[data-action='cancel']");
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
  function escapeHtml(input) {
    return input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  mustGetElement("connectFbDash").addEventListener("click", async () => {
    try {
      await connectFacebook();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setText("accountsMsg", message);
    }
  });
  mustGetElement("tplCreate").addEventListener("click", async () => {
    try {
      await createTemplate();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setText("tplMsg", message);
    }
  });
  mustGetElement("tplSpinPreview").addEventListener("click", async () => {
    try {
      await spinPreview();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setText("tplMsg", message);
    }
  });
  mustGetElement("jobCreate").addEventListener("click", async () => {
    try {
      await createJob();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setText("jobMsg", message);
    }
  });
  mustGetElement("jobValidateGroup").addEventListener("click", async () => {
    try {
      await validateGroup();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setText("jobMsg", message);
    }
  });
  mustGetElement("jobsRefresh").addEventListener("click", async () => {
    await refreshJobs();
  });
  mustGetElement("jobsFilter").addEventListener("change", async () => {
    await refreshJobs();
  });
  mustGetElement("auditRefresh").addEventListener("click", async () => {
    await refreshAudit(true);
  });
  mustGetElement("auditMore").addEventListener("click", async () => {
    await refreshAudit(false);
  });
  mustGetElement("dashLogout").addEventListener("click", async () => {
    await setJwtToken(null);
    location.reload();
  });
  mustGetElement("jobTargetType").addEventListener("change", async () => {
    const targetType = mustGetElement("jobTargetType").value;
    const isPage = targetType === "PAGE";
    mustGetElement("jobPage").disabled = !isPage;
    mustGetElement("jobGroupId").disabled = isPage;
  });
  void init();
})();
//# sourceMappingURL=options.js.map
