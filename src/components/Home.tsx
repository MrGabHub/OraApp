import { useEffect, useMemo } from "react";
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
  } = useGoogleCalendar();

  const isConnected = status === "connected";
  const isConnecting = calendarConnecting;
  const showInitialLoad = eventsLoading && events.length === 0;

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
