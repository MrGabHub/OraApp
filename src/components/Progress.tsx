import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useGoogleCalendar, type GoogleCalendarEvent } from "../hooks/useGoogleCalendar";
import { formatRelativeTime } from "../utils/time";
import "./progress.css";

const WORK_START_HOUR = 8;
const WORK_END_HOUR = 18;
const MIN_FOCUS_MINUTES = 90;
const LATE_WRAP_HOUR = 18.5;

type TimedEvent = GoogleCalendarEvent & {
  startDate: Date;
  endDate: Date;
};

type DayBucket = {
  day: Date;
  events: TimedEvent[];
};

type FocusWindow = {
  day: Date;
  start: Date;
  end: Date;
  durationMinutes: number;
};

type BusyDay = {
  day: Date;
  count: number;
};

type LateWrap = {
  day: Date;
  end: Date;
};

type InsightSummary = {
  buckets: DayBucket[];
  avgStartMinutes?: number;
  avgMeetingsPerDay?: number;
  focusWindow?: FocusWindow;
  busyDay?: BusyDay;
  lateWrap?: LateWrap;
};

type SuggestionCopy = {
  id: string;
  tone: "focus" | "balance" | "energy";
  title: string;
  body: string;
  action?: string;
};

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function toTimedEvent(event: GoogleCalendarEvent): TimedEvent | null {
  const startDate = new Date(event.start);
  if (Number.isNaN(startDate.getTime())) return null;
  const endDateRaw = event.end ? new Date(event.end) : null;
  const endDate =
    !endDateRaw || Number.isNaN(endDateRaw.getTime()) ? new Date(startDate.getTime() + 30 * 60 * 1000) : endDateRaw;
  return { ...event, startDate, endDate };
}

function minutesBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 60000);
}

function buildBuckets(events: TimedEvent[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  events.forEach((evt) => {
    const key = evt.startDate.toISOString().slice(0, 10);
    if (!map.has(key)) {
      map.set(key, { day: startOfDay(evt.startDate), events: [] });
    }
    map.get(key)!.events.push(evt);
  });
  map.forEach((bucket) => {
    bucket.events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  });
  return Array.from(map.values()).sort((a, b) => a.day.getTime() - b.day.getTime());
}

function findFocusWindow(buckets: DayBucket[]): FocusWindow | undefined {
  for (const bucket of buckets) {
    const workStart = new Date(bucket.day);
    workStart.setHours(WORK_START_HOUR, 0, 0, 0);
    const workEnd = new Date(bucket.day);
    workEnd.setHours(WORK_END_HOUR, 0, 0, 0);
    let cursor = workStart;
    const withinDay = bucket.events.filter((evt) => evt.endDate > workStart && evt.startDate < workEnd);
    if (withinDay.length === 0) {
      const duration = minutesBetween(workStart, workEnd);
      if (duration >= MIN_FOCUS_MINUTES) {
        return { day: bucket.day, start: workStart, end: workEnd, durationMinutes: duration };
      }
      continue;
    }
    for (const evt of withinDay) {
      if (evt.startDate.getTime() - cursor.getTime() >= MIN_FOCUS_MINUTES * 60000) {
        const gapEnd = new Date(Math.min(evt.startDate.getTime(), workEnd.getTime()));
        return {
          day: bucket.day,
          start: new Date(cursor),
          end: gapEnd,
          durationMinutes: minutesBetween(cursor, gapEnd),
        };
      }
      if (evt.endDate.getTime() > cursor.getTime()) {
        cursor = new Date(evt.endDate);
      }
      if (cursor >= workEnd) break;
    }
    if (workEnd.getTime() - cursor.getTime() >= MIN_FOCUS_MINUTES * 60000) {
      return {
        day: bucket.day,
        start: new Date(cursor),
        end: workEnd,
        durationMinutes: minutesBetween(cursor, workEnd),
      };
    }
  }
  return undefined;
}

function findBusyDay(buckets: DayBucket[]): BusyDay | undefined {
  if (!buckets.length) return undefined;
  const sorted = [...buckets].sort((a, b) => b.events.length - a.events.length);
  const top = sorted[0];
  if (top.events.length < 3) return undefined;
  return { day: top.day, count: top.events.length };
}

function findLateWrap(events: TimedEvent[]): LateWrap | undefined {
  const candidate = events
    .filter((evt) => {
      const endHour = evt.endDate.getHours() + evt.endDate.getMinutes() / 60;
      return endHour >= LATE_WRAP_HOUR;
    })
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime())[0];
  if (!candidate) return undefined;
  return { day: startOfDay(candidate.startDate), end: candidate.endDate };
}

