import React, { useEffect, useRef, useState } from "react";
import "./avatar.css";

export default function Avatar() {
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  const [idle, setIdle] = useState(true);
  const [isBlinking, setIsBlinking] = useState(false);
  const [idleTarget, setIdleTarget] = useState<{ x: number; y: number } | null>(
    null
  );

  // 👁 Gestion du blink global (2–6s, doux ou sec)
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const triggerBlink = () => {
      const blinkDuration = Math.random() < 0.3 ? 100 : 250; // sec ou doux
      setIsBlinking(true);

      setTimeout(() => {
        setIsBlinking(false);
        const nextBlink = 2000 + Math.random() * 4000; // 2–6s
        timeout = setTimeout(triggerBlink, nextBlink);
      }, blinkDuration);
    };

    timeout = setTimeout(triggerBlink, 2000 + Math.random() * 4000);
    return () => clearTimeout(timeout);
  }, []);

  // 👆 Gestion des mouvements souris/touch + idle
  useEffect(() => {
    const resetIdle = () => {
      setTarget(null);
      setIdle(true);
    };

    const handleMove = (e: MouseEvent) => {
      setTarget({ x: e.clientX, y: e.clientY });
      setIdle(false);
    };

    const handleTouch = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        setTarget({ x: touch.clientX, y: touch.clientY });
        setIdle(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) resetIdle();
    };

    // ✅ Détection sortie de fenêtre
    const handleMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget && !e.toElement) {
        resetIdle();
      }
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchmove", handleTouch);
    window.addEventListener("touchend", resetIdle);
    window.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchmove", handleTouch);
      window.removeEventListener("touchend", resetIdle);
      window.removeEventListener("mouseout", handleMouseOut);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // 🎯 Idle : génère un point "virtuel" aléatoire toutes les 3–5s
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (idle) {
      const changeIdleTarget = () => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const newX = Math.random() * viewportWidth;
        const newY = Math.random() * viewportHeight;

        setIdleTarget({ x: newX, y: newY });
      };

      changeIdleTarget();
      interval = setInterval(changeIdleTarget, 3000 + Math.random() * 2000);
    }
    return () => clearInterval(interval);
  }, [idle]);

  const activeTarget = idle ? idleTarget : target;

  return (
    <div className="avatar-wrapper">
      {/* Squircle en fond */}
      <svg
        width="300"
        height="225"
        viewBox="0 0 300 225"
        xmlns="http://www.w3.org/2000/svg"
        className="avatar-frame"
      >
        <path
          d="M 150,0
             C 285,0 300,20 300,112
             C 300,205 285,225 150,225
             C 15,225 0,205 0,112
             C 0,20 15,0 150,0 Z"
          fill="#0b0f1a"
        />
      </svg>

      {/* Yeux synchronisés */}
      <div className="avatar-eyes">
        <Eye
          target={activeTarget}
          idle={idle}
          side="left"
          isBlinking={isBlinking}
        />
        <Eye
          target={activeTarget}
          idle={idle}
          side="right"
          isBlinking={isBlinking}
        />
      </div>
    </div>
  );
}

function Eye({
  target,
  idle,
  side,
  isBlinking,
}: {
  target: { x: number; y: number } | null;
  idle: boolean;
  side: "left" | "right";
  isBlinking: boolean;
}) {
  const socketRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState({ x: 1, y: 1 });

  useEffect(() => {
    if (!socketRef.current || !target) return;

    const rect = document
      .querySelector(".avatar-wrapper")!
      .getBoundingClientRect();

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = target.x - centerX;
    const dy = target.y - centerY;

    const angle = Math.atan2(dy, dx);

    const maxDistX = rect.width / 2 - 10;
    const maxDistY = rect.height / 2 - 10;
    const followFactor = idle ? 0.15 : 0.3;

    setOffset({
      x: Math.cos(angle) * maxDistX * followFactor,
      y: Math.sin(angle) * maxDistY * followFactor,
    });

    if (!idle) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.sqrt(
        (rect.width / 2) ** 2 + (rect.height / 2) ** 2
      );
      const intensity = Math.min(dist / maxDist, 1);

      if (dx < 0) {
        setScale(
          side === "left"
            ? { x: 1, y: 1 + 0.1 * intensity }
            : { x: 1, y: 1 - 0.1 * intensity }
        );
      } else {
        setScale(
          side === "right"
            ? { x: 1, y: 1 + 0.1 * intensity }
            : { x: 1, y: 1 - 0.1 * intensity }
        );
      }
    } else {
      setScale({ x: 1, y: 1 });
    }
  }, [target, idle, side]);

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
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transition: idle ? "transform 1s ease" : "transform 0.25s ease",
        }}
      >
        <div className={`pupil-inner ${isBlinking ? "blinking" : ""}`}>
          <div className="pupil-shape" />
        </div>
      </div>
    </div>
  );
}
