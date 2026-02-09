import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import "./index.css";
import App from "./App.tsx";
import i18n from "./lib/i18n";

const CONSENT_CALLBACK_PATH = "/api/calendar-consent-callback";
const SW_RESET_FLAG = "aura-consent-sw-reset-once";

function recoverConsentCallbackFromStaleServiceWorker() {
  if (typeof window === "undefined") return;
  if (!window.location.pathname.startsWith(CONSENT_CALLBACK_PATH)) return;
  if (!("serviceWorker" in navigator)) return;

  const alreadyReset = window.sessionStorage.getItem(SW_RESET_FLAG) === "1";
  if (alreadyReset) {
    window.sessionStorage.removeItem(SW_RESET_FLAG);
    return;
  }

  window.sessionStorage.setItem(SW_RESET_FLAG, "1");
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
    .finally(() => {
      window.location.replace(window.location.href);
    });
}

recoverConsentCallbackFromStaleServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <Suspense fallback={<div className="app-loading">Loading...</div>}>
        <App />
      </Suspense>
    </I18nextProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  if (typeof window !== "undefined" && window.location.pathname.startsWith(CONSENT_CALLBACK_PATH)) {
    // Avoid re-registering SW while handling OAuth callback.
    // The callback page must come from the serverless function directly.
    // Registration will happen on the next normal app navigation.
    // eslint-disable-next-line no-console
    console.log("Skipping SW registration on OAuth callback path");
  } else {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => console.log("Service Worker registered"))
      .catch((err) => console.error("Service Worker registration failed:", err));
  });
  }
}