function buildInsights(events: GoogleCalendarEvent[]): InsightSummary {
  const now = Date.now() - 30 * 60 * 1000;
  const timedEvents = events
    .map(toTimedEvent)
    .filter((evt): evt is TimedEvent => Boolean(evt))
    .filter((evt) => evt.startDate.getTime() >= now)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const buckets = buildBuckets(timedEvents);
  const focusWindow = findFocusWindow(buckets);
  const busyDay = findBusyDay(buckets);
  const lateWrap = findLateWrap(timedEvents);

  const earliestStarts = buckets
    .map((bucket) => bucket.events[0]?.startDate)
    .filter((date): date is Date => Boolean(date));

  const avgStartMinutes =
    earliestStarts.length > 0
      ? Math.round(
          earliestStarts.reduce((acc, date) => acc + date.getHours() * 60 + date.getMinutes(), 0) / earliestStarts.length,
        )
      : undefined;

  const avgMeetingsPerDay =
    buckets.length > 0 ? Number((timedEvents.length / buckets.length).toFixed(1)) : timedEvents.length || undefined;

  return { buckets, avgStartMinutes, avgMeetingsPerDay, focusWindow, busyDay, lateWrap };
}

function minutesToTimeLabel(minutes: number, formatter: Intl.DateTimeFormat): string {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setMinutes(minutes);
  return formatter.format(base);
}

