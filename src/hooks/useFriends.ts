import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import { db } from "../lib/firebase";

export type FriendVisibility = {
  showAvailability: boolean;
  showEventTitle: boolean;
  showEventType: boolean;
};

export type FriendEntry = {
  requestId: string;
  friendUid: string;
  status: "accepted";
  createdAt: number | null;
  acceptedAt: number | null;
  calendarSharedByFriend: boolean;
  calendarSharedByYou: boolean;
  visibility: FriendVisibility;
};

export type FriendRequest = {
  id: string;
  fromUid: string;
  toUid: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "canceled";
  createdAt: number | null;
  respondedAt: number | null;
  fromCalendarShared?: boolean;
  toCalendarShared?: boolean;
};

export type PublicUser = {
  uid: string;
  displayName?: string | null;
  handle?: string | null;
  photoURL?: string | null;
  email?: string | null;
};

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return null;
}

function mapPublicUser(uid: string, data: any): PublicUser {
  return {
    uid,
    displayName: data?.displayName ?? null,
    handle: data?.handle ?? null,
    photoURL: data?.photoURL ?? null,
    email: data?.email ?? null,
  };
}

function mapFriendRequest(id: string, data: any): FriendRequest {
  return {
    id,
    fromUid: data?.fromUid,
    toUid: data?.toUid,
    status: data?.status ?? "pending",
    createdAt: toMillis(data?.createdAt),
    respondedAt: toMillis(data?.respondedAt),
    fromCalendarShared: Boolean(data?.fromCalendarShared),
    toCalendarShared: Boolean(data?.toCalendarShared),
  } as FriendRequest;
}

async function safeGetDoc(ref: ReturnType<typeof doc>) {
  try {
    return await getDoc(ref);
  } catch (error) {
    console.warn("Firestore read skipped due to permissions", error);
    return null;
  }
}

