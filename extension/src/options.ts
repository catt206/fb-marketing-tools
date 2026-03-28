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

type SavedGroup = {
  _id: string;
  groupId: string;
  name?: string;
  postedBefore: boolean;
};

let auditCursor: string | null = null;
let savedGroups: SavedGroup[] = [];

async function uploadImageFromFileInput(params: { fileInputId: string; urlInputId: string; msgId: string }) {
  const fileInput = mustGetElement<HTMLInputElement>(params.fileInputId);
  const file = fileInput.files?.[0];
  if (!file) {
    setText(params.msgId, "Chọn file ảnh trước.");
    return;
  }

  const [config, auth] = await Promise.all([getConfig(), getAuthState()]);
  if (!auth.jwtToken) {
    setText(params.msgId, "Mở popup để đăng nhập trước.");
    return;
  }

  const formData = new FormData();
  formData.append("image", file, file.name);

  const url = new URL("/api/uploads/image", config.backendBaseUrl).toString();
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${auth.jwtToken}` },
    body: formData
  });

  const json = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    const message = (json && typeof json === "object" && json && typeof json.error === "string" ? json.error : null) ?? `Upload failed (${response.status})`;
    setText(params.msgId, message);
    return;
  }

  mustGetElement<HTMLInputElement>(params.urlInputId).value = typeof json?.url === "string" ? json.url : "";
  setText(params.msgId, "Uploaded.");
}

function buildRealEstateTemplate() {
  const zones: string[] = [];
  if (mustGetElement<HTMLInputElement>("reZoneRainbow").checked) zones.push("Rainbow");
  if (mustGetElement<HTMLInputElement>("reZoneOri").checked) zones.push("Ori");
  if (mustGetElement<HTMLInputElement>("reZoneBs").checked) zones.push("BS");
  if (mustGetElement<HTMLInputElement>("reZoneGh").checked) zones.push("GH");
  if (mustGetElement<HTMLInputElement>("reZoneLbv").checked) zones.push("LBV");
  if (mustGetElement<HTMLInputElement>("reZoneMcp").checked) zones.push("MCP");
  if (mustGetElement<HTMLInputElement>("reZoneBe").checked) zones.push("BE");

  if (zones.length === 0) {
    throw new Error("Chọn ít nhất 1 phân khu.");
  }

  const unitType = mustGetElement<HTMLSelectElement>("reUnitType").value.trim();
  const interior = mustGetElement<HTMLSelectElement>("reInterior").value.trim();
  const direction = mustGetElement<HTMLSelectElement>("reDirection").value.trim();
  const priceRaw = mustGetElement<HTMLInputElement>("rePrice").value.trim();
  const contactRaw = mustGetElement<HTMLInputElement>("reContact").value.trim();
  const noteRaw = mustGetElement<HTMLTextAreaElement>("reNote").value.trim();

  const zonesText = zones.map((z) => `phân khu ${z}`).join(", ");
  const price = priceRaw ? priceRaw : "{giá tốt|giá thương lượng|inbox}";
  const contact = contactRaw ? contactRaw : "{Inbox|Liên hệ} để nhận thông tin";
  const note = noteRaw ? noteRaw : "{nhà đẹp|view thoáng|tầng đẹp|nhận nhà ngay}";

  const title = `BĐS - ${zones.join("/")}-${unitType}-${interior}-${direction}`;
  const text = [
    `🏢 {CHO THUÊ|BÁN} {căn hộ|căn} ${unitType.toUpperCase()} (${zonesText})`,
    `✨ Nội thất: ${interior}`,
    `🧭 Hướng: ${direction}`,
    `💰 Giá: ${price}`,
    `📝 ${note}`,
    `☎️ ${contact}`
  ].join("\n");

  return { title, text };
}

async function init() {
  await loadConfigUi();

  const auth = await getAuthState();
  setText("dashStatus", auth.jwtToken ? "AUTHENTICATED" : "NOT_AUTHENTICATED");
  mustGetElement<HTMLButtonElement>("dashLogout").disabled = !auth.jwtToken;
  if (!auth.jwtToken) {
    setText("accountsMsg", "Mở popup để đăng nhập trước.");
    return;
  }

  await Promise.all([loadSettingsUi(), refreshAccounts(), refreshTemplates(), refreshJobs(), refreshAudit(true), refreshSavedGroups()]);
  await refreshJobAccountOptions();
}

function parseGroupIdFromInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("GROUP_REQUIRED");
  if (/^\d+$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/groups\/(\d+)/);
    if (match?.[1]) return match[1];
  } catch {
    // ignore
  }
  throw new Error("INVALID_GROUP_INPUT");
}

function syncGroupSelectionToTextarea() {
  const selected = savedGroups
    .filter((g) => {
      const checkbox = document.querySelector<HTMLInputElement>(`input[data-group-id="${g.groupId}"]`);
      return Boolean(checkbox?.checked);
    })
    .map((g) => g.groupId);

  mustGetElement<HTMLTextAreaElement>("jobGroupIds").value = selected.join("\n");
}

function applyTextareaToGroupSelection() {
  const raw = mustGetElement<HTMLTextAreaElement>("jobGroupIds").value.trim();
  const selected = new Set(raw.split(/[\n,\t ]+/g).map((s) => s.trim()).filter(Boolean));
  for (const g of savedGroups) {
    const checkbox = document.querySelector<HTMLInputElement>(`input[data-group-id="${g.groupId}"]`);
    if (checkbox) checkbox.checked = selected.has(g.groupId) && !checkbox.disabled;
  }
}

async function refreshSavedGroups() {
  try {
    const data = await apiFetch<{ groups: SavedGroup[] }>("/api/groups?limit=200");
    savedGroups = data.groups ?? [];
    renderSavedGroups();
    setText("groupsMsg", "");
    applyTextareaToGroupSelection();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setText("groupsMsg", message);
  }
}

function renderSavedGroups() {
  const list = mustGetElement<HTMLDivElement>("groupsList");
  list.innerHTML = "";

  for (const g of savedGroups) {
    const el = document.createElement("div");
    el.className = "item";
    const label = g.name?.trim() ? `${g.name} (${g.groupId})` : g.groupId;
    const status = g.postedBefore ? "đã đăng trước đó" : "chưa đăng";
    el.innerHTML = `
      <div class="meta">
        <div class="row" style="justify-content: space-between; align-items: center">
          <label class="row" style="gap: 8px; align-items: center">
            <input type="checkbox" data-group-id="${escapeHtml(g.groupId)}" style="width:auto" ${g.postedBefore ? "disabled" : ""} />
            <span>${escapeHtml(label)}</span>
          </label>
          <button class="danger" data-action="delete-group" data-id="${escapeHtml(g._id)}">Delete</button>
        </div>
        <div class="muted">${escapeHtml(status)}</div>
      </div>
    `;

    const checkbox = el.querySelector<HTMLInputElement>(`input[data-group-id="${g.groupId}"]`);
    checkbox?.addEventListener("change", async () => {
      const checked = savedGroups
        .map((sg) => document.querySelector<HTMLInputElement>(`input[data-group-id="${sg.groupId}"]`))
        .filter((c) => Boolean(c?.checked)).length;
      if (checked > 10) {
        if (checkbox) checkbox.checked = false;
        setText("groupsMsg", "Chỉ chọn tối đa 10 group.");
        return;
      }
      setText("groupsMsg", "");
      syncGroupSelectionToTextarea();
    });

    const deleteBtn = el.querySelector<HTMLButtonElement>("button[data-action='delete-group']");
    deleteBtn?.addEventListener("click", async () => {
      await apiFetch(`/api/groups/${encodeURIComponent(g._id)}`, { method: "DELETE" });
      await refreshSavedGroups();
    });

    list.appendChild(el);
  }
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
  const targetId = targetType === "PAGE" ? mustGetElement<HTMLSelectElement>("jobPage").value : "";
  const groupIdsRaw = targetType === "GROUP" ? mustGetElement<HTMLTextAreaElement>("jobGroupIds").value.trim() : "";
  const templateId = mustGetElement<HTMLSelectElement>("jobTemplate").value;
  const imageUrl = mustGetElement<HTMLInputElement>("jobImageUrl").value.trim();
  const message = mustGetElement<HTMLTextAreaElement>("jobMessage").value;
  const scheduledAt = mustGetElement<HTMLInputElement>("jobScheduledAt").value.trim();
  const enableSpin = mustGetElement<HTMLInputElement>("jobEnableSpin").checked;

  if (!accountId) throw new Error("ACCOUNT_REQUIRED");
  if (!scheduledAt) throw new Error("SCHEDULED_AT_REQUIRED");

  if (targetType === "GROUP") {
    const targetIds = groupIdsRaw
      .split(/[\n,\t ]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    const uniqueTargetIds = Array.from(new Set(targetIds));
    if (uniqueTargetIds.length === 0) throw new Error("TARGET_REQUIRED");
    if (uniqueTargetIds.length > 10) throw new Error("MAX_10_GROUPS");

    const result = await apiFetch<{ jobs: unknown[]; skipped: { targetId: string; reason: string }[] }>("/api/jobs/bulk", {
      method: "POST",
      body: JSON.stringify({
        accountId,
        targetType,
        targetIds: uniqueTargetIds,
        templateId: templateId || undefined,
        imageUrl: imageUrl || undefined,
        message: message.trim() ? message : undefined,
        scheduledAt,
        enableSpin
      })
    });

    const skippedText = result.skipped?.length ? ` Skipped: ${result.skipped.map((s) => `${s.targetId}(${s.reason})`).join(", ")}` : "";
    setText("jobMsg", `Scheduled ${result.jobs.length} jobs.${skippedText}`);
  } else {
    if (!targetId) throw new Error("TARGET_REQUIRED");
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
  }
  await refreshJobs();
}

async function validateGroup() {
  const accountId = mustGetElement<HTMLSelectElement>("jobAccount").value;
  const raw = mustGetElement<HTMLTextAreaElement>("jobGroupIds").value.trim();
  const groupId = raw.split(/[\n,\t ]+/g).map((s) => s.trim()).filter(Boolean)[0] ?? "";
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

mustGetElement<HTMLButtonElement>("tplUploadImage").addEventListener("click", async () => {
  await uploadImageFromFileInput({ fileInputId: "tplImageFile", urlInputId: "tplImageUrl", msgId: "tplMsg" });
});

mustGetElement<HTMLButtonElement>("jobUploadImage").addEventListener("click", async () => {
  await uploadImageFromFileInput({ fileInputId: "jobImageFile", urlInputId: "jobImageUrl", msgId: "jobMsg" });
});

mustGetElement<HTMLButtonElement>("reApplyToTemplate").addEventListener("click", async () => {
  try {
    const tpl = buildRealEstateTemplate();
    mustGetElement<HTMLInputElement>("tplName").value = tpl.title;
    mustGetElement<HTMLTextAreaElement>("tplText").value = tpl.text;
    setText("reMsg", "Đã áp dụng.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setText("reMsg", message);
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

mustGetElement<HTMLButtonElement>("groupsRefresh").addEventListener("click", async () => {
  await refreshSavedGroups();
});

mustGetElement<HTMLButtonElement>("groupAddBtn").addEventListener("click", async () => {
  try {
    const groupId = parseGroupIdFromInput(mustGetElement<HTMLInputElement>("groupAddInput").value);
    const name = mustGetElement<HTMLInputElement>("groupAddName").value.trim();
    await apiFetch("/api/groups", { method: "POST", body: JSON.stringify({ groupId, name: name || undefined }) });
    mustGetElement<HTMLInputElement>("groupAddInput").value = "";
    mustGetElement<HTMLInputElement>("groupAddName").value = "";
    setText("groupsMsg", "Added.");
    await refreshSavedGroups();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setText("groupsMsg", message);
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
  mustGetElement<HTMLTextAreaElement>("jobGroupIds").disabled = isPage;
});

void init();
