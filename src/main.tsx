import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import "./index.css";
import App from "./App.tsx";
import i18n from "./lib/i18n";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <Suspense fallback={<div className="app-loading">Loading…</div>}>
        <App />
      </Suspense>
    </I18nextProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => console.log("�o. Service Worker registered"))
      .catch((err) => console.error("�?O SW registration failed:", err));
  });
}

