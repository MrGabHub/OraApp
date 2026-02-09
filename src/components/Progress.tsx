import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useGoogleCalendar, type GoogleCalendarEvent } from "../hooks/useGoogleCalendar";
import "./progress.css";

function startOfMonth(date: Date): Date {
  const next = new Date(date);
  next.setDate(1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function eventDayKey(event: GoogleCalendarEvent): string {
  if (event.isAllDay && /^\d{4}-\d{2}-\d{2}$/.test(event.start)) {
    return event.start;
  }
  return toDateKey(new Date(event.start));
}

function buildMonthGrid(monthDate: Date): Date[] {
  const first = startOfMonth(monthDate);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startOffset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    days.push(day);
  }
  return days;
}

export default function Progress() {
  const { t, i18n } = useTranslation();
  const { status, connect, fetchEventsInRange } = useGoogleCalendar();
  const isConnected = status === "connected";

  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => toDateKey(new Date()));
  const [monthEvents, setMonthEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: "long",
        year: "numeric",
      }).format(monthDate),
    [i18n.language, monthDate],
  );

  const dayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [i18n.language],
  );

  const timeLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [i18n.language],
  );

  useEffect(() => {
    if (!isConnected) {
      setMonthEvents([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const events = await fetchEventsInRange({
          timeMin: startOfMonth(monthDate).toISOString(),
          timeMax: endOfMonth(monthDate).toISOString(),
        });
        if (!cancelled) setMonthEvents(events);
      } catch (err) {
        if (!cancelled) {
          setMonthEvents([]);
          setError(err instanceof Error ? err.message : "Failed to load calendar.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [fetchEventsInRange, isConnected, monthDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, GoogleCalendarEvent[]>();
    monthEvents.forEach((event) => {
      const key = eventDayKey(event);
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(event);
    });

    map.forEach((events) => {
      events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    });

    return map;
  }, [monthEvents]);

  const gridDays = useMemo(() => buildMonthGrid(monthDate), [monthDate]);
  const selectedEvents = useMemo(() => eventsByDay.get(selectedDay) ?? [], [eventsByDay, selectedDay]);
  const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;

  return (
    <section className="calendar-view">
      <header className="calendar-view__header">
        <span className="eyebrow">{t("navigation.progress", "Calendrier")}</span>
        <h2>{t("calendar.title", "Vue calendrier")}</h2>
        <p>{t("calendar.subtitle", "Visualise tes événements du mois et leur disponibilité.")}</p>
      </header>

      {!isConnected ? (
        <article className="card calendar-view__empty">
          <p>{t("calendar.connectRequired", "Connecte ton Google Calendar pour afficher la vue mensuelle.")}</p>
          <button type="button" className="btn btn-primary" onClick={() => connect?.()}>
            {t("calendar.connect", "Connecter Google Calendar")}
          </button>
        </article>
      ) : (
        <div className="calendar-layout">
          <article className="card calendar-month">
            <div className="calendar-month__top">
              <button
                type="button"
                className="calendar-month__nav-btn"
                onClick={() => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                aria-label={t("calendar.prevMonth", "Mois précédent")}
              >
                <ChevronLeft size={18} />
              </button>
              <h3>{monthLabel}</h3>
              <button
                type="button"
                className="calendar-month__nav-btn"
                onClick={() => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                aria-label={t("calendar.nextMonth", "Mois suivant")}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="calendar-month__weekdays">
              {[
                t("calendar.weekday.mon", "Lun"),
                t("calendar.weekday.tue", "Mar"),
                t("calendar.weekday.wed", "Mer"),
                t("calendar.weekday.thu", "Jeu"),
                t("calendar.weekday.fri", "Ven"),
                t("calendar.weekday.sat", "Sam"),
                t("calendar.weekday.sun", "Dim"),
              ].map((d) => (
                <span key={`${monthKey}-${d}`}>{d}</span>
              ))}
            </div>

            <div className="calendar-month__grid">
              {gridDays.map((day) => {
                const dayKey = toDateKey(day);
                const inCurrentMonth = day.getMonth() === monthDate.getMonth();
                const count = (eventsByDay.get(dayKey) ?? []).length;
                const isSelected = dayKey === selectedDay;
                return (
                  <button
                    key={`${monthKey}-${dayKey}`}
                    type="button"
                    className={`calendar-day${inCurrentMonth ? "" : " is-outside"}${isSelected ? " is-selected" : ""}`}
                    onClick={() => setSelectedDay(dayKey)}
                  >
                    <span className="calendar-day__num">{day.getDate()}</span>
                    {count > 0 && <span className="calendar-day__badge">{count}</span>}
                  </button>
                );
              })}
            </div>

            {loading && <p className="calendar-month__hint">{t("calendar.loading", "Chargement...")}</p>}
            {error && <p className="calendar-month__hint calendar-month__hint--error">{error}</p>}
          </article>

          <article className="card calendar-events">
            <h3>{dayLabel.format(new Date(`${selectedDay}T00:00:00`))}</h3>
            {selectedEvents.length === 0 ? (
              <p className="calendar-events__empty">{t("calendar.emptyDay", "Aucun événement ce jour.")}</p>
            ) : (
              <ul className="calendar-events__list">
                {selectedEvents.map((event) => (
                  <li key={event.id} className="calendar-events__item">
                    <div>
                      <strong>{event.title}</strong>
                      <p>
                        {event.isAllDay
                          ? t("calendar.allDay", "Toute la journée")
                          : `${timeLabel.format(new Date(event.start))} - ${
                              event.end ? timeLabel.format(new Date(event.end)) : "?"
                            }`}
                      </p>
                    </div>
                    <div className="calendar-events__meta">
                      <span className={`chip ${event.transparency === "transparent" ? "chip--free" : "chip--busy"}`}>
                        {event.transparency === "transparent"
                          ? t("calendar.free", "Libre")
                          : t("calendar.busy", "Occupé")}
                      </span>
                      <span className="chip chip--privacy">
                        {event.visibility === "public"
                          ? t("calendar.public", "Public")
                          : event.visibility === "private"
                            ? t("calendar.private", "Privé")
                            : t("calendar.default", "Par défaut")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      )}
    </section>
  );
}