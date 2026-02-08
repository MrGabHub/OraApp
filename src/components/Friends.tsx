import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Mail, Search, UserPlus, Users } from "lucide-react";
import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { useAuth } from "../hooks/useAuth";
import { useFriends, type PublicUser } from "../hooks/useFriends";
import { useGoogleCalendar } from "../hooks/useGoogleCalendar";
import { buildAvailabilitySlots, formatDateKey, type AvailabilitySlot } from "../lib/availability";
import { startBackgroundCalendarConsent } from "../lib/calendarConsent";
import { db } from "../lib/firebase";
import { formatRelativeTime } from "../utils/time";
import "./friends.css";

type AvailabilitySnapshot = {
  state: "free" | "busy" | "unknown" | "stale";
  updatedAt: number | null;
};

const STALE_MS = 36 * 60 * 60 * 1000;
const AVAILABILITY_DAYS = 7;

function resolveNowSlot(slots: AvailabilitySlot[] | undefined, now: Date): "free" | "busy" | "unknown" {
  if (!slots || slots.length === 0) return "unknown";
  const nowTime = now.getTime();
  const match = slots.find((slot) => {
    const start = new Date(slot.start).getTime();
    const end = new Date(slot.end).getTime();
    return nowTime >= start && nowTime < end;
  });
  return match?.state ?? "unknown";
}

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return null;
}

