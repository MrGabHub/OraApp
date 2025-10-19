import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GoogleCalendarStatus = "disconnected" | "connecting" | "connected" | "error";

type CalendarProfile = {
  email?: string;
  summary?: string;
};

export type GoogleCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  isAllDay: boolean;
  location?: string;
  htmlLink?: string;
};

type StoredToken = {
  accessToken: string;
  expiresAt: number;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "") as string;
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const STORAGE_KEY = "ora-google-calendar-token";

class GoogleApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

let scriptPromise: Promise<void> | null = null;

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

async function ensureGoogleScript(): Promise<void> {
  if (!hasWindow()) throw new Error("Google Identity Services requires a browser environment.");
  if ((window as any).google?.accounts?.oauth2) return;
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_URL}"]`);
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
    if (!existing) { script.src = GOOGLE_SCRIPT_URL; script.async = true; script.defer = true; document.head.appendChild(script); }
  });
  return scriptPromise.finally(() => { scriptPromise = null; });
}

async function fetchCalendarProfile(accessToken: string): Promise<CalendarProfile> {
  const resp = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=5", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new GoogleApiError(text || `Google API request failed with ${resp.status}.`, resp.status);
  }
  const data: any = await resp.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const primary = items.find((i: any) => i?.primary) ?? items[0] ?? null;
  return { email: primary?.id, summary: primary?.summary };
}

async function fetchUpcomingEvents(accessToken: string): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({ maxResults: "8", orderBy: "startTime", singleEvents: "true", timeMin: new Date(Date.now() - 15 * 60 * 1000).toISOString() });
  if (hasWindow()) {
    try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz) params.set("timeZone", tz); } catch {}
  }
  const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new GoogleApiError(text || `Google API request failed with ${resp.status}.`, resp.status);
  }
  const payload: any = await resp.json();
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items
    .filter((item: any) => item?.status !== "cancelled")
    .map((item: any) => {
      const startRaw = item?.start?.dateTime ?? item?.start?.date;
      if (!startRaw) return null;
      const endRaw = item?.end?.dateTime ?? item?.end?.date ?? null;
      const isAllDay = Boolean(item?.start?.date && !item?.start?.dateTime);
      const id: string = item?.id || item?.iCalUID || `${startRaw}-${item?.summary ?? Math.random().toString(36).slice(2)}`;
      return {
        id,
        title: item?.summary || "Untitled event",
        start: startRaw,
        end: endRaw,
        isAllDay,
        location: item?.location || undefined,
        htmlLink: item?.htmlLink || undefined,
      } as GoogleCalendarEvent;
    })
    .filter((evt: GoogleCalendarEvent | null): evt is GoogleCalendarEvent => Boolean(evt));
}

export interface GoogleCalendarConnection {
  status: GoogleCalendarStatus;
  loading: boolean;
  error: string | null;
  profile: CalendarProfile | null;
  lastSync: number | null;
  accessToken: string | null;
  events: GoogleCalendarEvent[];
  eventsLoading: boolean;
  eventsError: string | null;
  eventsFetchedAt: number | null;
  connect: () => void;
  disconnect: () => void;
  refresh: () => Promise<void>;
  reloadEvents: () => Promise<GoogleCalendarEvent[]>;
}

