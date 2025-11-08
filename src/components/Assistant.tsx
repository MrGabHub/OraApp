import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGoogleCalendar, type GoogleCalendarEvent, GoogleCalendarConflictError } from "../hooks/useGoogleCalendar";
import "./assistant.css";

type Msg = { id: string; role: "user" | "assistant"; text: string };
const DEFAULT_MODEL = "llama-3.1-8b-instant";
const SYSTEM_PROMPT =
  `You are ORA, a concise, kind assistant focused on time planning. Prefer short answers with concrete actions, propose times, and avoid verbosity.

After your natural language reply, always add a final line formatted exactly as:
ACTION_JSON: {"intent":"schedule_event","title":"...","start":"YYYY-MM-DDTHH:mm","end":"YYYY-MM-DDTHH:mm","allDay":false,"location":"...","description":"..."}
If you do NOT intend to schedule anything, output ACTION_JSON: {"intent":"none"}.
Always include ISO 8601 timestamps (UTC or include timezone offset).`;

type AssistantAction =
  | { intent: "none" }
  | {
      intent: "schedule_event";
      title: string;
      start: string;
      end?: string | null;
      allDay?: boolean;
      location?: string;
      description?: string;
    };

type PendingEvent = {
  title: string;
  start: string;
  end?: string | null;
  isAllDay?: boolean;
  location?: string;
  description?: string;
};

function parseAssistantAction(rawText: string): { action: AssistantAction | null; cleanText: string } {
  const match = rawText.match(/(?:^|\n)ACTION_JSON:\s*(\{.*\})\s*$/s);
  if (!match) {
    return { action: null, cleanText: rawText };
  }
  const jsonPart = match[1];
  try {
    const parsed = JSON.parse(jsonPart) as AssistantAction;
    const cleanText = rawText.replace(match[0], "").trimEnd();
    return { action: parsed, cleanText };
  } catch {
    return { action: null, cleanText: rawText.replace(match[0], "").trimEnd() };
  }
}

function normalizeDateInput(
  raw: string | null | undefined,
): { value: string; dateOnly: boolean } | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { value, dateOnly: true };
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return { value: `${value}:00Z`, dateOnly: false };
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(value)) {
    return { value: `${value}Z`, dateOnly: false };
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[Zz]|[+-]\d{2}:?\d{2})$/.test(value)) {
    return { value, dateOnly: false };
  }
  try {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return { value: date.toISOString(), dateOnly: false };
    }
  } catch {
    // ignore invalid
  }
  return null;
}

function stripActionMarkup(text: string): string {
  return parseAssistantAction(text).cleanText;
}

