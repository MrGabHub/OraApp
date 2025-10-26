import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Connections from "./components/Connections";
import Home from "./components/Home";
import Assistant from "./components/Assistant";
import Progress from "./components/Progress";
import OrbitalMenu, { type TabKey } from "./components/OrbitalMenu";
import AuthGate from "./components/auth/AuthGate";
import AuthRequiredScreen from "./components/auth/AuthRequiredScreen";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./hooks/useAuth";
import { ensureUserDocumentListener } from "./lib/auth/onLogin";
import type { Mode as AvatarMode } from "./components/avatar";

const TAB_ORDER: TabKey[] = ["home", "progress", "assistant", "connections"];

function AppShell() {
  const [tab, setTab] = useState<TabKey>("home");
  const mainRef = useRef<HTMLDivElement | null>(null);
  const tabRef = useRef<TabKey>(tab);
  const burstTimerRef = useRef<number | null>(null);
  const [burstMode, setBurstMode] = useState<AvatarMode | null>(null);
  const { loading, user } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    const cleanup = ensureUserDocumentListener();
    return cleanup;
  }, []);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  const avatarModeMap: Record<TabKey, AvatarMode> = {
    home: "normal",
    progress: "success",
    assistant: "happy",
    connections: "skeptic",
  };
  const avatarMode = avatarModeMap[tab];
  const displayMode: AvatarMode = burstMode ?? avatarMode;

  const orbitalAnchor: "top" | "bottom" = tab === "home" || tab === "assistant" ? "bottom" : "top";

  const triggerAvatarMode = useCallback((mode: AvatarMode, duration = 1000) => {
    if (burstTimerRef.current !== null) {
      window.clearTimeout(burstTimerRef.current);
    }
    setBurstMode(mode);
    burstTimerRef.current = window.setTimeout(() => {
      setBurstMode(null);
      burstTimerRef.current = null;
    }, duration);
  }, []);

  useEffect(
    () => () => {
      if (burstTimerRef.current !== null) {
        window.clearTimeout(burstTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const node = mainRef.current;
    if (!node) return undefined;

    let startX = 0;
    let startY = 0;
    let pointerId: number | null = null;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (pointerId === null || event.pointerId !== pointerId || event.pointerType !== "touch") return;
      const dx = event.clientX - startX;
      const dy = Math.abs(event.clientY - startY);
      pointerId = null;
      if (Math.abs(dx) < 60 || dy > 80) return;
      const currentIndex = TAB_ORDER.indexOf(tabRef.current);
      const nextIndex = currentIndex + (dx < 0 ? 1 : -1);
      if (nextIndex < 0 || nextIndex >= TAB_ORDER.length) return;
      setTab(TAB_ORDER[nextIndex]);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (pointerId !== null && event.pointerId === pointerId) {
        pointerId = null;
      }
    };

    node.addEventListener("pointerdown", handlePointerDown, { passive: true });
    node.addEventListener("pointerup", handlePointerUp);
    node.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      node.removeEventListener("pointerdown", handlePointerDown);
      node.removeEventListener("pointerup", handlePointerUp);
      node.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, []);

  if (!user) {
    return <AuthRequiredScreen loading={loading} />;
  }

  return (
    <div className={`app-container tab-${tab}`}>
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-title">{t("app.title")}</span>
          <span className="app-brand-subtitle">{t("app.subtitle")}</span>
        </div>
        <div className="app-header__actions">
          <LanguageSwitcher onLanguageChange={() => triggerAvatarMode("skeptic", 1000)} />
          <AuthGate />
        </div>
      </header>

      <main className="app-main" ref={mainRef}>
        {tab === "home" && <Home />}
        {tab === "progress" && <Progress />}
        {tab === "assistant" && <Assistant />}
        {tab === "connections" && <Connections onCelebrate={(mode) => triggerAvatarMode(mode, 1000)} />}
      </main>

      <OrbitalMenu active={tab} anchor={orbitalAnchor} avatarMode={displayMode} onChange={setTab} />
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
