import { useEffect, useState } from "react";
import "./avatar.css";

type Point = { x: number; y: number };
export type Mode = "normal" | "error" | "success";

export default function Avatar({ mode }: { mode: Mode }) {
  const [target, setTarget] = useState<Point | null>(null);
  const [idle, setIdle] = useState(true);
  const [idleTarget, setIdleTarget] = useState<Point | null>(null);

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout>;
    let idleMoveTimer: ReturnType<typeof setInterval>;

    const pickNewIdleTarget = () => {
      const wrap = document.querySelector(".avatar-wrapper") as HTMLElement | null;
      if (!wrap) return;

      // Nouvel objectif idle (aligné horizontalement, pas de louchage)
      setIdleTarget({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
      });
    };

    const startIdle = () => {
      setIdle(true);
      setTarget(null);
      pickNewIdleTarget();
      idleMoveTimer = setInterval(pickNewIdleTarget, 6000);
    };

    const stopIdle = () => {
      setIdle(false);
      clearInterval(idleMoveTimer);
    };

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      clearInterval(idleMoveTimer);
      stopIdle();
      idleTimer = setTimeout(startIdle, 1000); // 1s sans activité => idle
    };

    const handleMove = (e: MouseEvent) => {
      if (mode !== "normal") return;
      setTarget({ x: e.clientX, y: e.clientY });
      resetIdleTimer();
    };

    const handleTouch = (e: TouchEvent) => {
      if (mode !== "normal") return;
      const t = e.touches[0];
      if (!t) return;
      setTarget({ x: t.clientX, y: t.clientY });
      resetIdleTimer();
    };

    const handleLeave = () => {
      if (mode !== "normal") return;
      startIdle();
    };

    const handleVisibility = () => {
      if (document.hidden) {
        startIdle();
      } else {
        resetIdleTimer();
      }
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchmove", handleTouch, { passive: true });
    window.addEventListener("mouseleave", handleLeave);
    window.addEventListener("touchend", handleLeave);
    document.addEventListener("visibilitychange", handleVisibility);

    // Démarre le cycle au montage
    resetIdleTimer();

    return () => {
      clearTimeout(idleTimer);
      clearInterval(idleMoveTimer);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchmove", handleTouch);
      window.removeEventListener("mouseleave", handleLeave);
      window.removeEventListener("touchend", handleLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [mode]);

  return (
    <div className="avatar-wrapper">
      {/* Squircle 4:3 */}
      <svg
        className="avatar-frame"
        viewBox="-8 -8 316 241"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M 150,0
             C 285,0 300,20 300,112
             C 300,205 285,225 150,225
             C 15,225 0,205 0,112
             C 0,20 15,0 150,0 Z"
        />
      </svg>

      {/* Yeux */}
      <div className="avatar-eyes">
        <Eye
          side="left"
          mode={mode}
          target={target}
          idle={idle}
          idleTarget={idleTarget}
        />
        <Eye
          side="right"
          mode={mode}
          target={target}
          idle={idle}
          idleTarget={idleTarget}
        />
      </div>
    </div>
  );
}

function Eye({
  target,
  idle,
  idleTarget,
  side,
  mode,
}: {
  target: Point | null;
  idle: boolean;
  idleTarget: Point | null;
  side: "left" | "right";
  mode: Mode;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState({ x: 1, y: 1 });

  useEffect(() => {
    // En mode erreur : fixe, centré, pas de blink ni de suivi
    if (mode === "error" || mode === "success") {
      setOffset({ x: 0, y: 0 });
      setScale({ x: 1, y: 1 });
      return;
    }

    const wrap = document.querySelector(".avatar-wrapper") as HTMLElement | null;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const active: Point | null = target && !idle ? target : idle ? idleTarget : null;

    if (!active) {
      // Recentrage doux si rien à suivre
      setOffset({ x: 0, y: 0 });
      setScale({ x: 1, y: 1 });
      return;
    }

    const dx = active.x - cx;
    const dy = active.y - cy;

    // Déplacement des pupilles (amplitudes douces)
    const angle = Math.atan2(dy, dx);
    const maxX = rect.width / 2 - 40;
    const maxY = rect.height / 2 - 40;

    setOffset({
      x: Math.cos(angle) * maxX * 0.4,
      y: Math.sin(angle) * maxY * 0.6,
    });

    // Scaling vertical progressif uniquement si on sort à gauche/droite du visage
    const half = rect.width / 2;
    if (Math.abs(dx) <= half) {
      setScale({ x: 1, y: 1 });
    } else {
      const excessX = Math.abs(dx) - half;
      const intensity = Math.min(excessX / (window.innerWidth / 2), 1); // 0 → 1

      if (dx < 0) {
        // regard à gauche → œil gauche s'étire
        setScale(side === "left" ? { x: 1, y: 1 + 0.4 * intensity } : { x: 1, y: 1 });
      } else {
        // regard à droite → œil droit s'étire
        setScale(side === "right" ? { x: 1, y: 1 + 0.4 * intensity } : { x: 1, y: 1 });
      }
    }
  }, [target, idle, idleTarget, side, mode]);

  return (
    <div
      className="eye-socket"
      style={{
        transform: `scale(${scale.x}, ${scale.y})`,
        transition: "transform 0.5s ease",
      }}
    >
      <div
        className={`pupil-wrapper ${idle ? "idle" : "tracking"}`}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div className={`pupil-inner ${mode !== "normal" ? "no-blink" : ""}`}>
          {mode === "normal" && <div className="pupil-shape normal" />}
          {mode === "error" && (
            <div className={`pupil-shape error ${side}`}>
              <span></span>
              <span></span>
            </div>
          )}
          {mode === "success" && (
            <div className={`pupil-shape success`}>
              <span></span>
              <span></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
