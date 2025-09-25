import { useEffect, useRef, useState } from "react";
import "./avatar.css";

export default function Avatar() {
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  const [idle, setIdle] = useState(true);

  useEffect(() => {
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

    const handleLeave = () => setIdle(true);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchmove", handleTouch);
    window.addEventListener("mouseleave", handleLeave);
    window.addEventListener("touchend", handleLeave);

    return () => {
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
          fill="#0b0f1a"
        />
      </svg>

      {/* Eyes */}
      <div className="avatar-eyes">
        <Eye target={target} idle={idle} side="left" />
        <Eye target={target} idle={idle} side="right" />
      </div>
    </div>
  );
}

function Eye({
  target,
  idle,
  side,
}: {
  target: { x: number; y: number } | null;
  idle: boolean;
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

      // Déplacement des yeux
      const angle = Math.atan2(dy, dx);
      const maxDistX = rect.width / 2 - 40;
      const maxDistY = rect.height / 2 - 40;

      setOffset({
        x: Math.cos(angle) * maxDistX * 0.4,
        y: Math.sin(angle) * maxDistY * 0.6,
      });

      // --- SCALING ---
      const halfWidth = rect.width / 2;
      if (Math.abs(dx) <= halfWidth) {
        // Zone neutre → pas de scaling
        setScale({ x: 1, y: 1 });
      } else {
        // Zone horizontale (gauche/droite)
        const excessX = Math.abs(dx) - halfWidth;
        const viewportWidth = window.innerWidth;
        const intensity = Math.min(excessX / (viewportWidth / 2), 1);

        if (dx < 0) {
          // souris à gauche
          setScale(
            side === "left"
              ? { x: 1, y: 1 + intensity * 0.4 }
              : { x: 1, y: 1 }
          );
        } else {
          // souris à droite
          setScale(
            side === "right"
              ? { x: 1, y: 1 + intensity * 0.4 }
              : { x: 1, y: 1 }
          );
        }
      }
    } else if (idle) {
      // Mode idle : les yeux restent synchronisés
      const idleTarget = {
        x: centerX + (Math.random() - 0.5) * rect.width * 0.6,
        y: centerY,
      };

      const dx = idleTarget.x - centerX;
      const dy = idleTarget.y - centerY;
      const angle = Math.atan2(dy, dx);

      setOffset({
        x: Math.cos(angle) * 10,
        y: Math.sin(angle) * 4,
      });

      setScale({ x: 1, y: 1 });
    }
  }, [target, idle, side]);

  return (
    <div
      className="eye-socket"
      ref={socketRef}
      style={{
        transform: `scale(${scale.x}, ${scale.y})`,
        transition: "transform 0.5s ease", // transition fluide
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