function formatRange(start: Date, end: Date, formatter: Intl.DateTimeFormat): string {
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function formatDuration(t: (key: string, opts?: Record<string, unknown>) => string, minutes: number): string {
  if (minutes < 60) {
    return t("progress.duration.minutes", { count: minutes });
  }
  const hours = minutes / 60;
  if (Number.isInteger(hours)) {
    return t("progress.duration.hours", { count: hours });
  }
  const rounded = Math.floor(hours);
  const remainder = minutes - rounded * 60;
  return t("progress.duration.hoursAndMinutes", { hours: rounded, minutes: remainder });
}

export default function Progress() {
  const { t, i18n } = useTranslation();
  const { status, events, eventsLoading, eventsFetchedAt, connect } = useGoogleCalendar();
  const isConnected = status === "connected";

  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: "long",
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

  const insights = useMemo(() => buildInsights(events), [events]);

  const habitChips = useMemo(() => {
    const chips: string[] = [];
    if (typeof insights.avgStartMinutes === "number") {
      const label = minutesToTimeLabel(insights.avgStartMinutes, timeFormatter);
      chips.push(t("progress.habits.avgStart", { time: label }));
    }
    if (typeof insights.avgMeetingsPerDay === "number") {
      chips.push(t("progress.habits.load", { count: insights.avgMeetingsPerDay }));
    }
    if (insights.focusWindow) {
      chips.push(
        t("progress.habits.focus", {
          day: dayFormatter.format(insights.focusWindow.day),
          range: formatRange(insights.focusWindow.start, insights.focusWindow.end, timeFormatter),
        }),
      );
    }
    return chips;
  }, [dayFormatter, insights.avgMeetingsPerDay, insights.avgStartMinutes, insights.focusWindow, t, timeFormatter]);

  const suggestionCards = useMemo(() => {
    if (!isConnected) {
      const offline = t("progress.offlineSuggestions", { returnObjects: true }) as Omit<SuggestionCopy, "tone">[];
      return offline.map((item, index) => ({
        ...item,
        id: `offline-${index}`,
        tone: "balance" as const,
      }));
    }

    const cards: SuggestionCopy[] = [];

    if (insights.focusWindow) {
      cards.push({
        id: "focus-window",
        tone: "focus",
        title: t("progress.suggestions.focusBlock.title"),
        body: t("progress.suggestions.focusBlock.body", {
          day: dayFormatter.format(insights.focusWindow.day),
          range: formatRange(insights.focusWindow.start, insights.focusWindow.end, timeFormatter),
          duration: formatDuration(t, insights.focusWindow.durationMinutes),
        }),
        action: t("progress.suggestions.focusBlock.action"),
      });
    }

    if (insights.busyDay) {
      cards.push({
        id: "balance-load",
        tone: "balance",
        title: t("progress.suggestions.balanceDay.title"),
        body: t("progress.suggestions.balanceDay.body", {
          day: dayFormatter.format(insights.busyDay.day),
          count: insights.busyDay.count,
        }),
        action: t("progress.suggestions.balanceDay.action"),
      });
    }

    if (insights.lateWrap) {
      cards.push({
        id: "protect-evening",
        tone: "energy",
        title: t("progress.suggestions.wrap.title"),
        body: t("progress.suggestions.wrap.body", {
          day: dayFormatter.format(insights.lateWrap.day),
          time: timeFormatter.format(insights.lateWrap.end),
        }),
        action: t("progress.suggestions.wrap.action"),
      });
    }

    if (!cards.length) {
      const backups = t("progress.genericSuggestions", { returnObjects: true }) as SuggestionCopy[];
      return backups.map((item, idx) => ({ ...item, id: `generic-${idx}` }));
    }

    return cards;
  }, [
    dayFormatter,
    i18n.language,
    insights.busyDay,
    insights.focusWindow,
    insights.lateWrap,
    isConnected,
    t,
    timeFormatter,
  ]);

  const metaLabel = useMemo(() => {
    if (!isConnected) return t("progress.meta.disconnected");
    if (eventsLoading) return t("progress.meta.loading");
    if (eventsFetchedAt) {
      return t("progress.meta.updated", { time: formatRelativeTime(eventsFetchedAt, t) });
    }
    return t("progress.meta.idle");
  }, [eventsFetchedAt, eventsLoading, isConnected, t]);

  return (
    <section className="progress">
      <header className="progress__header">
        <span className="eyebrow">{t("progress.header.eyebrow")}</span>
        <h2>{t("progress.header.title")}</h2>
        <p>{t("progress.header.subtitle")}</p>
      </header>

      <div className="progress__meta">
        <span className={`progress__status progress__status--${isConnected ? "ok" : "idle"}`}>{metaLabel}</span>
        {!isConnected && (
          <button className="btn btn-primary" type="button" onClick={() => connect?.()}>
            {t("progress.actions.connect")}
          </button>
        )}
      </div>

      {habitChips.length > 0 && (
        <div className="progress__habits card">
          <div>
            <span className="eyebrow">{t("progress.habits.title")}</span>
            <p>{t("progress.habits.subtitle")}</p>
          </div>
          <div className="progress__habit-chips">
            {habitChips.map((chip) => (
              <span key={chip} className="progress__habit-chip">
                {chip}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="progress__suggestions">
        {suggestionCards.map((card) => (
          <article key={card.id} className={`suggestion-card suggestion-card--${card.tone}`}>
            <div className="suggestion-card__body">
              <span className="eyebrow">{t("progress.suggestions.eyebrow")}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </div>
            {card.action && (
              <button className="suggestion-card__action" type="button">
                {card.action}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

