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
