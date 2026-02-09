import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Connections from "./components/Connections";
import Home from "./components/Home";
import Assistant from "./components/Assistant";
import Calendar from "./components/Calendar";
import Friends from "./components/Friends";
import BottomNav, { type TabKey } from "./components/BottomNav";
import AuthRequiredScreen from "./components/auth/AuthRequiredScreen";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./hooks/useAuth";
import { ensureUserDocumentListener } from "./lib/auth/onLogin";

const TAB_ORDER: TabKey[] = ["home", "progress", "assistant", "friends", "connections"];
const SWIPE_START_THRESHOLD = 6;
const SWIPE_AXIS_BIAS = 3;
const SWIPE_DISTANCE_RATIO = 0.14;
const SWIPE_MAX_DISTANCE = 120;
const SWIPE_MIN_VELOCITY = 0.45;
const EDGE_RESISTANCE = 0.35;
const SWIPE_BLOCK_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "summary",
  "[role='button']",
  "[role='link']",
  "[contenteditable='true']",
  "[draggable='true']",
  "[data-no-swipe]",
].join(",");

type GestureAxis = "x" | "y" | null;

type GestureState = {
  pointerId: number | null;
  blocked: boolean;
  axis: GestureAxis;
  dragging: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
};

function isSwipeBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(SWIPE_BLOCK_SELECTOR));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function AppShell() {
  const CLICK_TRANSITION_MS = 620;
  const SWIPE_TRANSITION_MS = 380;
  const [tab, setTab] = useState<TabKey>("home");
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const tabRef = useRef<TabKey>(tab);
  const dragOffsetRef = useRef(0);
  const gestureRef = useRef<GestureState>({
    pointerId: null,
    blocked: false,
    axis: null,
    dragging: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastTime: 0,
  });
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [visitedTabs, setVisitedTabs] = useState<TabKey[]>(["home"]);
  const [transitionMs, setTransitionMs] = useState<number>(SWIPE_TRANSITION_MS);
  const { loading, user } = useAuth();

  const activeIndex = TAB_ORDER.indexOf(tab);
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex < TAB_ORDER.length - 1;

  const setDragValue = (value: number) => {
    dragOffsetRef.current = value;
    setDragOffset(value);
  };

  const resetDragState = () => {
    if (gestureRef.current.dragging) {
      setIsDragging(false);
    }
    gestureRef.current.pointerId = null;
    gestureRef.current.blocked = false;
    gestureRef.current.axis = null;
    gestureRef.current.dragging = false;
    gestureRef.current.startX = 0;
    gestureRef.current.startY = 0;
    gestureRef.current.lastX = 0;
    gestureRef.current.lastTime = 0;
    if (dragOffsetRef.current !== 0) {
      setDragValue(0);
    }
  };

  useEffect(() => {
    const cleanup = ensureUserDocumentListener();
    return cleanup;
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    setVisitedTabs((current) => (current.includes(tab) ? current : [...current, tab]));
  }, [tab]);

  const mountedTabs = useMemo(() => {
    const mounted = new Set<TabKey>(visitedTabs);
    mounted.add(tab);
    if (hasPrevious) {
      mounted.add(TAB_ORDER[activeIndex - 1]);
    }
    if (hasNext) {
      mounted.add(TAB_ORDER[activeIndex + 1]);
    }
    return mounted;
  }, [activeIndex, hasNext, hasPrevious, tab, visitedTabs]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const blocked = isSwipeBlocked(event.target);
    const now = performance.now();
    gestureRef.current.pointerId = event.pointerId;
    gestureRef.current.blocked = blocked;
    gestureRef.current.axis = null;
    gestureRef.current.dragging = false;
    gestureRef.current.startX = event.clientX;
    gestureRef.current.startY = event.clientY;
    gestureRef.current.lastX = event.clientX;
    gestureRef.current.lastTime = now;

    if (!blocked) {
      // Prevent browser text selection while starting a horizontal drag gesture.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture.pointerId !== event.pointerId || gesture.blocked) return;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (gesture.axis === null) {
      if (absDx < SWIPE_START_THRESHOLD && absDy < SWIPE_START_THRESHOLD) return;
      if (absDx > absDy + SWIPE_AXIS_BIAS) {
        gesture.axis = "x";
      } else if (absDy > absDx + SWIPE_AXIS_BIAS) {
        gesture.axis = "y";
      } else {
        return;
      }
    }

    if (gesture.axis !== "x") return;

    event.preventDefault();
    if (!gesture.dragging) {
      gesture.dragging = true;
      setIsDragging(true);
    }

    const currentIndex = TAB_ORDER.indexOf(tabRef.current);
    const atLeftEdge = currentIndex === 0 && dx > 0;
    const atRightEdge = currentIndex === TAB_ORDER.length - 1 && dx < 0;
    const resistance = atLeftEdge || atRightEdge ? EDGE_RESISTANCE : 1;
    setDragValue(dx * resistance);

    gesture.lastX = event.clientX;
    gesture.lastTime = performance.now();
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture.pointerId !== event.pointerId) return;

    if (!gesture.blocked && gesture.axis === "x") {
      const dx = event.clientX - gesture.startX;
      const width = carouselRef.current?.clientWidth ?? window.innerWidth ?? 1;
      const distanceThreshold = Math.min(SWIPE_MAX_DISTANCE, width * SWIPE_DISTANCE_RATIO);
      const elapsed = Math.max(1, performance.now() - gesture.lastTime);
      const velocity = (event.clientX - gesture.lastX) / elapsed;
      const shouldMove = Math.abs(dx) > distanceThreshold || Math.abs(velocity) > SWIPE_MIN_VELOCITY;

      const currentIndex = TAB_ORDER.indexOf(tabRef.current);
      const direction = dx < 0 ? 1 : -1;
      const nextIndex = shouldMove ? clamp(currentIndex + direction, 0, TAB_ORDER.length - 1) : currentIndex;

      if (gesture.dragging) {
        setIsDragging(false);
      }
      setDragValue(0);

      if (nextIndex !== currentIndex) {
        setTransitionMs(SWIPE_TRANSITION_MS);
        setTab(TAB_ORDER[nextIndex]);
      }
    }

    if (!gesture.blocked && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetDragState();
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture.pointerId !== event.pointerId) return;
    if (!gesture.blocked && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetDragState();
  };

  const trackStyle: CSSProperties = {
    transform: `translate3d(calc(${-activeIndex * 100}% + ${dragOffset}px), 0, 0)`,
    transition: isDragging ? "none" : `transform ${transitionMs}ms var(--ease-ora)`,
  };

  const carouselWidth = Math.max(1, carouselRef.current?.clientWidth ?? window.innerWidth ?? 1);
  const virtualIndex = activeIndex - dragOffset / carouselWidth;

  const getSlideStyle = (index: number): CSSProperties => {
    const distance = clamp(index - virtualIndex, -1.25, 1.25);
    const absDistance = Math.abs(distance);
    const rotateY = -distance * 20;
    const scale = 1 - Math.min(0.14, absDistance * 0.12);
    const translateZ = -absDistance * 90;
    const opacity = 1 - Math.min(0.32, absDistance * 0.24);

    return {
      transform: `translate3d(0, 0, ${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
      opacity,
      transition: isDragging
        ? "none"
        : `transform ${transitionMs}ms var(--ease-ora), opacity ${Math.max(280, transitionMs - 120)}ms var(--ease-ora)`,
    };
  };

  const handleTabChange = (nextTab: TabKey) => {
    if (nextTab === tabRef.current) return;
    setTransitionMs(CLICK_TRANSITION_MS);
    setTab(nextTab);
  };

  const renderTab = (key: TabKey) => {
    if (!mountedTabs.has(key)) return null;
    if (key === "home") return <Home />;
    if (key === "progress") return <Calendar />;
    if (key === "assistant") return <Assistant />;
    if (key === "friends") return <Friends />;
    return <Connections />;
  };

  if (!user) {
    return <AuthRequiredScreen loading={loading} />;
  }

  return (
    <div className={`app-container tab-${tab}`}>
      {!isOnline && (
        <div className="offline-banner" role="status" aria-live="polite">
          Vous êtes hors ligne. Certaines données peuvent ne pas se charger.
        </div>
      )}
      <main className="app-main">
        <div
          ref={carouselRef}
          className={`app-carousel${isDragging ? " is-dragging" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerCancel}
        >
          <div className="app-carousel__track" style={trackStyle}>
            {TAB_ORDER.map((key, index) => {
              const isActive = tab === key;
              return (
                <section
                  key={key}
                  className="app-carousel__slide"
                  aria-hidden={!isActive}
                  style={getSlideStyle(index)}
                >
                  <div className="app-page-tile">
                    <div className="app-page-tile__inner">{renderTab(key)}</div>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </main>

      <BottomNav active={tab} onChange={handleTabChange} />
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