export default function Friends() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const {
    incomingRequests,
    outgoingRequests,
    friends,
    users,
    hasAutoSync,
    searchUsers,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    toggleAutoSync,
  } = useFriends();
  const { status: googleStatus, connect: connectGoogle, fetchEventsInRange } = useGoogleCalendar();

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResult, setSearchResult] = useState<PublicUser | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [requestActionError, setRequestActionError] = useState<string | null>(null);

  const [publishStatus, setPublishStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [friendAvailability, setFriendAvailability] = useState<Record<string, AvailabilitySnapshot>>({});
  const autoSyncRef = useRef(false);

  const isConnected = googleStatus === "connected";
  const isAlreadyFriend = searchResult ? friends.some((friend) => friend.friendUid === searchResult.uid) : false;
  const hasOutgoing = searchResult ? outgoingRequests.some((req) => req.toUid === searchResult.uid) : false;
  const hasIncoming = searchResult ? incomingRequests.some((req) => req.fromUid === searchResult.uid) : false;

  const refreshLastUpdated = useCallback(async () => {
    if (!user) return;
    const todayKey = formatDateKey(new Date());
    const snapshot = await getDoc(doc(db, "availability", user.uid, "days", todayKey));
    if (!snapshot.exists()) {
      setLastUpdatedAt(null);
      return;
    }
    setLastUpdatedAt(toMillis(snapshot.data()?.updatedAt));
  }, [user]);

  useEffect(() => {
    void refreshLastUpdated();
  }, [refreshLastUpdated]);

  const publishAvailability = useCallback(async () => {
    if (!user) return;
    if (!isConnected) {
      setPublishError(t("friends.availability.connectPrompt"));
      setPublishStatus("error");
      return;
    }
    setPublishStatus("syncing");
    setPublishError(null);
    try {
      const start = new Date();
      const end = new Date();
      end.setDate(end.getDate() + AVAILABILITY_DAYS);
      const events = await fetchEventsInRange({ timeMin: start.toISOString(), timeMax: end.toISOString() });
      const days = buildAvailabilitySlots({ events, startDate: start, days: AVAILABILITY_DAYS, slotMinutes: 30 });
      const batch = writeBatch(db);
      const updatedAt = serverTimestamp();
      Object.entries(days).forEach(([dayKey, slots]) => {
        const ref = doc(db, "availability", user.uid, "days", dayKey);
        batch.set(ref, { slots, updatedAt }, { merge: true });
      });
      await batch.commit();
      setPublishStatus("success");
      setLastUpdatedAt(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPublishError(message);
      setPublishStatus("error");
    }
  }, [fetchEventsInRange, isConnected, t, user]);

  useEffect(() => {
    if (!user || !isConnected) return;
    if (!hasAutoSync) return;
    const cooldown = 6 * 60 * 60 * 1000;
    if (lastUpdatedAt && Date.now() - lastUpdatedAt < cooldown) return;
    if (autoSyncRef.current) return;
    autoSyncRef.current = true;
    void publishAvailability().finally(() => {
      autoSyncRef.current = false;
    });
  }, [hasAutoSync, isConnected, lastUpdatedAt, publishAvailability, user]);

  useEffect(() => {
    if (!friends.length) {
      setFriendAvailability({});
      return;
    }
    const todayKey = formatDateKey(new Date());
    const unsubscribers = friends.map((friend) => {
      const ref = doc(db, "availability", friend.friendUid, "days", todayKey);
      return onSnapshot(
        ref,
        (snapshot) => {
          if (!snapshot.exists()) {
            setFriendAvailability((prev) => ({
              ...prev,
              [friend.friendUid]: { state: "unknown", updatedAt: null },
            }));
            return;
          }
          const data = snapshot.data();
          const updatedAt = toMillis(data?.updatedAt);
          const now = new Date();
          const state = resolveNowSlot(data?.slots as AvailabilitySlot[] | undefined, now);
          const snapshotState: AvailabilitySnapshot = updatedAt && Date.now() - updatedAt > STALE_MS
            ? { state: "stale", updatedAt }
            : { state: state === "unknown" ? "unknown" : state, updatedAt };
          setFriendAvailability((prev) => ({
            ...prev,
            [friend.friendUid]: snapshotState,
          }));
        },
        (error) => {
          console.warn("Failed to load friend availability", error);
          setFriendAvailability((prev) => ({
            ...prev,
            [friend.friendUid]: { state: "unknown", updatedAt: null },
          }));
        },
      );
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [friends]);

  const handleSearch = useCallback(async () => {
    const cleaned = searchTerm.trim();
    if (!cleaned) return;
    if (!cleaned.includes("@")) {
      setSearchMessage(t("friends.search.invalidEmail"));
      setSearchStatus("done");
      return;
    }
    setSearchStatus("loading");
    setSearchMessage(null);
    try {
      const results = await searchUsers(cleaned);
      const match = results.find((item) => item.uid !== user?.uid) ?? null;
      if (!match) {
        setSearchResult(null);
        setSearchMessage(t("friends.search.noResult"));
      } else {
        setSearchResult(match);
      }
      setSearchStatus("done");
    } catch (err) {
      setSearchStatus("error");
      setSearchMessage(err instanceof Error ? err.message : t("friends.search.error"));
    }
  }, [searchTerm, searchUsers, t, user?.uid]);

  const handleSendRequest = useCallback(async () => {
    if (!searchResult) return;
    setSearchStatus("loading");
    setSearchMessage(null);
    try {
      const result = await sendFriendRequest(searchResult.uid);
      if (result === "incoming") {
        setSearchMessage(t("friends.search.incoming"));
      } else if (result === "accepted") {
        setSearchMessage(t("friends.search.alreadyFriends"));
      } else if (result === "pending") {
        setSearchMessage(t("friends.search.alreadySent"));
      } else {
        setSearchMessage(t("friends.search.requestSent"));
      }
      setSearchStatus("done");
    } catch (err) {
      setSearchStatus("error");
      setSearchMessage(err instanceof Error ? err.message : t("friends.search.error"));
    }
  }, [searchResult, sendFriendRequest, t]);

  const handleAccept = useCallback(async (uid: string) => {
    setRequestActionError(null);
    try {
      await acceptFriendRequest(uid);
      await startBackgroundCalendarConsent();
    } catch (err) {
      setRequestActionError(err instanceof Error ? err.message : t("friends.search.error"));
    }
  }, [acceptFriendRequest, t]);

  const handleDecline = useCallback(async (uid: string) => {
    setRequestActionError(null);
    try {
      await declineFriendRequest(uid);
    } catch (err) {
      setRequestActionError(err instanceof Error ? err.message : t("friends.search.error"));
    }
  }, [declineFriendRequest, t]);

  const handleCancel = useCallback(async (uid: string) => {
    setRequestActionError(null);
    try {
      await cancelFriendRequest(uid);
    } catch (err) {
      setRequestActionError(err instanceof Error ? err.message : t("friends.search.error"));
    }
  }, [cancelFriendRequest, t]);

  const renderUserLabel = (uid: string) => {
    const info = users[uid];
    if (!info) return uid.slice(0, 6);
    return info.displayName || info.handle || info.email || uid.slice(0, 6);
  };

  return (
    <section className="friends">
      <header className="friends-header">
        <div>
          <p className="eyebrow">{t("friends.eyebrow")}</p>
          <h2>{t("friends.title")}</h2>
          <p className="friends-subtitle">{t("friends.subtitle")}</p>
        </div>
        <div className="friends-handle">
          <span>{t("friends.handleLabel")}</span>
          <div className="friends-handle__value">
            {profile?.email && (
              <span className="friends-handle__email">
                <Mail size={14} aria-hidden />
                {profile.email}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="friends-grid">
        <article className="card friends-card">
          <div className="friends-card__header">
            <h3>{t("friends.availability.title")}</h3>
            <span className={`status-pill ${isConnected ? "on" : "off"}`}>
              {isConnected ? t("friends.availability.connected") : t("friends.availability.disconnected")}
            </span>
          </div>
          <p className="friends-card__desc">{t("friends.availability.desc")}</p>
          <div className="friends-card__meta">
            <span>
              {lastUpdatedAt
                ? t("friends.availability.updated", { time: formatRelativeTime(lastUpdatedAt, t) })
                : t("friends.availability.neverUpdated")}
            </span>
            {hasAutoSync && <span className="friends-card__pill">{t("friends.availability.autoSyncOn")}</span>}
          </div>
          {publishError && <p className="friends-card__error">{publishError}</p>}
          <div className="friends-card__actions">
            {!isConnected ? (
              <button className="btn btn-primary" onClick={connectGoogle}>
                {t("friends.availability.connectAction")}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={publishAvailability}
                disabled={publishStatus === "syncing"}
              >
                {publishStatus === "syncing" ? t("friends.availability.syncing") : t("friends.availability.sync")}
              </button>
            )}
          </div>
        </article>

        <article className="card friends-card">
          <div className="friends-card__header">
            <h3>{t("friends.search.title")}</h3>
          </div>
          <p className="friends-card__desc">{t("friends.search.desc")}</p>
          <div className="friends-search">
            <div className="friends-search__input">
              <Search size={16} aria-hidden />
              <input
                type="text"
                placeholder={t("friends.search.placeholder")}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleSearch();
                  }
                }}
              />
            </div>
            <button className="btn btn-ghost" onClick={handleSearch} disabled={searchStatus === "loading"}>
              {t("friends.search.action")}
            </button>
          </div>
          {searchMessage && <p className="friends-search__message">{searchMessage}</p>}
          {searchResult && (
            <div className="friends-search__result">
              <div className="friends-search__user">
                <div className="avatar">
                  <Users size={18} />
                </div>
                <div>
                  <p className="friends-search__name">{searchResult.displayName ?? searchResult.email}</p>
                  <p className="friends-search__handle">{searchResult.email}</p>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleSendRequest}
                disabled={isAlreadyFriend || hasOutgoing || hasIncoming}
              >
                <UserPlus size={16} />
                {isAlreadyFriend
                  ? t("friends.search.alreadyFriends")
                  : hasOutgoing
                  ? t("friends.search.alreadySent")
                  : hasIncoming
                  ? t("friends.search.incoming")
                  : t("friends.search.add")}
              </button>
            </div>
          )}
        </article>
      </div>

      <div className="friends-grid">
        <article className="card friends-card">
          <div className="friends-card__header">
            <h3>{t("friends.requests.incoming")}</h3>
            <span className="friends-card__count">{incomingRequests.length}</span>
          </div>
          {requestActionError && <p className="friends-card__error">{requestActionError}</p>}
          {incomingRequests.length === 0 ? (
            <p className="friends-empty">{t("friends.requests.none")}</p>
          ) : (
            <div className="friends-list">
              {incomingRequests.map((req) => (
                <div key={req.id} className="friends-item">
                  <div>
                    <p className="friends-item__name">{renderUserLabel(req.fromUid)}</p>
                    <p className="friends-item__meta">{t("friends.requests.requested")}</p>
                  </div>
                  <div className="friends-item__actions">
                    <button className="btn btn-primary" onClick={() => handleAccept(req.fromUid)}>
                      <Check size={14} /> {t("friends.requests.accept")}
                    </button>
                    <button className="btn btn-ghost" onClick={() => handleDecline(req.fromUid)}>
                      {t("friends.requests.decline")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="card friends-card">
          <div className="friends-card__header">
            <h3>{t("friends.requests.outgoing")}</h3>
            <span className="friends-card__count">{outgoingRequests.length}</span>
          </div>
          {requestActionError && <p className="friends-card__error">{requestActionError}</p>}
          {outgoingRequests.length === 0 ? (
            <p className="friends-empty">{t("friends.requests.noneSent")}</p>
          ) : (
            <div className="friends-list">
              {outgoingRequests.map((req) => (
                <div key={req.id} className="friends-item">
                  <div>
                    <p className="friends-item__name">{renderUserLabel(req.toUid)}</p>
                    <p className="friends-item__meta">{t("friends.requests.pending")}</p>
                  </div>
                  <div className="friends-item__actions">
                    <button className="btn btn-ghost" onClick={() => handleCancel(req.toUid)}>
                      {t("friends.requests.cancel")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      <article className="card friends-card">
        <div className="friends-card__header">
          <h3>{t("friends.list.title")}</h3>
          <span className="friends-card__count">{friends.length}</span>
        </div>
        {friends.length === 0 ? (
          <p className="friends-empty">{t("friends.list.empty")}</p>
        ) : (
          <div className="friends-list">
            {friends.map((friend) => {
              const snapshot = friendAvailability[friend.friendUid];
              const status = snapshot?.state ?? "unknown";
              const updatedAt = snapshot?.updatedAt ?? null;
              return (
                <div key={friend.friendUid} className="friends-item">
                  <div>
                    <p className="friends-item__name">{renderUserLabel(friend.friendUid)}</p>
                    <p className={`friends-item__meta status-${status}`}>
                      {status === "busy"
                        ? t("friends.status.busy")
                        : status === "free"
                        ? t("friends.status.free")
                        : status === "stale"
                        ? t("friends.status.stale")
                        : t("friends.status.unknown")}
                      {updatedAt && (
                        <span className="friends-item__updated">{formatRelativeTime(updatedAt, t)}</span>
                      )}
                    </p>
                  </div>
                  <div className="friends-item__actions">
                    <button
                      className={`toggle ${friend.autoSync ? "on" : "off"}`}
                      onClick={() => {
                        setRequestActionError(null);
                        void toggleAutoSync(friend.friendUid, !friend.autoSync).catch((err) => {
                          setRequestActionError(err instanceof Error ? err.message : t("friends.search.error"));
                        });
                      }}
                    >
                      <span className="toggle-thumb" />
                      <span>{t("friends.list.autoSync")}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}
