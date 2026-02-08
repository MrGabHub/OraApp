import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { buildDefaultHandle, normalizeEmail } from "../../utils/identity";

let listenerRegistered = false;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function buildDefaultUserPayload(input: { uid: string; email: string | null | undefined; displayName?: string | null; photoURL?: string | null }) {
  const handle = buildDefaultHandle({
    uid: input.uid,
    displayName: input.displayName,
    email: input.email,
  });
  const emailLower = normalizeEmail(input.email ?? undefined);
  return {
    email: input.email ?? null,
    emailLower,
    displayName: input.displayName ?? null,
    photoURL: input.photoURL ?? null,
    handle,
    handleLower: handle.toLowerCase(),
    role: "user",
    createdAt: new Date(),
  };
}

/**
 * Attaches a listener that ensures a Firestore `/users/{uid}` document exists
 * each time an authentication change is detected. The listener is registered
 * at most once per browsing session.
 */
export function ensureUserDocumentListener(): () => void {
  if (!isBrowser() || listenerRegistered) {
    return () => {};
  }

  listenerRegistered = true;

  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      return;
    }

    const userRef = doc(db, "users", user.uid);

    try {
      const snapshot = await getDoc(userRef);
      if (!snapshot.exists()) {
        const payload = buildDefaultUserPayload({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        });
        await setDoc(userRef, payload);
      }
    } catch (error) {
      console.error("Failed to ensure user document", error);
    }
  });

  return () => {
    unsubscribe();
    listenerRegistered = false;
  };
}

