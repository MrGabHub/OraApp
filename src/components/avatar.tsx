import { useEffect, useRef, useState } from "react";
import "./avatar.css";

export default function Avatar() {
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  const [idle, setIdle] = useState(true);
  const [idleTarget, setIdleTarget] = useState<{ x: number; y: number } | null>(
    null
  );

  useEffect(() => {
    let idleTimer: NodeJS.Timeout;
    let idleMoveTimer: NodeJS.Timeout;

    const pickNewIdleTarget = () => {
      const rect = document
        .querySelector(".avatar-wrapper")!
        .getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      setIdleTarget({
        x: centerX + (Math.random() - 0.5) * window.innerWidth * 0.4,
        y: centerY + (Math.random() - 0.5) * window.innerHeight * 0.3,
      });
    };

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      clearInterval(idleMoveTimer);
      setIdle(false);

      idleTimer = setTimeout(() => {
        setIdle(true);
        setTarget(null);
        pickNewIdleTarget();
        idleMoveTimer = setInterval(pickNewIdleTarget, 3000); // 👈 toutes les 3s
      }, 1000);
    };

    const handleMove = (e: MouseEvent) => {
      setTarget({ x: e.clientX, y: e.clientY });
      resetIdleTimer();
    };

    const handleTouch = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        setTarget({ x: touch.clientX, y: touch.clientY });
        resetIdleTimer();
      }
    };

    const handleLeave = () => {
      setIdle(true);
      setTarget(null);
      pickNewIdleTarget();
      idleMoveTimer = setInterval(pickNewIdleTarget, 3000);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchmove", handleTouch);
    window.addEventListener("mouseleave", handleLeave);
    window.addEventListener("touchend", handleLeave);

    resetIdleTimer();

    return () => {
      clearTimeout(idleTimer);
      clearInterval(idleMoveTimer);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchmove", handleTouch);
      window.removeEventListener("mouseleave", handleLeave);
      window.removeEventListener("touchend", handleLeave);
    };
  }, []);

  return (
    <div className="avatar-wrapper">
      {/* Squircle */}
      <svg
        className="avatar-frame"
        viewBox="0 0 300 225"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M 150,0
             C 285,0 300,20 300,112
             C 300,205 285,225 150,225
             C 15,225 0,205 0,112
             C 0,20 15,0 150,0 Z"
        />
      </svg>

      {/* Eyes */}
      <div className="avatar-eyes">
        <Eye target={target} idle={idle} idleTarget={idleTarget} side="left" />
        <Eye target={target} idle={idle} idleTarget={idleTarget} side="right" />
      </div>
    </div>
  );
}

function Eye({
  target,
  idle,
  idleTarget,
  side,
}: {
  target: { x: number; y: number } | null;
  idle: boolean;
  idleTarget: { x: number; y: number } | null;
  side: "left" | "right";
}) {
  const socketRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState({ x: 1, y: 1 });

  useEffect(() => {
    if (!socketRef.current) return;

    const rect = document
      .querySelector(".avatar-wrapper")!
      .getBoundingClientRect();

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (target && !idle) {
      const dx = target.x - centerX;
      const dy = target.y - centerY;

      const angle = Math.atan2(dy, dx);
      const maxDistX = rect.width / 2 - 40;
      const maxDistY = rect.height / 2 - 40;

      setOffset({
        x: Math.cos(angle) * maxDistX * 0.4,
        y: Math.sin(angle) * maxDistY * 0.6,
      });

      const halfWidth = rect.width / 2;
      if (Math.abs(dx) <= halfWidth) {
        setScale({ x: 1, y: 1 });
      } else {
        const excessX = Math.abs(dx) - halfWidth;
        const viewportWidth = window.innerWidth;
        const intensity = Math.min(excessX / (viewportWidth / 2), 1);

        if (dx < 0) {
          setScale(
            side === "left"
              ? { x: 1, y: 1 + intensity * 0.4 }
              : { x: 1, y: 1 }
          );
        } else {
          setScale(
            side === "right"
              ? { x: 1, y: 1 + intensity * 0.4 }
              : { x: 1, y: 1 }
          );
        }
      }
    } else if (idle && idleTarget) {
      const dx = idleTarget.x - centerX;
      const dy = idleTarget.y - centerY;
      const angle = Math.atan2(dy, dx);

      setOffset({
        x: Math.cos(angle) * 10,
        y: Math.sin(angle) * 4,
      });

      setScale({ x: 1, y: 1 });
    }
  }, [target, idle, idleTarget, side]);

  return (
    <div
      className="eye-socket"
      ref={socketRef}
      style={{
        transform: `scale(${scale.x}, ${scale.y})`,
        transition: "transform 0.5s ease",
      }}
    >
      <div
        className="pupil-wrapper"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div className="pupil-inner">
          <div className="pupil-shape" />
        </div>
      </div>
    </div>
  );
}
