import { useEffect, useRef, useState } from "react";
import Connections from "./components/Connections";
import Home from "./components/Home";
import Assistant from "./components/Assistant";
import Progress from "./components/Progress";
import BottomNav, { type TabKey } from "./components/BottomNav";
import AuthRequiredScreen from "./components/auth/AuthRequiredScreen";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./hooks/useAuth";
import { ensureUserDocumentListener } from "./lib/auth/onLogin";

const TAB_ORDER: TabKey[] = ["home", "progress", "assistant", "connections"];

function AppShell() {
  const [tab, setTab] = useState<TabKey>("home");
  const mainRef = useRef<HTMLDivElement | null>(null);
  const tabRef = useRef<TabKey>(tab);
  const { loading, user } = useAuth();
  useEffect(() => {
    const cleanup = ensureUserDocumentListener();
    return cleanup;
  }, []);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

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
      <main className="app-main" ref={mainRef}>
        {tab === "home" && <Home />}
        {tab === "progress" && <Progress />}
        {tab === "assistant" && <Assistant />}
        {tab === "connections" && <Connections />}
      </main>

      <BottomNav active={tab} onChange={setTab} />
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
