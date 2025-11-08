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

export type CreateEventInput = {
  title: string;
  start: string;
  end?: string | null;
  isAllDay?: boolean;
  location?: string;
  description?: string;
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
const GOOGLE_SCOPE = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");
const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const STORAGE_KEY = "ora-google-calendar-token";
const CONNECTED_FLAG_KEY = "ora-google-calendar-connected";

class GoogleApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

export class GoogleCalendarConflictError extends Error {
  conflicts: GoogleCalendarEvent[];
  constructor(conflicts: GoogleCalendarEvent[], message = "Requested time conflicts with existing events.") {
    super(message);
    this.name = "GoogleCalendarConflictError";
    this.conflicts = conflicts;
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

function mapGoogleEvent(raw: any): GoogleCalendarEvent | null {
  if (!raw || raw?.status === "cancelled") return null;
  const startRaw = raw?.start?.dateTime ?? raw?.start?.date;
  if (!startRaw) return null;
  const endRaw = raw?.end?.dateTime ?? raw?.end?.date ?? null;
  const isAllDay = Boolean(raw?.start?.date && !raw?.start?.dateTime);
  const id: string = raw?.id || raw?.iCalUID || `${startRaw}-${raw?.summary ?? Math.random().toString(36).slice(2)}`;
  return {
    id,
    title: raw?.summary || "Untitled event",
    start: startRaw,
    end: endRaw,
    isAllDay,
    location: raw?.location || undefined,
    htmlLink: raw?.htmlLink || undefined,
  };
}

function toISO(date: Date): string {
  return new Date(date).toISOString();
}

function buildTimeWindow(input: { start: string; end?: string | null; isAllDay?: boolean }): { timeMin: string; timeMax: string } {
  if (input.isAllDay) {
    const startDate = new Date(`${input.start}T00:00:00`);
    const endDate = new Date(`${(input.end ?? input.start)}T00:00:00`);
    endDate.setDate(endDate.getDate() + 1);
    return { timeMin: toISO(startDate), timeMax: toISO(endDate) };
  }
  const startDate = new Date(input.start);
  const hasValidStart = !Number.isNaN(startDate.getTime());
  const endDate = input.end ? new Date(input.end) : new Date(startDate.getTime());
  if (!input.end) {
    endDate.setMinutes(endDate.getMinutes() + 60);
  } else if (Number.isNaN(endDate.getTime())) {
    endDate.setTime(startDate.getTime());
    endDate.setMinutes(endDate.getMinutes() + 60);
  }
  if (!hasValidStart) {
    throw new Error("Invalid start date supplied for conflict detection.");
  }
  if (endDate <= startDate) {
    endDate.setMinutes(startDate.getMinutes() + 15);
  }
  return { timeMin: toISO(startDate), timeMax: toISO(endDate) };
}

async function fetchConflictingEvents(token: string, range: { timeMin: string; timeMax: string }): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: range.timeMin,
    timeMax: range.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
  });
  const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new GoogleApiError(text || `Google API request failed with ${resp.status}.`, resp.status);
  }
  const payload: any = await resp.json();
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items
    .map((item: any) => mapGoogleEvent(item))
    .filter((evt: GoogleCalendarEvent | null): evt is GoogleCalendarEvent => Boolean(evt));
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
  return items.map((item: any) => mapGoogleEvent(item)).filter((evt: GoogleCalendarEvent | null): evt is GoogleCalendarEvent => Boolean(evt));
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
  createEvent: (input: CreateEventInput, options?: { allowConflicts?: boolean }) => Promise<GoogleCalendarEvent>;
  checkConflicts: (range: { start: string; end?: string | null; isAllDay?: boolean }) => Promise<GoogleCalendarEvent[]>;
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
  const silentRequestRef = useRef(false);

  const hasClientId = useMemo(() => Boolean(GOOGLE_CLIENT_ID), []);

  const disconnect = useCallback((opts: { clearError?: boolean } = {}) => {
    tokenRef.current = null;
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(CONNECTED_FLAG_KEY);
    } catch {}
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

  const createEvent = useCallback(
    async (input: CreateEventInput, options?: { allowConflicts?: boolean }) => {
      if (!tokenRef.current) throw new Error("No Google Calendar session is active.");
      const token = tokenRef.current.accessToken;
      const trimmedTitle = input.title?.trim() || "Untitled event";
      const body: any = {
        summary: trimmedTitle,
      };
      if (input.isAllDay) {
        body.start = { date: input.start };
        body.end = { date: input.end ?? input.start };
      } else {
        body.start = { dateTime: input.start };
        body.end = { dateTime: input.end ?? input.start };
      }
      try {
        const window = buildTimeWindow({ start: input.start, end: input.end, isAllDay: input.isAllDay });
        const conflicts = await fetchConflictingEvents(token, window);
        if (conflicts.length > 0 && !options?.allowConflicts) {
          throw new GoogleCalendarConflictError(conflicts);
        }
      } catch (conflictErr) {
        if (conflictErr instanceof GoogleCalendarConflictError) throw conflictErr;
        if (conflictErr instanceof GoogleApiError && conflictErr.status === 401) {
          disconnect({ clearError: false });
          setStatus("error");
          setError("Google Calendar session expired. Please reconnect.");
          throw conflictErr;
        }
        throw conflictErr;
      }
      if (input.description) body.description = input.description;
      if (input.location) body.location = input.location;

      const resp = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        if (resp.status === 401) {
          disconnect({ clearError: false });
          setStatus("error");
          const message = "Google Calendar session expired. Please reconnect.";
          setError(message);
          setEvents([]);
          setEventsFetchedAt(null);
          setEventsError(message);
        }
        throw new GoogleApiError(text || `Google API request failed with ${resp.status}.`, resp.status);
      }

      const raw = await resp.json();
      const mapped = mapGoogleEvent(raw);
      try {
        await loadEvents();
      } catch {}
      setLastSync(Date.now());
      if (!mapped) {
        return {
          id: raw?.id || Math.random().toString(36).slice(2),
          title: trimmedTitle,
          start: input.start,
          end: input.end ?? null,
          isAllDay: Boolean(input.isAllDay),
          location: input.location,
          htmlLink: raw?.htmlLink,
        };
      }
      return mapped;
    },
    [disconnect, loadEvents],
  );

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

  const handleTokenResponse = useCallback(
    async (response: TokenResponse) => {
      if (response?.error) {
        if (silentRequestRef.current && response.error === "access_denied") {
          silentRequestRef.current = false;
          setStatus("disconnected");
          setError(null);
          return;
        }
        silentRequestRef.current = false;
        setStatus("error");
        setError(response.error_description ?? response.error);
        return;
      }
      if (!response?.access_token) {
        silentRequestRef.current = false;
        setStatus("error");
        setError("Google did not return an access token.");
        return;
      }
    const expiresIn = Number(response.expires_in ?? 3600);
    const safeExpiresIn = Number.isFinite(expiresIn) ? expiresIn : 3600;
    const expiry = Date.now() + Math.max(safeExpiresIn - 60, 60) * 1000;
    tokenRef.current = { accessToken: response.access_token, expiresAt: expiry };
    silentRequestRef.current = false;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokenRef.current));
      window.localStorage.setItem(CONNECTED_FLAG_KEY, "1");
    } catch {}
    try {
      await refresh({ silent: true });
    } catch {}
  },
    [refresh],
  );

  const requestToken = useCallback(
    async (prompt: "" | "consent") => {
      if (!hasWindow()) return;
      if (!hasClientId) {
        setStatus("error");
        setError("Missing VITE_GOOGLE_CLIENT_ID environment variable.");
        return;
      }
      if (prompt === "consent") setError(null);
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
            callback: (r: TokenResponse) => {
              void handleTokenResponse(r);
            },
          });
        } else {
          tokenClientRef.current.callback = (r: TokenResponse) => {
            void handleTokenResponse(r);
          };
        }
        silentRequestRef.current = prompt === "";
        tokenClientRef.current.requestAccessToken({ prompt });
      } catch (err) {
        silentRequestRef.current = false;
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [handleTokenResponse, hasClientId],
  );

  const connect = useCallback(() => {
    void requestToken("consent");
  }, [requestToken]);

  const checkConflicts = useCallback(
    async (range: { start: string; end?: string | null; isAllDay?: boolean }) => {
      if (!tokenRef.current) throw new Error("No Google Calendar session is active.");
      const window = buildTimeWindow(range);
      return fetchConflictingEvents(tokenRef.current.accessToken, window);
    },
    [],
  );

  useEffect(() => {
    if (!hasClientId) {
      setStatus("error");
      setError("Missing VITE_GOOGLE_CLIENT_ID environment variable.");
      return;
    }
    let hadStoredToken = false;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as StoredToken;
        if (stored?.accessToken) {
          tokenRef.current = stored;
          hadStoredToken = true;
          setStatus("connecting");
          void refresh({ silent: true }).catch(() => {});
        }
      }
    } catch {}
    if (!hadStoredToken) {
      try {
        if (window.localStorage.getItem(CONNECTED_FLAG_KEY) === "1") {
          void requestToken("");
        }
      } catch {}
    }
  }, [hasClientId, refresh, requestToken]);

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
    createEvent,
    checkConflicts,
  };
}
