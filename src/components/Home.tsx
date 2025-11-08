import { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useGoogleCalendar, type GoogleCalendarEvent } from "../hooks/useGoogleCalendar";
import { formatRelativeTime } from "../utils/time";
import "./home.css";

function parseEventDate(value: string, isAllDay: boolean): Date {
  if (!value) return new Date(NaN);
  if (value.includes("T")) return new Date(value);
  const suffix = isAllDay ? "T00:00:00" : "T00:00:00";
  return new Date(`${value}${suffix}`);
}

function isEventToday(event: GoogleCalendarEvent): boolean {
  const start = parseEventDate(event.start, event.isAllDay);
  if (Number.isNaN(start.getTime())) return false;
  const now = new Date();
  return (
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate()
  );
}

function formatDayLabel(event: GoogleCalendarEvent, formatter: Intl.DateTimeFormat): string {
  const start = parseEventDate(event.start, event.isAllDay);
  if (Number.isNaN(start.getTime())) return "";
  return formatter.format(start);
}

function formatTimeRange(
  event: GoogleCalendarEvent,
  formatter: Intl.DateTimeFormat,
  t: TFunction<"common">,
): string {
  if (event.isAllDay) return t("home.quickAdd.fields.allDay");
  const start = parseEventDate(event.start, event.isAllDay);
  if (Number.isNaN(start.getTime())) return "";
  const end = event.end ? parseEventDate(event.end, event.isAllDay) : null;
  const startLabel = formatter.format(start);
  if (!end || Number.isNaN(end.getTime())) return startLabel;
  return `${startLabel} - ${formatter.format(end)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateTimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(dateValue: string, amount: number): string {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  date.setDate(date.getDate() + amount);
  return toDateInputValue(date);
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    [i18n.language],
  );
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [i18n.language],
  );
  const {
    status,
    loading: calendarConnecting,
    events,
    eventsLoading,
    eventsError,
    eventsFetchedAt,
    profile,
    lastSync,
    connect,
    reloadEvents,
    createEvent,
  } = useGoogleCalendar();

  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startValue, setStartValue] = useState(() => toDateTimeLocalValue(new Date(Date.now() + 30 * 60 * 1000)));
  const [endValue, setEndValue] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isConnected = status === "connected";
  const isConnecting = calendarConnecting;
  const showInitialLoad = eventsLoading && events.length === 0;

  const clearMessages = () => {
    setSubmitError(null);
    setSubmitSuccess(null);
  };

  const handleAllDayToggle = (checked: boolean) => {
    setAllDay(checked);
    clearMessages();
    if (checked) {
      setStartValue((prev) => (prev ? prev.slice(0, 10) : toDateInputValue(new Date())));
      setEndValue((prev) => (prev ? prev.slice(0, 10) : ""));
    } else {
      setStartValue((prev) => {
        if (!prev) return toDateTimeLocalValue(new Date(Date.now() + 30 * 60 * 1000));
        return prev.includes("T") ? prev : `${prev}T09:00`;
      });
      setEndValue((prev) => {
        if (!prev) return "";
        return prev.includes("T") ? prev : `${prev}T10:00`;
      });
    }
  };

  const handleStartChange = (value: string) => {
    setStartValue(value);
    clearMessages();
  };

  const handleEndChange = (value: string) => {
    setEndValue(value);
    clearMessages();
  };

  const handleCreateEvent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isConnected) {
      setSubmitError(t("home.quickAdd.connectPrompt"));
      return;
    }
    if (!startValue) {
      setSubmitError(
        allDay
          ? t("home.quickAdd.validation.invalidStartDate")
          : t("home.quickAdd.validation.invalidStartDate"),
      );
      return;
    }
    clearMessages();

    let startPayload: string;
    let endPayload: string;

    if (allDay) {
      const startDateString = startValue.slice(0, 10);
      if (startDateString.length !== 10) {
        setSubmitError(t("home.quickAdd.validation.invalidStartDate"));
        return;
      }
      let endDateString = endValue ? endValue.slice(0, 10) : startDateString;
      if (endDateString.length !== 10) {
        endDateString = startDateString;
      }
      if (endDateString < startDateString) {
        setSubmitError(t("home.quickAdd.validation.endDateBeforeStart"));
        return;
      }
      startPayload = startDateString;
      endPayload = addDays(endDateString, 1);
    } else {
      const startDate = new Date(startValue);
      if (Number.isNaN(startDate.getTime())) {
        setSubmitError(t("home.quickAdd.validation.invalidStartDate"));
        return;
      }
      let endDate: Date;
      if (endValue) {
        endDate = new Date(endValue);
        if (Number.isNaN(endDate.getTime())) {
          setSubmitError(t("home.quickAdd.validation.invalidEndDate"));
          return;
        }
      } else {
        endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
      }
      if (endDate <= startDate) {
        setSubmitError(t("home.quickAdd.validation.endBeforeStart"));
        return;
      }
      startPayload = startDate.toISOString();
      endPayload = endDate.toISOString();
    }

    setSubmitting(true);
    try {
      await createEvent({
        title: title.trim() || t("home.quickAdd.defaults.title"),
        start: startPayload,
        end: endPayload,
        isAllDay: allDay,
        location: location.trim() || undefined,
        description: notes.trim() || undefined,
      });
      setSubmitSuccess(t("home.quickAdd.messages.success"));
      if (allDay) {
        const startDateString = startPayload.slice(0, 10);
        setStartValue(startDateString);
        setEndValue(startDateString);
      } else {
        const nextStart = new Date(startPayload);
        nextStart.setMinutes(nextStart.getMinutes() + 60);
        setStartValue(toDateTimeLocalValue(nextStart));
        setEndValue("");
      }
      setTitle("");
      setLocation("");
      setNotes("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitError(message || t("home.quickAdd.messages.error"));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isConnected) {
      setSubmitError(null);
      setSubmitSuccess(null);
    }
  }, [isConnected]);

  useEffect(() => {
    if (!submitSuccess) return undefined;
    const timer = window.setTimeout(() => setSubmitSuccess(null), 4000);
    return () => window.clearTimeout(timer);
  }, [submitSuccess]);

  useEffect(() => {
    if (!allDay || !startValue) return;
    const startDateString = startValue.length > 10 ? startValue.slice(0, 10) : startValue;
    if (startValue.length > 10) {
      setStartValue(startDateString);
      return;
    }
    if (!endValue || endValue.length > 10 || endValue < startDateString) {
      setEndValue(startDateString);
    }
  }, [allDay, startValue, endValue]);

  useEffect(() => {
    if (allDay || !startValue) return;
    const startDate = new Date(startValue);
    if (Number.isNaN(startDate.getTime())) return;
    const defaultEnd = new Date(startDate.getTime() + 30 * 60 * 1000);
    if (!endValue) {
      setEndValue(toDateTimeLocalValue(defaultEnd));
      return;
    }
    const endDate = new Date(endValue);
    if (Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      setEndValue(toDateTimeLocalValue(defaultEnd));
    }
  }, [allDay, startValue, endValue]);

  useEffect(() => {
    if (isConnected && !eventsFetchedAt && !eventsLoading && events.length === 0) {
      void reloadEvents();
    }
  }, [isConnected, eventsFetchedAt, eventsLoading, events.length, reloadEvents]);

  const [nextEvent, laterEvents] = useMemo(() => {
    if (events.length === 0) return [null, []] as const;
    const [head, ...rest] = events;
    return [head, rest.slice(0, 4)] as const;
  }, [events]);

  return (
    <section className="home">
      <header className="home-header">
        <h2>{t("home.header.title")}</h2>
        <p>{t("home.header.subtitle")}</p>
      </header>

      <div className="home-grid">
        {false && (
          <div className="card add-event">
            <h3>{t("home.quickAdd.title")}</h3>
            {isConnected ? (
              <form className="add-form" onSubmit={handleCreateEvent}>
                <label className="field-group">
                  <span>{t("home.quickAdd.fields.title")}</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      clearMessages();
                    }}
                    placeholder={t("home.quickAdd.fields.titlePlaceholder") ?? ""}
                  />
                </label>
              <div className="field-row">
                <label className="field-group">
                  <span>{t("home.quickAdd.fields.starts")}</span>
                  <input
                    type={allDay ? "date" : "datetime-local"}
                    value={startValue}
                    onChange={(e) => handleStartChange(e.target.value)}
                    required
                  />
                </label>
                <label className="field-group">
                  <span>{t("home.quickAdd.fields.ends")}</span>
                  <input
                    type={allDay ? "date" : "datetime-local"}
                    value={endValue}
                    onChange={(e) => handleEndChange(e.target.value)}
                  />
                </label>
              </div>
              <label className="checkbox-group">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => handleAllDayToggle(e.target.checked)}
                />
                <span>{t("home.quickAdd.fields.allDay")}</span>
              </label>
              <label className="field-group">
                <span>{t("home.quickAdd.fields.location")}</span>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    clearMessages();
                  }}
                  placeholder={t("home.quickAdd.fields.locationPlaceholder") ?? ""}
                />
              </label>
              <label className="field-group">
                <span>{t("home.quickAdd.fields.notes")}</span>
                <textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    clearMessages();
                  }}
                  placeholder={t("home.quickAdd.fields.notesPlaceholder") ?? ""}
                  rows={3}
                />
              </label>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? t("home.quickAdd.submit.adding") : t("home.quickAdd.submit.label")}
                </button>
                {submitSuccess && <span className="success-text">{submitSuccess}</span>}
                {submitError && <span className="error-text">{submitError}</span>}
              </div>
            </form>
          ) : (
            <div className="empty">
              <p>{t("home.quickAdd.connectPrompt")}</p>
              <button className="btn btn-primary" onClick={() => connect()} disabled={isConnecting}>
                {isConnecting ? t("home.quickAdd.connectButton.connecting") : t("home.quickAdd.connectButton.default")}
              </button>
            </div>
          )}
          </div>
        )}

        <div className="card event">
          <h3>{t("home.nextEvent.title")}</h3>
          {isConnected ? (
            showInitialLoad ? (
              <p className="text-muted">{t("home.nextEvent.loading")}</p>
            ) : nextEvent ? (
              <div className="event-main">
                <span className="event-day">
                  {isEventToday(nextEvent)
                    ? t("home.nextEvent.today")
                    : formatDayLabel(nextEvent, dayFormatter)}
                </span>
                <span className="event-title">{nextEvent.title}</span>
                <span className="event-time">{formatTimeRange(nextEvent, timeFormatter, t)}</span>
                {nextEvent.location && <span className="event-location">{nextEvent.location}</span>}
                {nextEvent.htmlLink && (
                  <a className="event-link" href={nextEvent.htmlLink} target="_blank" rel="noreferrer">
                    {t("home.nextEvent.openInCalendar")}
                  </a>
                )}
              </div>
            ) : (
              <p className="text-muted">{t("home.nextEvent.empty")}</p>
            )
          ) : (
            <div className="empty">
              <p className="text-muted">{t("home.nextEvent.connectPrompt")}</p>
              <button className="btn btn-primary" onClick={() => connect()} disabled={isConnecting}>
                {isConnecting ? t("general.connecting") : t("general.connect")}
              </button>
            </div>
          )}
        </div>

        <div className="card events-list">
          <h3>{t("home.upcoming.title")}</h3>
          {isConnected ? (
            <>
              {showInitialLoad ? (
                <p className="text-muted">{t("home.upcoming.loading")}</p>
              ) : laterEvents.length > 0 ? (
                <ul className="event-list">
                  {laterEvents.map((event) => (
                    <li key={event.id} className="event-item">
                      <div className="event-item-info">
                        <span className="event-item-title">{event.title}</span>
                        <span className="event-item-meta">
                          {isEventToday(event)
                            ? `${t("home.nextEvent.today")} | ${formatTimeRange(event, timeFormatter, t)}`
                            : `${formatDayLabel(event, dayFormatter)} | ${formatTimeRange(event, timeFormatter, t)}`}
                        </span>
                        {event.location && <span className="event-item-location">{event.location}</span>}
                      </div>
                      {event.htmlLink && (
                        <a className="event-open" href={event.htmlLink} target="_blank" rel="noreferrer">
                          {t("home.upcoming.open")}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : nextEvent ? (
                <p className="text-muted">{t("home.upcoming.nothingElse")}</p>
              ) : (
                <p className="text-muted">{t("home.upcoming.clear")}</p>
              )}
              {eventsError && <p className="error-text">{eventsError}</p>}
            </>
          ) : (
            <p className="text-muted">{t("home.upcoming.connectPrompt")}</p>
          )}
        </div>

        <div className="card sync">
          <h3>{t("home.sync.title")}</h3>
          {isConnected ? (
            <>
              <p className="text-muted">
                {profile?.email
                  ? t("home.sync.signedInAs", { email: profile.email })
                  : t("home.sync.signedInFallback")}
              </p>
              <div className="meta-row">
                <span className="badge">
                  {eventsFetchedAt
                    ? t("home.sync.eventsUpdated", { time: formatRelativeTime(eventsFetchedAt, t) })
                    : t("home.sync.eventsNotLoaded")}
                </span>
                {lastSync && (
                  <span className="badge gray">
                    {t("home.sync.calendarChecked", { time: formatRelativeTime(lastSync, t) })}
                  </span>
                )}
              </div>
              <button className="btn btn-ghost" onClick={() => void reloadEvents()} disabled={eventsLoading}>
                {eventsLoading ? t("home.sync.refreshing") : t("home.sync.refresh")}
              </button>
            </>
          ) : (
            <div className="empty">
              <p>{t("home.sync.connectPrompt")}</p>
              <button className="btn btn-primary" onClick={() => connect()} disabled={isConnecting}>
                {isConnecting ? t("general.connecting") : t("general.connect")}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
