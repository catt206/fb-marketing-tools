export type ExtensionConfig = {
  backendBaseUrl: string;
  facebookAppId: string;
};

export type AuthState = {
  jwtToken: string | null;
};

const CONFIG_KEY = "config";
const AUTH_KEY = "auth";

export async function getConfig(): Promise<ExtensionConfig> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  const stored = (result[CONFIG_KEY] ?? null) as Partial<ExtensionConfig> | null;
  return {
    backendBaseUrl: stored?.backendBaseUrl ?? "http://localhost:4000",
    facebookAppId: stored?.facebookAppId ?? ""
  };
}

export async function setConfig(config: ExtensionConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
}

export async function getAuthState(): Promise<AuthState> {
  const result = await chrome.storage.local.get(AUTH_KEY);
  const stored = (result[AUTH_KEY] ?? null) as Partial<AuthState> | null;
  return { jwtToken: stored?.jwtToken ?? null };
}

export async function setJwtToken(jwtToken: string | null): Promise<void> {
  const current = await getAuthState();
  await chrome.storage.local.set({ [AUTH_KEY]: { ...current, jwtToken } });
}

