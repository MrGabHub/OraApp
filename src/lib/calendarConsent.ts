import { auth } from "./firebase";

type ConsentRequestOptions = {
  friendUid?: string;
  preopenedPopup?: Window | null;
};

export type ConsentResult = "granted" | "redirecting" | "cancelled";

function shouldUseRedirectConsentFlow(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const isIosDevice = /iPad|iPhone|iPod/.test(ua);
  const isMobileWebKit = /Mobile\/\w+/.test(ua) && /AppleWebKit/.test(ua);
  return isIosDevice || isMobileWebKit;
}

export async function startBackgroundCalendarConsent(options: ConsentRequestOptions = {}): Promise<void> {
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
    body: JSON.stringify({ friendUid: options.friendUid }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || typeof data?.url !== "string") {
    throw new Error(data?.error || "Unable to start calendar consent.");
  }

  if (typeof window === "undefined") return;
  window.location.assign(data.url);
}

export async function requestCalendarConsentWithPopup(
  options: ConsentRequestOptions = {},
): Promise<ConsentResult> {
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
    body: JSON.stringify({ friendUid: options.friendUid }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || typeof data?.url !== "string") {
    throw new Error(data?.error || "Unable to start calendar consent.");
  }

  if (typeof window === "undefined") return "cancelled";

  if (shouldUseRedirectConsentFlow()) {
    window.location.assign(data.url);
    return "redirecting";
  }

  const popup =
    options.preopenedPopup && !options.preopenedPopup.closed
      ? options.preopenedPopup
      : window.open("", "aura-calendar-consent", "width=520,height=740");
  if (!popup) {
    // iOS/Safari can block delayed popup opening after async work; fallback to same tab.
    window.location.assign(data.url);
    return "redirecting";
  }
  popup.location.href = data.url;

  return await new Promise<ConsentResult>((resolve) => {
    let done = false;

    const finish = (value: ConsentResult) => {
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
      finish(payload.ok ? "granted" : "cancelled");
    };

    const closedCheck = window.setInterval(() => {
      if (popup.closed) {
        finish("cancelled");
      }
    }, 400);

    const timeout = window.setTimeout(() => {
      finish("cancelled");
    }, 5 * 60 * 1000);

    window.addEventListener("message", onMessage);
  });
}
