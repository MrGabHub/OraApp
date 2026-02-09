import { auth } from "./firebase";

export async function startBackgroundCalendarConsent(): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("User is not authenticated.");
  }
  const idToken = await currentUser.getIdToken();
  const resp = await fetch("/api/calendar-consent-start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({}),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || typeof data?.url !== "string") {
    throw new Error(data?.error || "Unable to start calendar consent.");
  }

  if (typeof window === "undefined") return;
  window.location.assign(data.url);
}

export async function requestCalendarConsentWithPopup(): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("User is not authenticated.");
  }

  const idToken = await currentUser.getIdToken();
  const resp = await fetch("/api/calendar-consent-start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({}),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || typeof data?.url !== "string") {
    throw new Error(data?.error || "Unable to start calendar consent.");
  }

  if (typeof window === "undefined") return false;

  const popup = window.open(data.url, "aura-calendar-consent", "width=520,height=740");
  if (!popup) {
    throw new Error("Popup bloque. Autorise les popups pour continuer.");
  }

  return await new Promise<boolean>((resolve) => {
    let done = false;

    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedCheck);
      window.clearTimeout(timeout);
      resolve(value);
    };

    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string; ok?: boolean } | null;
      if (!payload || payload.type !== "aura-calendar-consent") return;
      finish(Boolean(payload.ok));
    };

    const closedCheck = window.setInterval(() => {
      if (popup.closed) {
        finish(false);
      }
    }, 400);

    const timeout = window.setTimeout(() => {
      finish(false);
    }, 5 * 60 * 1000);

    window.addEventListener("message", onMessage);
  });
}
