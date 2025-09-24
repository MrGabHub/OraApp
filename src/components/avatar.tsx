import React, { useEffect, useRef, useState } from "react";
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

    const resetIdle = () => setIdle(true);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchmove", handleTouch);
    window.addEventListener("mouseleave", resetIdle);
    window.addEventListener("touchend", resetIdle);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchmove", handleTouch);
      window.removeEventListener("mouseleave", resetIdle);
      window.removeEventListener("touchend", resetIdle);
    };
  }, []);

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

      {/* Yeux par-dessus */}
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

    if (target && !idle) {
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
      const followFactor = 0.3;

      setOffset({
        x: Math.cos(angle) * maxDistX * followFactor,
        y: Math.sin(angle) * maxDistY * followFactor,
      });

      // 🎯 Scaling dynamique basé sur la distance
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.sqrt(
        (rect.width / 2) ** 2 + (rect.height / 2) ** 2
      );
      const intensity = Math.min(dist / maxDist, 1); // 0 à 1

      const baseScale = 1;
      const maxScale = 1.1; // grossissement max
      const minScale = 1; // réduction min

      if (dx < 0) {
        setScale(side === "left"
          ? { x: 1, y: 1 + 0.1 * intensity }   // gauche grossit surtout en hauteur
          : { x: 1, y: 1 - 0.1 * intensity }  // droit se réduit un peu en hauteur
        );
      } else {
        setScale(side === "right"
          ? { x: 1, y: 1 + 0.1 * intensity }
          : { x: 1, y: 1 - 0.1 * intensity }
        );
      }
    } else if (idle) {
      const interval = setInterval(() => {
        setOffset({
          x: (Math.random() - 0.5) * 6,
          y: (Math.random() - 0.5) * 6,
        });
        setScale(1); // reset taille
      }, 2000);
      return () => clearInterval(interval);
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