export function useGoogleCalendar(): GoogleCalendarConnection {
  const [status, setStatus] = useState<GoogleCalendarStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CalendarProfile | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsFetchedAt, setEventsFetchedAt] = useState<number | null>(null);
  const tokenRef = useRef<StoredToken | null>(null);
  const tokenClientRef = useRef<any>(null);

  const hasClientId = useMemo(() => Boolean(GOOGLE_CLIENT_ID), []);

  const disconnect = useCallback((opts: { clearError?: boolean } = {}) => {
    tokenRef.current = null;
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch {}
    setProfile(null);
    setLastSync(null);
    setEvents([]);
    setEventsFetchedAt(null);
    setEventsLoading(false);
    setEventsError(null);
    setStatus("disconnected");
    if (opts.clearError !== false) setError(null);
  }, []);

  const loadEvents = useCallback(async () => {
    if (!tokenRef.current) throw new Error("No Google Calendar session is active.");
    setEventsLoading(true);
    setEventsError(null);
    try {
      const upcoming = await fetchUpcomingEvents(tokenRef.current.accessToken);
      setEvents(upcoming);
      setEventsFetchedAt(Date.now());
      return upcoming;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof GoogleApiError && err.status === 401) {
        disconnect({ clearError: false });
        setStatus("error");
        setError("Google Calendar session expired. Please reconnect.");
        setEvents([]);
        setEventsFetchedAt(null);
        setEventsError("Google Calendar session expired. Please reconnect.");
      } else {
        setEventsError(message);
      }
      throw err as any;
    } finally {
      setEventsLoading(false);
    }
  }, [disconnect]);

  const refresh = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!tokenRef.current) throw new Error("No Google Calendar session is active.");
    if (!opts.silent) setStatus("connecting");
    try {
      const info = await fetchCalendarProfile(tokenRef.current.accessToken);
      setProfile(info);
      setLastSync(Date.now());
      setStatus("connected");
      setError(null);
      try { await loadEvents(); } catch {}
    } catch (err) {
      if (err instanceof GoogleApiError && err.status === 401) {
        disconnect({ clearError: false });
        setStatus("error");
        setError("Google Calendar session expired. Please reconnect.");
      } else {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
      throw err as any;
    }
  }, [disconnect, loadEvents]);

  const handleTokenResponse = useCallback(async (response: TokenResponse) => {
    if (response?.error) { setStatus("error"); setError(response.error_description ?? response.error); return; }
    if (!response?.access_token) { setStatus("error"); setError("Google did not return an access token."); return; }
    const expiresIn = Number(response.expires_in ?? 3600);
    const safeExpiresIn = Number.isFinite(expiresIn) ? expiresIn : 3600;
    const expiry = Date.now() + Math.max(safeExpiresIn - 60, 60) * 1000;
    tokenRef.current = { accessToken: response.access_token, expiresAt: expiry };
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokenRef.current)); } catch {}
    try { await refresh({ silent: true }); } catch {}
  }, [refresh]);

  const connect = useCallback(async () => {
    if (!hasWindow()) return;
    if (!hasClientId) { setStatus("error"); setError("Missing VITE_GOOGLE_CLIENT_ID environment variable."); return; }
    setError(null);
    setStatus("connecting");
    try {
      await ensureGoogleScript();
      const google = (window as any).google;
      const oauth2 = google?.accounts?.oauth2;
      if (!oauth2?.initTokenClient) throw new Error("Google OAuth client is unavailable.");
      if (!tokenClientRef.current) {
        tokenClientRef.current = oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: GOOGLE_SCOPE,
          callback: (r: TokenResponse) => { void handleTokenResponse(r); },
        });
      } else {
        tokenClientRef.current.callback = (r: TokenResponse) => { void handleTokenResponse(r); };
      }
      tokenClientRef.current.requestAccessToken({ prompt: "consent" });
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [handleTokenResponse, hasClientId]);

  useEffect(() => {
    if (!hasClientId) { setStatus("error"); setError("Missing VITE_GOOGLE_CLIENT_ID environment variable."); return; }
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as StoredToken;
        if (stored?.accessToken) {
          tokenRef.current = stored;
          setStatus("connecting");
          void refresh({ silent: true }).catch(() => {});
        }
      }
    } catch {}
  }, [hasClientId, refresh]);

  return {
    status,
    loading: status === "connecting",
    error,
    profile,
    lastSync,
    accessToken: tokenRef.current?.accessToken ?? null,
    events,
    eventsLoading,
    eventsError,
    eventsFetchedAt,
    connect,
    disconnect: () => disconnect(),
    refresh: () => refresh(),
    reloadEvents: () => loadEvents(),
  };
}

