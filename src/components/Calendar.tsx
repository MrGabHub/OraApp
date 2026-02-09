import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useGoogleCalendar, type GoogleCalendarEvent } from "../hooks/useGoogleCalendar";
import { useAuth } from "../hooks/useAuth";
import { useFriends } from "../hooks/useFriends";
import "./calendar.css";

type CalendarEventEntry = {
  key: string;
  ownerUid: string;
  ownerLabel: string;
  event: GoogleCalendarEvent;
};

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

export default function Calendar() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { friends, users } = useFriends();
  const { status, connect, fetchEventsInRange } = useGoogleCalendar();
  const isConnected = status === "connected";

  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => toDateKey(new Date()));
  const [monthEvents, setMonthEvents] = useState<CalendarEventEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [friendsWarning, setFriendsWarning] = useState<string | null>(null);
  const [friendCalendarStatus, setFriendCalendarStatus] = useState<Record<string, "ok" | "missing">>({});
  const [visibleOwnerIds, setVisibleOwnerIds] = useState<string[]>([]);

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

  const sharedFriends = useMemo(
    () =>
      friends
        .map((entry) => {
          const friendUser = users[entry.friendUid];
          const email = friendUser?.email?.toLowerCase();
          if (!entry.calendarSharedByFriend || !email) return null;
          return {
            uid: entry.friendUid,
            calendarId: email,
            ownerLabel:
              friendUser?.displayName?.trim() ||
              friendUser?.handle?.trim() ||
              friendUser?.email?.trim() ||
              t("friends.status.unknown", "Inconnu"),
          };
        })
        .filter((value): value is { uid: string; calendarId: string; ownerLabel: string } => Boolean(value)),
    [friends, t, users],
  );
  const selfOwnerId = user?.uid ?? "self";

  useEffect(() => {
    const availableIds = [selfOwnerId, ...sharedFriends.map((friend) => friend.uid)];
    setVisibleOwnerIds((current) => {
      if (current.length === 0) return availableIds;
      const currentSet = new Set(current);
      const kept = availableIds.filter((id) => currentSet.has(id));
      const missing = availableIds.filter((id) => !currentSet.has(id));
      return [...kept, ...missing];
    });
  }, [selfOwnerId, sharedFriends]);

  useEffect(() => {
    if (!isConnected) {
      setMonthEvents([]);
      setError(null);
      setFriendsWarning(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setFriendsWarning(null);
      setFriendCalendarStatus({});

      const range = {
        timeMin: startOfMonth(monthDate).toISOString(),
        timeMax: endOfMonth(monthDate).toISOString(),
      };

      try {
        const ownEvents = await fetchEventsInRange(range);
        if (cancelled) return;

        const ownLabel = t("calendar.ownerYou", "Toi");
        const merged: CalendarEventEntry[] = ownEvents.map((event) => ({
          key: `self:${event.id}`,
          ownerUid: user?.uid ?? "self",
          ownerLabel: ownLabel,
          event,
        }));

        if (sharedFriends.length > 0) {
          const results = await Promise.allSettled(
            sharedFriends.map(async (friend) => {
              const events = await fetchEventsInRange(range, { calendarId: friend.calendarId });
              return {
                friend,
                events,
              };
            }),
          );

          const unavailableFriends: string[] = [];
          const friendStatus: Record<string, "ok" | "missing"> = {};

          results.forEach((result, index) => {
            const friend = sharedFriends[index];
            if (!friend) return;
            if (result.status === "fulfilled") {
              friendStatus[friend.uid] = "ok";
              result.value.events.forEach((event) => {
                merged.push({
                  key: `${result.value.friend.uid}:${event.id}`,
                  ownerUid: result.value.friend.uid,
                  ownerLabel: result.value.friend.ownerLabel,
                  event,
                });
              });
              return;
            }

            const reason = result.reason as { status?: number; message?: string } | undefined;
            if (reason?.status === 404) {
              friendStatus[friend.uid] = "missing";
              unavailableFriends.push(friend.ownerLabel);
            }
          });

          if (!cancelled) {
            setFriendCalendarStatus(friendStatus);
          }

          if (!cancelled && unavailableFriends.length > 0) {
            setFriendsWarning(
              t("calendar.friendsUnavailable", {
                defaultValue: "Certains calendriers amis sont indisponibles : {{names}}",
                names: unavailableFriends.join(", "),
              }),
            );
          }
        }

        merged.sort((a, b) => new Date(a.event.start).getTime() - new Date(b.event.start).getTime());
        if (!cancelled) setMonthEvents(merged);
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
  }, [fetchEventsInRange, isConnected, monthDate, sharedFriends, t, user?.uid]);

  const eventsByDay = useMemo(() => {
    const visibleSet = new Set(visibleOwnerIds);
    const map = new Map<string, CalendarEventEntry[]>();
    monthEvents
      .filter((entry) => visibleSet.has(entry.ownerUid))
      .forEach((entry) => {
      const key = eventDayKey(entry.event);
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(entry);
      });

    map.forEach((entries) => {
      entries.sort((a, b) => new Date(a.event.start).getTime() - new Date(b.event.start).getTime());
    });

    return map;
  }, [monthEvents]);

  const gridDays = useMemo(() => buildMonthGrid(monthDate), [monthDate]);
  const selectedEvents = useMemo(() => eventsByDay.get(selectedDay) ?? [], [eventsByDay, selectedDay]);
  const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
  const ownerOptions = useMemo(
    () => [
      {
        ownerUid: selfOwnerId,
        ownerLabel: t("calendar.ownerYou", "Toi"),
        status: "ok" as const,
      },
      ...sharedFriends.map((friend) => ({
        ownerUid: friend.uid,
        ownerLabel: friend.ownerLabel,
        status: friendCalendarStatus[friend.uid] ?? "ok",
      })),
    ],
    [friendCalendarStatus, selfOwnerId, sharedFriends, t],
  );

  return (
    <section className="calendar-view">
      <header className="calendar-view__header">
        <span className="eyebrow">{t("navigation.progress", "Calendrier")}</span>
        <span className="calendar-view__icon" aria-hidden>
          <CalendarDays size={18} />
        </span>
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
            {friendsWarning && <p className="calendar-month__hint">{friendsWarning}</p>}
          </article>

          <div className="calendar-side">
            <article className="card calendar-sources">
              <div className="calendar-sources__header">
                <h3>{t("calendar.syncedCalendarsTitle", "Calendriers synchronisés")}</h3>
                <div className="calendar-sources__bulk-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setVisibleOwnerIds(ownerOptions.map((item) => item.ownerUid))}
                  >
                    {t("calendar.showAll", "Tout afficher")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setVisibleOwnerIds([selfOwnerId])}
                  >
                    {t("calendar.hideAllFriends", "Masquer les amis")}
                  </button>
                </div>
              </div>
              <div className="calendar-sources__list">
                {ownerOptions.map((owner) => {
                  const checked = visibleOwnerIds.includes(owner.ownerUid);
                  const unavailable = owner.status === "missing";
                  return (
                    <label key={owner.ownerUid} className={`calendar-source ${unavailable ? "is-missing" : ""}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setVisibleOwnerIds((current) => {
                            if (event.target.checked) {
                              if (current.includes(owner.ownerUid)) return current;
                              return [...current, owner.ownerUid];
                            }
                            return current.filter((id) => id !== owner.ownerUid);
                          });
                        }}
                      />
                      <span className="calendar-source__name">{owner.ownerLabel}</span>
                      <span className={`calendar-source__status ${unavailable ? "is-missing" : "is-ok"}`}>
                        {unavailable
                          ? t("calendar.calendarUnavailable", "Non disponible")
                          : t("calendar.calendarAvailable", "Actif")}
                      </span>
                    </label>
                  );
                })}
              </div>
            </article>

            <article className="card calendar-events">
              <h3>{dayLabel.format(new Date(`${selectedDay}T00:00:00`))}</h3>
              {selectedEvents.length === 0 ? (
                <p className="calendar-events__empty">{t("calendar.emptyDay", "Aucun événement ce jour.")}</p>
              ) : (
                <ul className="calendar-events__list">
                  {selectedEvents.map((entry) => {
                    const event = entry.event;
                    return (
                      <li key={entry.key} className="calendar-events__item">
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
                          <span className="chip chip--owner">
                            {t("calendar.owner", { defaultValue: "Calendrier : {{name}}", name: entry.ownerLabel })}
                          </span>
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
                    );
                  })}
                </ul>
              )}
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