function toDateOnly(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, options ?? { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatEventRange(event: PendingEvent): string {
  if (event.isAllDay) {
    const start = formatDateTime(event.start, { dateStyle: "full" });
    const end = event.end ? formatDateTime(event.end, { dateStyle: "full" }) : start;
    return start === end ? start : `${start} → ${end}`;
  }
  const start = formatDateTime(event.start);
  const end = event.end ? formatDateTime(event.end) : "";
  return end ? `${start} → ${end}` : start;
}

function formatConflict(evt: GoogleCalendarEvent): string {
  if (evt.isAllDay) {
    const start = formatDateTime(evt.start, { dateStyle: "medium" });
    const end = evt.end ? formatDateTime(evt.end, { dateStyle: "medium" }) : start;
    return `${start}${start === end ? "" : ` → ${end}`}`;
  }
  const start = formatDateTime(evt.start);
  const end = evt.end ? formatDateTime(evt.end) : "";
  return end ? `${start} → ${end}` : start;
}

function summarizeEvents(events: GoogleCalendarEvent[]): string {
  if (!events.length) return "";
  const now = Date.now();
  const upcoming = events
    .filter((evt) => {
      const end = evt.end ? new Date(evt.end).getTime() : new Date(evt.start).getTime();
      return Number.isFinite(end) ? end >= now - 2 * 60 * 60 * 1000 : true;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 5);
  if (!upcoming.length) return "";
  return upcoming
    .map((evt) => {
      const range = evt.isAllDay
        ? formatDateTime(evt.start, { dateStyle: "medium" })
        : formatDateTime(evt.start);
      return `${evt.title ?? "Untitled"} — ${range}${evt.location ? ` @ ${evt.location}` : ""}`;
    })
    .join("\n");
}

export default function Assistant() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const {
    status: calendarStatus,
    loading: calendarLoading,
    connect: connectCalendar,
    events,
    eventsFetchedAt,
    reloadEvents,
    createEvent,
    checkConflicts,
  } = useGoogleCalendar();
  const [pendingEvent, setPendingEvent] = useState<PendingEvent | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [conflicts, setConflicts] = useState<GoogleCalendarEvent[]>([]);
  const [creationState, setCreationState] = useState<{ status: "idle" | "creating" | "error" | "success"; message?: string }>({
    status: "idle",
  });
  const [allowConflictOverride, setAllowConflictOverride] = useState(false);

  const handleAssistantAction = (action: AssistantAction | null) => {
    if (!action || action.intent !== "schedule_event") return;
    if (!action.title || !action.start) return;
    const normalizedStart = normalizeDateInput(action.start);
    const normalizedEnd = action.end ? normalizeDateInput(action.end) : null;
    if (!normalizedStart) {
      setCreationState({
        status: "error",
        message: t(
          "assistant.eventSuggestion.invalidTime",
          "I couldn't understand the proposed dates. Could you rephrase them?",
        ),
      });
      return;
    }
    if (action.end && !normalizedEnd) {
      setCreationState({
        status: "error",
        message: t(
          "assistant.eventSuggestion.invalidTime",
          "I couldn't understand the proposed dates. Could you rephrase them?",
        ),
      });
      return;
    }
    const derivedAllDay = action.allDay ?? normalizedStart.dateOnly;
    const startValue = derivedAllDay ? toDateOnly(normalizedStart.value) : normalizedStart.value;
    const endValue = normalizedEnd ? (derivedAllDay ? toDateOnly(normalizedEnd.value) : normalizedEnd.value) : null;
    setPendingEvent({
      title: action.title,
      start: startValue,
      end: endValue,
      isAllDay: derivedAllDay,
      location: action.location ?? undefined,
      description: action.description ?? undefined,
    });
    setCreationState({ status: "idle" });
    setAllowConflictOverride(false);
  };

  const dismissPendingEvent = () => {
    setPendingEvent(null);
    setConflicts([]);
    setCheckingConflicts(false);
    setCreationState({ status: "idle" });
    setAllowConflictOverride(false);
  };

  const handleCreateEvent = async (force = false) => {
    if (!pendingEvent) return;
    if (calendarStatus !== "connected") {
      connectCalendar();
      return;
    }
    setCreationState({ status: "creating" });
    try {
      await createEvent(
        {
          title: pendingEvent.title,
          start: pendingEvent.start,
          end: pendingEvent.end ?? null,
          isAllDay: pendingEvent.isAllDay,
          location: pendingEvent.location,
          description: pendingEvent.description,
        },
        { allowConflicts: force || conflicts.length === 0 },
      );
      setCreationState({ status: "success", message: t("assistant.eventSuggestion.success", "Event added to your calendar.") });
      dismissPendingEvent();
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: t("assistant.eventSuggestion.successReply", "All set! I've added it to your agenda."),
        },
      ]);
    } catch (err) {
      if (err instanceof GoogleCalendarConflictError) {
        setConflicts(err.conflicts);
        setCreationState({
          status: "error",
          message: t("assistant.eventSuggestion.conflictError", "There's already something scheduled at that time."),
        });
        setAllowConflictOverride(true);
        return;
      }
      setCreationState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  useEffect(() => {
    requestAnimationFrame(() => {
      threadRef.current?.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [messages]);

  useEffect(() => {
    if (!pendingEvent) {
      setConflicts([]);
      return;
    }
    if (calendarStatus !== "connected") {
      setConflicts([]);
      return;
    }
    let cancelled = false;
    setCheckingConflicts(true);
    checkConflicts({
      start: pendingEvent.start,
      end: pendingEvent.end ?? null,
      isAllDay: pendingEvent.isAllDay,
    })
      .then((items) => {
        if (!cancelled) {
          setConflicts(items);
        }
      })
      .catch(() => {
        if (!cancelled) setConflicts([]);
      })
      .finally(() => {
        if (!cancelled) setCheckingConflicts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pendingEvent, calendarStatus, checkConflicts]);

  useEffect(() => {
    if (calendarStatus === "connected" && eventsFetchedAt === null) {
      void reloadEvents().catch(() => {});
    }
  }, [calendarStatus, eventsFetchedAt, reloadEvents]);

  const send = async (overrideText?: string) => {
    const userText = (overrideText ?? input).trim();
    if (!userText || loading) return;
    setInput("");
    const uid = crypto.randomUUID();
    const aid = crypto.randomUUID();
    const userMessage: Msg = { id: uid, role: "user", text: userText };
    const placeholder: Msg = { id: aid, role: "assistant", text: "" };
    setMessages((m) => [...m, userMessage, placeholder]);
    setLoading(true);

    try {
      let assistantAccum = "";
      const history = [...messages, userMessage];
      const systemPromptWithContext =
        eventsContext && calendarStatus === "connected"
          ? `${SYSTEM_PROMPT}\n\nUpcoming calendar events (use them when relevant):\n${eventsContext}`
          : SYSTEM_PROMPT;
      const chat = [
        { role: "system", content: systemPromptWithContext },
        ...history.map((m) => ({ role: m.role, content: m.text })),
      ];

      const resp = await fetch("/api/groq?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: chat,
          temperature: 0.6,
          stream: true,
        }),
      });

      if (!resp.ok || !resp.body) {
        const errText = await resp.text().catch(() => "");
        let msg = `HTTP ${resp.status}`;
        let detail = "";
        try {
          const j = JSON.parse(errText);
          if (j?.error) msg = j.error;
          if (j?.details)
            detail = typeof j.details === "string" ? j.details : JSON.stringify(j.details);
        } catch {
          detail = errText.trim();
        }
        const cleanDetail = detail.replace(/\s+/g, " ").trim();
        throw new Error(cleanDetail ? `${msg}: ${cleanDetail}` : msg);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          const raw = line.split("\n").find((l) => l.startsWith("data:"));
          if (!raw) continue;
          const dataStr = raw.slice(5).trim();
          if (!dataStr || dataStr === "[DONE]") continue;
          try {
            const evt = JSON.parse(dataStr);
            const delta = evt?.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              assistantAccum += delta;
              setMessages((m) =>
                m.map((msg) => (msg.id === aid ? { ...msg, text: msg.text + delta } : msg)),
              );
            }
          } catch {
            // Ignore malformed chunks.
          }
        }
      }
      if (assistantAccum) {
        const { action, cleanText } = parseAssistantAction(assistantAccum);
        if (cleanText !== assistantAccum) {
          setMessages((m) =>
            m.map((msg) => (msg.id === aid ? { ...msg, text: cleanText } : msg)),
          );
        }
        handleAssistantAction(action);
      }
    } catch (e: any) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === aid && msg.role === "assistant"
            ? { ...msg, text: t("assistant.error", { message: String(e?.message || e) }) }
            : msg,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const eventsContext = useMemo(() => {
    if (calendarStatus !== "connected" || !events.length) return "";
    return summarizeEvents(events);
  }, [calendarStatus, events]);

  const quickPrompts = useMemo(
    () => [
      {
        id: "plan-day",
        label: t("assistant.prompts.planDay.label", "Plan my day"),
        message: t(
          "assistant.prompts.planDay.message",
          "Can you organise my day by grouping meetings and focus blocks?",
        ),
      },
      {
        id: "prepare-meeting",
        label: t("assistant.prompts.meeting.label", "Prepare a meeting"),
        message: t(
          "assistant.prompts.meeting.message",
          "Help me prepare my next meeting: key points, documents, and follow up.",
        ),
      },
      {
        id: "wrap-up",
        label: t("assistant.prompts.wrapUp.label", "Daily wrap up"),
        message: t(
          "assistant.prompts.wrapUp.message",
          "Summarise my day and suggest the actions to carry into tomorrow.",
        ),
      },
    ],
    [t],
  );
  const promptsMeta = useMemo(
    () => quickPrompts.map((prompt) => prompt.label).join(", "),
    [quickPrompts],
  );

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void send();
  };

  return (
    <section className="assistant" data-prompts={promptsMeta}>
      <header className="assistant__header">
        <div className="assistant__headline">
          <span className="eyebrow">{t("assistant.header.eyebrow", "ORA Assistant")}</span>
          <h3>{t("assistant.header.title", "Chat with ORA to orchestrate your priorities")}</h3>
          <p>
            {t(
              "assistant.header.subtitle",
              "Ask for a quick plan, a summary, or a reminder. ORA blends your data for tailored actions.",
            )}
          </p>
        </div>
      </header>

      <div className="thread" ref={threadRef}>
        {messages.map((m) => {
          const displayText =
            m.role === "assistant" ? stripActionMarkup(m.text).trim() : m.text.trim();
          return (
            <div key={m.id} className={`bubble ${m.role}`}>
              {displayText || "\u00A0"}
            </div>
          );
        })}
      </div>
      <div className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={t("assistant.placeholder") ?? ""}
        />
        <button className="btn btn-primary" onClick={() => void send()} disabled={loading}>
          {loading ? t("assistant.sending") : t("assistant.send")}
        </button>
      </div>
      {pendingEvent ? (
        <div className="assistant-event-card">
          <div className="assistant-event-card__header">
            <div>
              <span className="eyebrow">{t("assistant.eventSuggestion.title", "Event suggestion")}</span>
              <h4>{pendingEvent.title}</h4>
            </div>
            <button type="button" className="assistant-event-card__close" onClick={dismissPendingEvent} aria-label={t("assistant.eventSuggestion.dismiss", "Dismiss suggestion")}>
              ×
            </button>
          </div>
          <p className="assistant-event-card__range">{formatEventRange(pendingEvent)}</p>
          {pendingEvent.location ? (
            <p className="assistant-event-card__meta">{t("assistant.eventSuggestion.location", "Location")}: {pendingEvent.location}</p>
          ) : null}
          {pendingEvent.description ? (
            <p className="assistant-event-card__meta">{t("assistant.eventSuggestion.notes", "Notes")}: {pendingEvent.description}</p>
          ) : null}
          <div className="assistant-event-card__conflicts">
            {checkingConflicts ? (
              <p>{t("assistant.eventSuggestion.checkingConflicts", "Checking your calendar for conflicts...")}</p>
            ) : conflicts.length === 0 ? (
              <p>{t("assistant.eventSuggestion.noConflicts", "No conflicts detected for this timeframe.")}</p>
            ) : (
              <div>
                <p>{t("assistant.eventSuggestion.conflictsTitle", "Conflicts detected:")}</p>
                <ul>
                  {conflicts.map((evt) => (
                    <li key={evt.id}>
                      <strong>{evt.title}</strong> – {formatConflict(evt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {creationState.status === "error" && creationState.message ? (
            <p className="assistant-event-card__error">{creationState.message}</p>
          ) : null}
          {creationState.status === "success" && creationState.message ? (
            <p className="assistant-event-card__success">{creationState.message}</p>
          ) : null}
          <div className="assistant-event-card__actions">
            {calendarStatus !== "connected" ? (
              <button type="button" className="btn btn-primary" onClick={connectCalendar} disabled={calendarLoading}>
                {calendarLoading
                  ? t("assistant.eventSuggestion.connecting", "Connecting...")
                  : t("assistant.eventSuggestion.connect", "Connect Google Calendar")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleCreateEvent(false)}
                  disabled={creationState.status === "creating" || checkingConflicts}
                >
                  {creationState.status === "creating"
                    ? t("assistant.eventSuggestion.creating", "Creating...")
                    : t("assistant.eventSuggestion.add", "Add to calendar")}
                </button>
                {(conflicts.length > 0 || allowConflictOverride) && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void handleCreateEvent(true)}
                    disabled={creationState.status === "creating"}
                  >
                    {t("assistant.eventSuggestion.force", "Create anyway")}
                  </button>
                )}
              </>
            )}
            <button type="button" className="btn btn-ghost" onClick={dismissPendingEvent}>
              {t("assistant.eventSuggestion.dismiss", "Dismiss")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
