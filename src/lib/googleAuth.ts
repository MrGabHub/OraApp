export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export const GOOGLE_SCOPE = GOOGLE_CALENDAR_SCOPES.join(" ");

export const GOOGLE_TOKEN_STORAGE_KEY = "ora-google-calendar-token";
export const GOOGLE_CONNECTED_FLAG_KEY = "ora-google-calendar-connected";
export const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";

export type StoredGoogleToken = {
  accessToken: string;
  expiresAt: number;
};

const FALLBACK_EXPIRES_IN = 3600;
const MIN_TOKEN_TTL_SECONDS = 60;

let scriptPromise: Promise<void> | null = null;

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export async function ensureGoogleIdentityScript(): Promise<void> {
  if (!hasWindow()) throw new Error("Google Identity Services requires a browser environment.");
  if ((window as any).google?.accounts?.oauth2) return;
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`);
    if (existing && (window as any).google?.accounts?.oauth2) { resolve(); return; }
    const script = existing ?? document.createElement("script");
    const cleanup = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    const onLoad = () => { cleanup(); (window as any).google?.accounts?.oauth2 ? resolve() : reject(new Error("GIS loaded but API unavailable.")); };
    const onError = () => { cleanup(); reject(new Error("Failed to load GIS script.")); };
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (!existing) {
      script.src = GOOGLE_IDENTITY_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return scriptPromise.finally(() => { scriptPromise = null; });
}

export async function requestGoogleAccessToken(input: {
  clientId: string;
  scope: string;
  prompt?: "" | "consent";
  hint?: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  if (!input.clientId) {
    throw new Error("Missing Google OAuth client id.");
  }
  await ensureGoogleIdentityScript();
  return await new Promise((resolve, reject) => {
    const google = (window as any).google;
    const oauth2 = google?.accounts?.oauth2;
    if (!oauth2?.initTokenClient) {
      reject(new Error("Google OAuth client is unavailable."));
      return;
    }
    const tokenClient = oauth2.initTokenClient({
      client_id: input.clientId,
      scope: input.scope,
      callback: (response: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) => {
        if (response?.error) {
          reject(new Error(response.error_description ?? response.error));
          return;
        }
        if (!response?.access_token) {
          reject(new Error("Google did not return an access token."));
          return;
        }
        resolve({
          accessToken: response.access_token,
          expiresIn: Number(response.expires_in ?? FALLBACK_EXPIRES_IN),
        });
      },
    });
    tokenClient.requestAccessToken({
      prompt: input.prompt ?? "consent",
      ...(input.hint ? { hint: input.hint } : {}),
    });
  });
}

export function storeGoogleToken(accessToken: string, expiresInSeconds = FALLBACK_EXPIRES_IN) {
  const ttl = Number.isFinite(expiresInSeconds) ? Math.max(expiresInSeconds, MIN_TOKEN_TTL_SECONDS) : FALLBACK_EXPIRES_IN;
  const token: StoredGoogleToken = {
    accessToken,
    expiresAt: Date.now() + (ttl - 30) * 1000,
  };
  try {
    window.sessionStorage.setItem(GOOGLE_TOKEN_STORAGE_KEY, JSON.stringify(token));
    window.localStorage.setItem(GOOGLE_CONNECTED_FLAG_KEY, "1");
  } catch {
    // ignore storage issues
  }
  return token;
}

export function readStoredGoogleToken(): StoredGoogleToken | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredGoogleToken;
    if (!parsed?.accessToken || !parsed.expiresAt) return null;
    if (parsed.expiresAt <= Date.now()) {
      clearStoredGoogleToken({ keepFlag: true });
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearStoredGoogleToken(options: { keepFlag?: boolean } = {}) {
  try {
    window.sessionStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
    if (!options.keepFlag) {
      window.localStorage.removeItem(GOOGLE_CONNECTED_FLAG_KEY);
    }
  } catch {
    // ignore storage issues
  }
}
