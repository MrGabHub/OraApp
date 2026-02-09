import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Search, UserPlus, Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useFriends, type PublicUser } from "../hooks/useFriends";
import { useGoogleCalendar, type GoogleCalendarEvent } from "../hooks/useGoogleCalendar";
import { requestCalendarConsentWithPopup } from "../lib/calendarConsent";
import { formatRelativeTime } from "../utils/time";
import "./friends.css";

type FriendPresence = {
  state: "free" | "busy" | "unknown";
  updatedAt: number | null;
};

function toEpoch(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function resolveBusyNow(events: GoogleCalendarEvent[], nowMs: number): "free" | "busy" {
  for (const event of events) {
    const startMs = toEpoch(event.start);
    const endMs = toEpoch(event.end ?? event.start);
    if (startMs === null || endMs === null) continue;
    if (nowMs >= startMs && nowMs < endMs && event.transparency !== "transparent") {
      return "busy";
    }
  }
  return "free";
}

export default function Friends() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const {
    incomingRequests,
    outgoingRequests,
    friends,
    users,
    searchUsers,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    removeFriend,
    checkOwnCalendarShareWithFriend,
  } = useFriends();

  const { status: googleStatus, connect: connectGoogle, fetchEventsInRange } = useGoogleCalendar();

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResult, setSearchResult] = useState<PublicUser | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [requestActionError, setRequestActionError] = useState<string | null>(null);
  const [friendPresence, setFriendPresence] = useState<Record<string, FriendPresence>>({});

  const isConnected = googleStatus === "connected";

  const isAlreadyFriend = searchResult ? friends.some((friend) => friend.friendUid === searchResult.uid) : false;
  const hasOutgoing = searchResult ? outgoingRequests.some((req) => req.toUid === searchResult.uid) : false;
  const hasIncoming = searchResult ? incomingRequests.some((req) => req.fromUid === searchResult.uid) : false;

  const refreshFriendPresence = useCallback(async () => {
    if (!user || !isConnected) {
      setFriendPresence({});
      return;
    }

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);
    const nowMs = now.getTime();

    const results = await Promise.all(
      friends.map(async (friend) => {
        if (!friend.calendarSharedByFriend) {
          return [friend.friendUid, { state: "unknown", updatedAt: null } as FriendPresence] as const;
        }

        const friendUser = users[friend.friendUid];
        const calendarId = friendUser?.email?.trim().toLowerCase();
        if (!calendarId) {
          return [friend.friendUid, { state: "unknown", updatedAt: null } as FriendPresence] as const;
        }

        try {
          const events = await fetchEventsInRange(
            {
              timeMin: dayStart.toISOString(),
              timeMax: dayEnd.toISOString(),
            },
            { calendarId },
          );
          return [
            friend.friendUid,
            {
              state: resolveBusyNow(events, nowMs),
              updatedAt: Date.now(),
            } as FriendPresence,
          ] as const;
        } catch (error) {
          const isNotFound =
            typeof error === "object" &&
            error !== null &&
            "status" in error &&
            (error as { status?: number }).status === 404;
          if (!isNotFound) {
            console.warn("Failed to read friend calendar", friend.friendUid, error);
          }
          return [friend.friendUid, { state: "unknown", updatedAt: null } as FriendPresence] as const;
        }
      }),
    );

    const next: Record<string, FriendPresence> = {};
    for (const [uid, presence] of results) {
      next[uid] = presence;
    }
    setFriendPresence(next);
  }, [fetchEventsInRange, friends, isConnected, user, users]);

  useEffect(() => {
    void refreshFriendPresence();
  }, [refreshFriendPresence]);

  useEffect(() => {
    if (!isConnected || friends.length === 0) return;
    const timer = window.setInterval(() => {
      void refreshFriendPresence();
    }, 2 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [friends.length, isConnected, refreshFriendPresence]);

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

  const handleAccept = useCallback(
    async (uid: string) => {
      setRequestActionError(null);
      try {
        await acceptFriendRequest(uid);
        const popupGranted = await requestCalendarConsentWithPopup({ friendUid: uid });
        if (popupGranted) {
          return;
        }
        // Fallback: some browsers block postMessage/close signals although consent succeeded.
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        const storedShare = await checkOwnCalendarShareWithFriend(uid);
        if (!storedShare) {
          setRequestActionError(
            "Ami accepte, mais consentement Google non finalise. Relance l'acceptation pour activer le partage calendrier.",
          );
        }
      } catch (err) {
        setRequestActionError(err instanceof Error ? err.message : t("friends.search.error"));
      }
    },
    [acceptFriendRequest, checkOwnCalendarShareWithFriend, t],
  );

  const handleDecline = useCallback(
    async (uid: string) => {
      setRequestActionError(null);
      try {
        await declineFriendRequest(uid);
      } catch (err) {
        setRequestActionError(err instanceof Error ? err.message : t("friends.search.error"));
      }
    },
    [declineFriendRequest, t],
  );

  const handleCancel = useCallback(
    async (uid: string) => {
      setRequestActionError(null);
      try {
        await cancelFriendRequest(uid);
      } catch (err) {
        setRequestActionError(err instanceof Error ? err.message : t("friends.search.error"));
      }
    },
    [cancelFriendRequest, t],
  );

  const handleRemoveFriend = useCallback(
    async (uid: string) => {
      setRequestActionError(null);
      try {
        await removeFriend(uid);
      } catch (err) {
        setRequestActionError(err instanceof Error ? err.message : t("friends.search.error"));
      }
    },
    [removeFriend, t],
  );

  const handleEnableOwnShare = useCallback(
    async (uid: string) => {
      setRequestActionError(null);
      try {
        const popupGranted = await requestCalendarConsentWithPopup({ friendUid: uid });
        if (popupGranted) {
          return;
        }
        // Some browsers block popup close/postMessage; verify from Firestore after a short delay.
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        const storedShare = await checkOwnCalendarShareWithFriend(uid);
        if (!storedShare) {
          setRequestActionError(t("friends.status.shareNotCompleted"));
        }
      } catch (err) {
        setRequestActionError(err instanceof Error ? err.message : t("friends.search.error"));
      }
    },
    [checkOwnCalendarShareWithFriend, t],
  );

  const renderUserLabel = useCallback(
    (uid: string) => {
      const info = users[uid];
      if (!info) return uid.slice(0, 6);
      return info.displayName || info.handle || info.email || uid.slice(0, 6);
    },
    [users],
  );

  const availabilitySummary = useMemo(() => {
    if (!isConnected) return t("friends.availability.connectPrompt");
    if (friends.length === 0) return t("friends.requests.none");
    return t("friends.availability.connected");
  }, [friends.length, isConnected, t]);

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
            <span>{availabilitySummary}</span>
          </div>
          <div className="friends-card__actions">
            {isConnected ? (
              <p className="friends-card__desc">{t("friends.availability.connected")}</p>
            ) : (
              <button className="btn btn-primary" onClick={connectGoogle}>
                {t("friends.availability.connectAction")}
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
                    <button className="btn btn-primary" onClick={() => void handleAccept(req.fromUid)}>
                      {t("friends.requests.accept")}
                    </button>
                    <button className="btn btn-ghost" onClick={() => void handleDecline(req.fromUid)}>
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
                    <button className="btn btn-ghost" onClick={() => void handleCancel(req.toUid)}>
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
              const presence = friendPresence[friend.friendUid] ?? { state: "unknown", updatedAt: null };
              return (
                <div key={friend.friendUid} className="friends-item">
                  <div>
                    <p className="friends-item__name">{renderUserLabel(friend.friendUid)}</p>
                    <p className={`friends-item__meta status-${presence.state}`}>
                      {presence.state === "busy"
                        ? t("friends.status.busy")
                        : presence.state === "free"
                        ? t("friends.status.free")
                        : t("friends.status.unknown")}
                      {presence.updatedAt && (
                        <span className="friends-item__updated">{formatRelativeTime(presence.updatedAt, t)}</span>
                      )}
                    </p>
                    <div className="friends-item__share-badges">
                      <span className={`share-badge ${friend.calendarSharedByFriend ? "on" : "off"}`}>
                        <span className="share-badge__label">
                          {t("friends.status.friendSharesExplicit", {
                            value: friend.calendarSharedByFriend
                              ? t("friends.status.shortYes")
                              : t("friends.status.shortNo"),
                          })}
                        </span>
                      </span>
                      <span className={`share-badge ${friend.calendarSharedByYou ? "on" : "off"}`}>
                        <span className="share-badge__label">
                          {t("friends.status.youShareExplicit", {
                            value: friend.calendarSharedByYou
                              ? t("friends.status.shortYes")
                              : t("friends.status.shortNo"),
                          })}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="friends-item__actions">
                    {!friend.calendarSharedByYou && (
                      <button className="btn btn-primary" onClick={() => void handleEnableOwnShare(friend.friendUid)}>
                        {t("friends.list.enableShare")}
                      </button>
                    )}
                    <button className="btn btn-ghost" onClick={() => void handleRemoveFriend(friend.friendUid)}>
                      {t("friends.list.remove")}
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