export function useFriends() {
  const { user } = useAuth();
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [users, setUsers] = useState<Record<string, PublicUser>>({});
  const inflightUsers = useRef<Set<string>>(new Set());

  const hydrateUsers = useCallback(async (uids: string[]) => {
    const missing = uids.filter((uid) => uid && !users[uid] && !inflightUsers.current.has(uid));
    if (missing.length === 0) return;
    missing.forEach((uid) => inflightUsers.current.add(uid));
    try {
      const fetched: Record<string, PublicUser> = {};
      await Promise.all(
        missing.map(async (uid) => {
          const snap = await getDoc(doc(db, "users", uid));
          if (snap.exists()) {
            fetched[uid] = mapPublicUser(uid, snap.data());
          }
        }),
      );
      if (Object.keys(fetched).length > 0) {
        setUsers((prev) => ({ ...prev, ...fetched }));
      }
    } finally {
      missing.forEach((uid) => inflightUsers.current.delete(uid));
    }
  }, [users]);

  useEffect(() => {
    if (!user) return;
    const incomingQuery = query(
      collection(db, "friendRequests"),
      where("toUid", "==", user.uid),
    );
    const outgoingQuery = query(
      collection(db, "friendRequests"),
      where("fromUid", "==", user.uid),
    );

    const unsubIncoming = onSnapshot(
      incomingQuery,
      (snapshot) => {
        const items = snapshot.docs
          .map((docSnap) => mapFriendRequest(docSnap.id, docSnap.data()))
          .filter((req) => req.status === "pending");
        setIncomingRequests(items);
        void hydrateUsers(items.map((item) => item.fromUid));
      },
      (error) => {
        console.error("Failed to load incoming requests", error);
      },
    );
    const unsubOutgoing = onSnapshot(
      outgoingQuery,
      (snapshot) => {
        const items = snapshot.docs
          .map((docSnap) => mapFriendRequest(docSnap.id, docSnap.data()))
          .filter((req) => req.status === "pending");
        setOutgoingRequests(items);
        void hydrateUsers(items.map((item) => item.toUid));
      },
      (error) => {
        console.error("Failed to load outgoing requests", error);
      },
    );

    return () => {
      unsubIncoming();
      unsubOutgoing();
    };
  }, [hydrateUsers, user]);

  useEffect(() => {
    if (!user) return;

    const fromAcceptedQuery = query(
      collection(db, "friendRequests"),
      where("fromUid", "==", user.uid),
      where("status", "==", "accepted"),
    );
    const toAcceptedQuery = query(
      collection(db, "friendRequests"),
      where("toUid", "==", user.uid),
      where("status", "==", "accepted"),
    );

    let fromAccepted: FriendEntry[] = [];
    let toAccepted: FriendEntry[] = [];

    const toEntry = (request: FriendRequest): FriendEntry | null => {
      const friendUid = request.fromUid === user.uid ? request.toUid : request.fromUid;
      if (!friendUid) return null;
      return {
        requestId: request.id,
        friendUid,
        status: "accepted",
        createdAt: request.createdAt,
        acceptedAt: request.respondedAt,
        calendarSharedByFriend:
          request.fromUid === user.uid ? Boolean(request.toCalendarShared) : Boolean(request.fromCalendarShared),
        calendarSharedByYou:
          request.fromUid === user.uid ? Boolean(request.fromCalendarShared) : Boolean(request.toCalendarShared),
        visibility: {
          showAvailability: true,
          showEventTitle: false,
          showEventType: false,
        },
      };
    };

    const recompute = () => {
      const merged = [...fromAccepted, ...toAccepted];
      setFriends(merged);
      void hydrateUsers(merged.map((item) => item.friendUid));
    };

    const unsubFrom = onSnapshot(
      fromAcceptedQuery,
      (snapshot) => {
        fromAccepted = snapshot.docs
          .map((docSnap) => mapFriendRequest(docSnap.id, docSnap.data()))
          .map(toEntry)
          .filter((item): item is FriendEntry => Boolean(item));
        recompute();
      },
      (error) => {
        console.error("Failed to load friends (requester side)", error);
      },
    );

    const unsubTo = onSnapshot(
      toAcceptedQuery,
      (snapshot) => {
        toAccepted = snapshot.docs
          .map((docSnap) => mapFriendRequest(docSnap.id, docSnap.data()))
          .map(toEntry)
          .filter((item): item is FriendEntry => Boolean(item));
        recompute();
      },
      (error) => {
        console.error("Failed to load friends (recipient side)", error);
      },
    );

    return () => {
      unsubFrom();
      unsubTo();
    };
  }, [hydrateUsers, user]);

  const searchUsers = useCallback(async (term: string) => {
    const cleaned = term.trim().toLowerCase();
    if (!cleaned || !cleaned.includes("@")) return [] as PublicUser[];
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("emailLower", "==", cleaned), limit(3));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => mapPublicUser(docSnap.id, docSnap.data()));
  }, []);

  const sendFriendRequest = useCallback(async (toUid: string) => {
    if (!user) throw new Error("Not signed in.");
    if (toUid === user.uid) throw new Error("Cannot add yourself.");
    const requestId = `${user.uid}_${toUid}`;
    const requestRef = doc(db, "friendRequests", requestId);
    const existing = await safeGetDoc(requestRef);
    if (existing?.exists()) {
      const data = existing.data();
      if (data?.status === "pending") return "pending" as const;
      if (data?.status === "accepted") return "accepted" as const;
    }
    const reverseId = `${toUid}_${user.uid}`;
    const reverseRef = doc(db, "friendRequests", reverseId);
    const reverseSnap = await safeGetDoc(reverseRef);
    if (reverseSnap?.exists() && reverseSnap.data()?.status === "pending") {
      return "incoming" as const;
    }
    await setDoc(requestRef, {
      fromUid: user.uid,
      toUid,
      status: "pending",
      createdAt: serverTimestamp(),
      respondedAt: null,
      fromCalendarShared: false,
      toCalendarShared: false,
    });
    return "sent" as const;
  }, [user]);

  const acceptFriendRequest = useCallback(async (fromUid: string) => {
    if (!user) throw new Error("Not signed in.");
    const requestId = `${fromUid}_${user.uid}`;
    const requestRef = doc(db, "friendRequests", requestId);
    await updateDoc(requestRef, {
      status: "accepted",
      respondedAt: serverTimestamp(),
      toCalendarShared: false,
    });
  }, [user]);

  const declineFriendRequest = useCallback(async (fromUid: string) => {
    if (!user) throw new Error("Not signed in.");
    const requestId = `${fromUid}_${user.uid}`;
    await updateDoc(doc(db, "friendRequests", requestId), {
      status: "declined",
      respondedAt: serverTimestamp(),
      toCalendarShared: false,
    });
  }, [user]);

  const cancelFriendRequest = useCallback(async (toUid: string) => {
    if (!user) throw new Error("Not signed in.");
    const requestId = `${user.uid}_${toUid}`;
    await updateDoc(doc(db, "friendRequests", requestId), {
      status: "cancelled",
      respondedAt: serverTimestamp(),
      fromCalendarShared: false,
    });
  }, [user]);

  const removeFriend = useCallback(async (friendUid: string) => {
    if (!user) throw new Error("Not signed in.");
    const fromRequestId = `${user.uid}_${friendUid}`;
    const toRequestId = `${friendUid}_${user.uid}`;
    const fromRef = doc(db, "friendRequests", fromRequestId);
    const toRef = doc(db, "friendRequests", toRequestId);

    const fromSnap = await safeGetDoc(fromRef);
    if (fromSnap?.exists() && fromSnap.data()?.status === "accepted") {
      await updateDoc(fromRef, {
        status: "removed",
        respondedAt: serverTimestamp(),
        fromCalendarShared: false,
        toCalendarShared: false,
      });
      return;
    }

    const toSnap = await safeGetDoc(toRef);
    if (toSnap?.exists() && toSnap.data()?.status === "accepted") {
      await updateDoc(toRef, {
        status: "removed",
        respondedAt: serverTimestamp(),
        fromCalendarShared: false,
        toCalendarShared: false,
      });
      return;
    }

    throw new Error("Friendship not found.");
  }, [user]);

  const checkOwnCalendarShareWithFriend = useCallback(async (friendUid: string) => {
    if (!user) throw new Error("Not signed in.");

    const requestA = await safeGetDoc(doc(db, "friendRequests", `${user.uid}_${friendUid}`));
    if (requestA?.exists() && requestA.data()?.status === "accepted" && Boolean(requestA.data()?.fromCalendarShared)) {
      return true;
    }

    const requestB = await safeGetDoc(doc(db, "friendRequests", `${friendUid}_${user.uid}`));
    if (requestB?.exists() && requestB.data()?.status === "accepted" && Boolean(requestB.data()?.toCalendarShared)) {
      return true;
    }

    return false;
  }, [user]);

  return {
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
  };
}
