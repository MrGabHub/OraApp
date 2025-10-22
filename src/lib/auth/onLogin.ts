import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

let listenerRegistered = false;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function buildDefaultUserPayload(email: string | null | undefined) {
  return {
    email: email ?? null,
    role: "user",
    oraTutorialSeen: false,
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
        const payload = buildDefaultUserPayload(user.email);
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

