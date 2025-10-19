import { useEffect, useMemo, useState } from "react";
import { useGoogleCalendar, type GoogleCalendarEvent } from "../hooks/useGoogleCalendar";
import { formatRelativeTime } from "../utils/time";
import "./home.css";

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

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

function formatDayLabel(event: GoogleCalendarEvent): string {
  const start = parseEventDate(event.start, event.isAllDay);
  if (Number.isNaN(start.getTime())) return "";
  return dayFormatter.format(start);
}

function formatTimeRange(event: GoogleCalendarEvent): string {
  if (event.isAllDay) return "All day";
  const start = parseEventDate(event.start, event.isAllDay);
  if (Number.isNaN(start.getTime())) return "";
  const end = event.end ? parseEventDate(event.end, event.isAllDay) : null;
  const startLabel = timeFormatter.format(start);
  if (!end || Number.isNaN(end.getTime())) return startLabel;
  return `${startLabel} - ${timeFormatter.format(end)}`;
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
      setSubmitError("Connect Google Calendar to add events.");
      return;
    }
    if (!startValue) {
      setSubmitError(allDay ? "Select a start date." : "Select a start time.");
      return;
    }
    clearMessages();

    let startPayload: string;
    let endPayload: string;

    try {
      if (allDay) {
        const startDateString = startValue.slice(0, 10);
        if (startDateString.length !== 10) throw new Error("Invalid start date.");
        let endDateString = endValue ? endValue.slice(0, 10) : startDateString;
        if (endDateString.length !== 10) endDateString = startDateString;
        if (endDateString < startDateString) throw new Error("End date must be on or after start date.");
        startPayload = startDateString;
        endPayload = addDays(endDateString, 1);
      } else {
        const startDate = new Date(startValue);
        if (Number.isNaN(startDate.getTime())) throw new Error("Invalid start time.");
        let endDate: Date;
        if (endValue) {
          endDate = new Date(endValue);
          if (Number.isNaN(endDate.getTime())) throw new Error("Invalid end time.");
        } else {
          endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
        }
        if (endDate <= startDate) throw new Error("End time must be after the start time.");
        startPayload = startDate.toISOString();
        endPayload = endDate.toISOString();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitError(message || "Invalid date selection.");
      return;
    }

    setSubmitting(true);
    try {
      await createEvent({
        title: title.trim() || "Untitled event",
        start: startPayload,
        end: endPayload,
        isAllDay: allDay,
        location: location.trim() || undefined,
        description: notes.trim() || undefined,
      });
      setSubmitSuccess("Event added to Google Calendar.");
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
      setSubmitError(message || "Failed to add event.");
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
        <h2>Today</h2>
        <p>Priorities and upcoming events</p>
      </header>

      <div className="home-grid">
        <div className="card add-event">
          <h3>Quick Add Event</h3>
          {isConnected ? (
            <form className="add-form" onSubmit={handleCreateEvent}>
              <label className="field-group">
                <span>Title</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    clearMessages();
                  }}
                  placeholder="Team sync"
                />
              </label>
              <div className="field-row">
                <label className="field-group">
                  <span>Starts</span>
                  <input
                    type={allDay ? "date" : "datetime-local"}
                    value={startValue}
                    onChange={(e) => handleStartChange(e.target.value)}
                    required
                  />
                </label>
                <label className="field-group">
                  <span>Ends</span>
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
                <span>All day</span>
              </label>
              <label className="field-group">
                <span>Location</span>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    clearMessages();
                  }}
                  placeholder="Office, video call link..."
                />
              </label>
              <label className="field-group">
                <span>Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    clearMessages();
                  }}
                  placeholder="Agenda or context"
                  rows={3}
                />
              </label>
              <div className="form-actions">
                <button type="submit" className="primary-btn" disabled={submitting}>
                  {submitting ? "Adding..." : "Add to calendar"}
                </button>
                {submitSuccess && <span className="success-text">{submitSuccess}</span>}
                {submitError && <span className="error-text">{submitError}</span>}
              </div>
            </form>
          ) : (
            <div className="empty">
              <p>Connect Google Calendar to add events from here.</p>
              <button className="primary-btn" onClick={() => connect()} disabled={isConnecting}>
                {isConnecting ? "Connecting..." : "Connect"}
              </button>
            </div>
          )}
        </div>

        <div className="card event highlight">
          <h3>Next Event</h3>
          {isConnected ? (
            showInitialLoad ? (
              <p className="muted">Loading events...</p>
            ) : nextEvent ? (
              <div className="event-main">
                <span className="event-day">
                  {isEventToday(nextEvent) ? "Today" : formatDayLabel(nextEvent)}
                </span>
                <span className="event-title">{nextEvent.title}</span>
                <span className="event-time">{formatTimeRange(nextEvent)}</span>
                {nextEvent.location && (
                  <span className="event-location">{nextEvent.location}</span>
                )}
                {nextEvent.htmlLink && (
                  <a className="event-link" href={nextEvent.htmlLink} target="_blank" rel="noreferrer">
                    Open in Google Calendar
                  </a>
                )}
              </div>
            ) : (
              <p className="muted">No upcoming events in your calendar.</p>
            )
          ) : (
            <div className="empty">
              <p>Connect Google Calendar to surface your next event.</p>
              <button className="primary-btn" onClick={() => connect()} disabled={isConnecting}>
                {isConnecting ? "Connecting..." : "Connect Google Calendar"}
              </button>
            </div>
          )}
        </div>

        <div className="card events-list">
          <h3>Upcoming Events</h3>
          {isConnected ? (
            <>
              {showInitialLoad ? (
                <p className="muted">Loading events...</p>
              ) : laterEvents.length > 0 ? (
                <ul className="event-list">
                  {laterEvents.map((event) => (
                    <li key={event.id} className="event-item">
                      <div className="event-item-info">
                        <span className="event-item-title">{event.title}</span>
                        <span className="event-item-meta">
                          {isEventToday(event)
                            ? `Today | ${formatTimeRange(event)}`
                            : `${formatDayLabel(event)} | ${formatTimeRange(event)}`}
                        </span>
                        {event.location && (
                          <span className="event-item-location">{event.location}</span>
                        )}
                      </div>
                      {event.htmlLink && (
                        <a className="event-open" href={event.htmlLink} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : nextEvent ? (
                <p className="muted">Nothing else on the horizon.</p>
              ) : (
                <p className="muted">Your calendar is clear for now.</p>
              )}
              {eventsError && <p className="error-text">{eventsError}</p>}
            </>
          ) : (
            <p className="muted">Connect Google Calendar to list your upcoming events.</p>
          )}
        </div>

        <div className="card sync">
          <h3>Calendar Sync</h3>
          {isConnected ? (
            <>
              <p className="muted">Signed in as {profile?.email ?? "Google account"}.</p>
              <div className="meta-row">
                <span className="badge">
                  {eventsFetchedAt ? `Events updated ${formatRelativeTime(eventsFetchedAt)}` : "Events not loaded yet"}
                </span>
                {lastSync && <span className="badge gray">Calendar checked {formatRelativeTime(lastSync)}</span>}
              </div>
              <button className="ghost-btn" onClick={() => void reloadEvents()} disabled={eventsLoading}>
                {eventsLoading ? "Refreshing..." : "Refresh events"}
              </button>
            </>
          ) : (
            <div className="empty">
              <p>Connect Google Calendar to keep this dashboard up to date.</p>
              <button className="primary-btn" onClick={() => connect()} disabled={isConnecting}>
                {isConnecting ? "Connecting..." : "Connect"}
              </button>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
