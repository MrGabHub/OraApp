import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Connections from "./components/Connections";
import Home from "./components/Home";
import Assistant from "./components/Assistant";
import BottomNav, { type TabKey } from "./components/BottomNav";
import AuthGate from "./components/auth/AuthGate";
import AuthRequiredScreen from "./components/auth/AuthRequiredScreen";
import LanguageSwitcher from "./components/LanguageSwitcher";
import ORATutorialExperience from "./components/tutorial/ORATutorialExperience";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./hooks/useAuth";
import { ensureUserDocumentListener } from "./lib/auth/onLogin";

function AppShell() {
  const [tab, setTab] = useState<TabKey>("home");
  const { loading, user } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    const cleanup = ensureUserDocumentListener();
    return cleanup;
  }, []);

  if (!user) {
    return <AuthRequiredScreen loading={loading} />;
  }

  const avatarMode: "normal" | "error" | "success" =
    tab === "home" ? "normal" : tab === "assistant" ? "error" : "success";

  return (
    <div className="app-container">
      <header
        className="app-header"
        style={{
          width: "100%",
          maxWidth: 960,
          padding: "16px",
          boxSizing: "border-box",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div className="app-brand">
          <span style={{ fontWeight: 700, fontSize: "1.25rem" }}>{t("app.title")}</span>
          <span style={{ display: "block", fontSize: "0.85rem", color: "rgba(240,240,245,0.65)" }}>
            {t("app.subtitle")}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <LanguageSwitcher />
          <AuthGate />
        </div>
      </header>

      <main
        style={{
          width: "100%",
          maxWidth: 960,
          padding: "16px",
          boxSizing: "border-box",
          display: "grid",
          gap: 16,
          margin: "0 auto",
        }}
      >
        {tab === "home" && <Home />}
        {tab === "assistant" && <Assistant />}
        {tab === "connections" && <Connections />}
      </main>

      <BottomNav active={tab} onChange={setTab} />

      {tab === "home" && (
        <ORATutorialExperience avatarMode={avatarMode} onComplete={() => setTab("home")} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

