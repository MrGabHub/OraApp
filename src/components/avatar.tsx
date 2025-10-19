import { useEffect, useRef } from "react";
import "./avatar.css";

type Point = { x: number; y: number };
type Polygon = [number, number][];
type DualShape = { left: Polygon; right: Polygon };
type InternalMode = "neutral" | "happy" | "sad" | "angry" | "skeptic";

export type Mode = "normal" | "error" | "success";

const cloneShape = (shape: DualShape): DualShape => ({
  left: shape.left.map(([x, y]) => [x, y] as [number, number]),
  right: shape.right.map(([x, y]) => [x, y] as [number, number]),
});

const DUR = 350;
const MAX_TX = 30;
const MAX_DY = 34;
const SCALE_MAX = 1.09;
const ANTI_Y_MIN = 0.96;
const EYE_HALF_W = 34;
const EYE_HALF_H = 39;
const GROW_BIAS = 0.65;
const FACE_LEFT = 0;
const FACE_RIGHT = 300;

const BASE_LEFT = { cx: 72 + 34, cy: 66 + 39 };
const BASE_RIGHT = { cx: 160 + 34, cy: 66 + 39 };

const SKEPTIC_LEFT_OPEN: DualShape = {
  left: [
    [60, 54],
    [148, 68],
    [148, 170],
    [60, 170],
  ],
  right: [
    [152, 90],
    [240, 64],
    [240, 170],
    [152, 170],
  ],
};

const SKEPTIC_RIGHT_OPEN: DualShape = {
  left: [
    [60, 64],
    [148, 90],
    [148, 170],
    [60, 170],
  ],
  right: [
    [152, 54],
    [240, 68],
    [240, 170],
    [152, 170],
  ],
};

const SHAPES: Record<InternalMode, DualShape> = {
  neutral: {
    left: [
      [60, 60],
      [148, 60],
      [148, 170],
      [60, 170],
    ],
    right: [
      [152, 60],
      [240, 60],
      [240, 170],
      [152, 170],
    ],
  },
  happy: {
    left: [
      [60, 60],
      [148, 60],
      [148, 100],
      [60, 100],
    ],
    right: [
      [152, 60],
      [240, 60],
      [240, 100],
      [152, 100],
    ],
  },
  sad: {
    left: [
      [60, 88],
      [148, 72],
      [148, 170],
      [60, 170],
    ],
    right: [
      [152, 72],
      [240, 88],
      [240, 170],
      [152, 170],
    ],
  },
  angry: {
    left: [
      [60, 72],
      [148, 88],
      [148, 170],
      [60, 170],
    ],
    right: [
      [152, 88],
      [240, 72],
      [240, 170],
      [152, 170],
    ],
  },
  skeptic: {
    left: [...SKEPTIC_LEFT_OPEN.left],
    right: [...SKEPTIC_LEFT_OPEN.right],
  },
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPoints = (A: Polygon, B: Polygon, t: number): Polygon =>
  A.map(([x, y], i) => {
    const [tx, ty] = B[i];
    return [lerp(x, tx, t), lerp(y, ty, t)] as [number, number];
  });
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const setPoints = (el: SVGPolygonElement, pts: Polygon) => {
  el.setAttribute(
    "points",
    pts
      .map(([x, y]) => `${x},${y}`)
      .join(" "),
  );
};

export default function Avatar(_: { mode: Mode }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const polyLeftRef = useRef<SVGPolygonElement | null>(null);
  const polyRightRef = useRef<SVGPolygonElement | null>(null);
  const screenRef = useRef<SVGGElement | null>(null);
  const groupLeftRef = useRef<SVGGElement | null>(null);
  const groupRightRef = useRef<SVGGElement | null>(null);
  const eyesRef = useRef<SVGGElement | null>(null);
  const flashFillRef = useRef<SVGRectElement | null>(null);
  const flashDotRef = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    const polyLeft = polyLeftRef.current;
    const polyRight = polyRightRef.current;
    const gL = groupLeftRef.current;
    const gR = groupRightRef.current;
    const eyes = eyesRef.current;
    const flashFill = flashFillRef.current;
    const flashDot = flashDotRef.current;

    if (!wrap || !svg || !polyLeft || !polyRight || !gL || !gR || !eyes || !flashFill || !flashDot) {
      return;
    }

    const buttons = Array.from(
      wrap.querySelectorAll<HTMLButtonElement>(".avatar-controls button[data-mode]"),
    );

    let mode: InternalMode = "neutral";
    let powerOn = true;
    let modeAnimation: number | null = null;
    const pendingRafs = new Set<number>();
    let skepticVariant: "leftOpen" | "rightOpen" = "leftOpen";
    let currentShape = cloneShape(SHAPES.neutral);

    const schedule = (fn: FrameRequestCallback) => {
      const id = requestAnimationFrame((time) => {
        pendingRafs.delete(id);
        fn(time);
      });
      pendingRafs.add(id);
      return id;
    };

    setPoints(polyLeft, currentShape.left);
    setPoints(polyRight, currentShape.right);

    const shapeForMode = (m: InternalMode): DualShape => {
      if (m === "skeptic") {
        const base = skepticVariant === "leftOpen" ? SKEPTIC_LEFT_OPEN : SKEPTIC_RIGHT_OPEN;
        return cloneShape(base);
      }
      return cloneShape(SHAPES[m]);
    };

    const startMorph = (targetShape: DualShape) => {
      const from = cloneShape(currentShape);
      const to = cloneShape(targetShape);
      const start = performance.now();

      if (modeAnimation !== null) {
        cancelAnimationFrame(modeAnimation);
        pendingRafs.delete(modeAnimation);
        modeAnimation = null;
      }

      const step = (now: number) => {
        const t = Math.min(1, (now - start) / DUR);
        const k = ease(t);
        const left = lerpPoints(from.left, to.left, k);
        const right = lerpPoints(from.right, to.right, k);
        setPoints(polyLeft, left);
        setPoints(polyRight, right);

        if (t < 1) {
          modeAnimation = schedule(step);
        } else {
          currentShape = cloneShape(targetShape);
          modeAnimation = null;
        }
      };

      modeAnimation = schedule(step);
    };

    const animateTo = (target: InternalMode) => {
      if (target === mode) return;
      if (target === "skeptic") {
        skepticVariant = "leftOpen";
      }
      startMorph(shapeForMode(target));
      mode = target;
    };

    const applyTransform = (
      node: SVGGElement,
      base: { cx: number; cy: number },
      tx: number,
      ty: number,
      sx: number,
      sy: number,
    ) => {
      node.setAttribute(
        "transform",
        `translate(${tx},${ty}) translate(${base.cx},${base.cy}) scale(${sx},${sy}) translate(${-base.cx},${-base.cy})`,
      );
    };

    const clientToSvg = (x: number, y: number): Point => {
      const pt = svg.createSVGPoint();
      pt.x = x;
      pt.y = y;
      const ctm = svg.getScreenCTM();
      if (!ctm) {
        return { x, y };
      }
      const point = pt.matrixTransform(ctm.inverse());
      return { x: point.x, y: point.y };
    };

    const updateWithClient = (clientX: number, clientY: number) => {
      if (!powerOn) return;

      const rect = svg.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      if (mode === "skeptic") {
        const desiredVariant: "leftOpen" | "rightOpen" =
          clientX >= centerX ? "rightOpen" : "leftOpen";
        if (desiredVariant !== skepticVariant) {
          skepticVariant = desiredVariant;
          startMorph(shapeForMode("skeptic"));
        }
      }

      const nx = clamp((clientX - centerX) / (rect.width / 2), -1, 1);
      const ny = clamp((clientY - centerY) / (rect.height / 2), -1, 1);
      const tx = nx * MAX_TX;
      const ty = ny * MAX_DY;

      const pointerSvg = clientToSvg(clientX, clientY);
      const leftSvg = clientToSvg(0, clientY);
      const rightSvg = clientToSvg(window.innerWidth, clientY);

      let tLeft = 0;
      let tRight = 0;

      if (pointerSvg.x < FACE_LEFT) {
        const denom = Math.max(1e-6, FACE_LEFT - leftSvg.x);
        tLeft = clamp((FACE_LEFT - pointerSvg.x) / denom, 0, 1);
      } else if (pointerSvg.x > FACE_RIGHT) {
        const denom = Math.max(1e-6, rightSvg.x - FACE_RIGHT);
        tRight = clamp((pointerSvg.x - FACE_RIGHT) / denom, 0, 1);
      }

      const sL = tLeft ? lerp(1, SCALE_MAX, tLeft) : 1;
      const sR = tRight ? lerp(1, SCALE_MAX, tRight) : 1;
      const ayL = tRight ? lerp(1, ANTI_Y_MIN, tRight) : 1;
      const ayR = tLeft ? lerp(1, ANTI_Y_MIN, tLeft) : 1;

      const sxL = sL;
      const syL = sL * ayL;
      const sxR = sR;
      const syR = sR * ayR;

      const dirX = Math.sign(nx) || 0;
      const dirY = Math.sign(ny) || 0;

      const biasXL = (sxL - 1) * EYE_HALF_W * GROW_BIAS * dirX;
      const biasYL = (syL - 1) * EYE_HALF_H * GROW_BIAS * dirY;
      const biasXR = (sxR - 1) * EYE_HALF_W * GROW_BIAS * dirX;
      const biasYR = (syR - 1) * EYE_HALF_H * GROW_BIAS * dirY;

      applyTransform(gL, BASE_LEFT, tx + biasXL, ty + biasYL, sxL, syL);
      applyTransform(gR, BASE_RIGHT, tx + biasXR, ty + biasYR, sxR, syR);
    };

    const powerOff = () => {
      if (!powerOn) return;
      powerOn = false;
      eyes.style.opacity = "0";

      flashFill.setAttribute("y", "0");
      flashFill.setAttribute("height", "225");

      const step1 = 100;
      const step2 = 150;
      const step3 = 250;
      const start = performance.now();

      const phase1 = (now: number) => {
        const t = Math.min(1, (now - start) / step1);
        flashFill.setAttribute("opacity", t.toString());
        if (t < 1) {
          schedule(phase1);
        } else {
          const start2 = performance.now();
          schedule((time) => phase2(time, start2));
        }
      };

      const phase2 = (now: number, start2: number) => {
        const t = Math.min(1, (now - start2) / step2);
        const h = lerp(225, 2, t);
        const y = 112 - h / 2;
        flashFill.setAttribute("y", y.toString());
        flashFill.setAttribute("height", h.toString());
        if (t < 1) {
          schedule((time) => phase2(time, start2));
        } else {
          const start3 = performance.now();
          schedule((time) => phase3(time, start3));
        }
      };

      const phase3 = (now: number, start3: number) => {
        const t = Math.min(1, (now - start3) / step3);
        const r = lerp(2, 8, t);
        flashFill.setAttribute("opacity", (1 - t).toString());
        flashDot.setAttribute("opacity", t.toString());
        flashDot.setAttribute("r", r.toString());
        if (t < 1) {
          schedule((time) => phase3(time, start3));
        } else {
          flashDot.setAttribute("opacity", "0");
        }
      };

      schedule(phase1);
    };

    const powerOnReset = () => {
      if (powerOn) return;
      powerOn = true;

      const step1 = 250;
      const step2 = 150;
      const step3 = 100;
      const start = performance.now();

      const phase1 = (now: number) => {
        const t = Math.min(1, (now - start) / step1);
        const r = lerp(8, 2, t);
        flashDot.setAttribute("opacity", (1 - t).toString());
        flashDot.setAttribute("r", r.toString());
        flashFill.setAttribute("opacity", t.toString());
        if (t < 1) {
          schedule(phase1);
        } else {
          const start2 = performance.now();
          schedule((time) => phase2(time, start2));
        }
      };

      const phase2 = (now: number, start2: number) => {
        const t = Math.min(1, (now - start2) / step2);
        const h = lerp(2, 225, t);
        const y = 112 - h / 2;
        flashFill.setAttribute("y", y.toString());
        flashFill.setAttribute("height", h.toString());
        if (t < 1) {
          schedule((time) => phase2(time, start2));
        } else {
          const start3 = performance.now();
          schedule((time) => phase3(time, start3));
        }
      };

      const phase3 = (now: number, start3: number) => {
        const t = Math.min(1, (now - start3) / step3);
        flashFill.setAttribute("opacity", (1 - t).toString());
        if (t < 1) {
          schedule((time) => phase3(time, start3));
        } else {
          eyes.style.opacity = "1";
          flashFill.setAttribute("opacity", "0");
          flashDot.setAttribute("opacity", "0");
        }
      };

      flashFill.setAttribute("y", (112 - 1).toString());
      flashFill.setAttribute("height", "2");

      schedule(phase1);
    };

    const handleMouseMove = (event: MouseEvent) => {
      updateWithClient(event.clientX, event.clientY);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) {
        updateWithClient(touch.clientX, touch.clientY);
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    const buttonHandlers: Array<[HTMLButtonElement, () => void]> = [];

    buttons.forEach((btn) => {
      const handler = () => {
        const target = btn.dataset.mode as InternalMode | "off" | undefined;
        if (!target) return;
        if (target === "off") {
          if (powerOn) {
            powerOff();
          } else {
            powerOnReset();
          }
        } else {
          animateTo(target);
        }
      };
      btn.addEventListener("click", handler);
      buttonHandlers.push([btn, handler]);
    });

    updateWithClient(window.innerWidth / 2, window.innerHeight / 2);

    return () => {
      if (modeAnimation !== null) {
        cancelAnimationFrame(modeAnimation);
      }
      pendingRafs.forEach((id) => cancelAnimationFrame(id));
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      buttonHandlers.forEach(([btn, handler]) => btn.removeEventListener("click", handler));
    };
  }, []);

  return (
    <div className="avatar-wrapper avatar-full" ref={wrapRef}>
      <div className="avatar-stage">
        <svg
          ref={svgRef}
          viewBox="0 0 300 225"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <filter id="glowUniform" x="-60" y="-60" width="420" height="345" filterUnits="userSpaceOnUse">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feColorMatrix
                result="glowColor"
                type="matrix"
                values="0 0 0 0 0   0 0 0 0 0.8   0 0 0 0 1   0 0 0 0.8 0"
              />
              <feMerge>
                <feMergeNode in="glowColor" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id="eye-left-cut">
              <polygon id="poly-left" ref={polyLeftRef} points="60,60 148,60 148,170 60,170" />
            </clipPath>
            <clipPath id="eye-right-cut">
              <polygon id="poly-right" ref={polyRightRef} points="152,60 240,60 240,170 152,170" />
            </clipPath>
            <pattern id="crt" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="2" fill="#000" opacity=".65" />
            </pattern>
            <clipPath id="squircle">
              <path d="M150,0 C285,0 300,20 300,112 C300,205 285,225 150,225 C15,225 0,205 0,112 C0,20 15,0 150,0 Z" />
            </clipPath>
          </defs>

          <path
            d="M150,0 C285,0 300,20 300,112 C300,205 285,225 150,225 C15,225 0,205 0,112 C0,20 15,0 150,0 Z"
            fill="#000"
          />

          <g ref={screenRef} clipPath="url(#squircle)">
            <g ref={eyesRef} id="eyes">
              <g ref={groupLeftRef} filter="url(#glowUniform)">
                <rect
                  x="72"
                  y="66"
                  width="68"
                  height="78"
                  rx="22"
                  ry="24"
                  fill="var(--accent)"
                  clipPath="url(#eye-left-cut)"
                />
              </g>
              <g ref={groupRightRef} filter="url(#glowUniform)">
                <rect
                  x="160"
                  y="66"
                  width="68"
                  height="78"
                  rx="22"
                  ry="24"
                  fill="var(--accent)"
                  clipPath="url(#eye-right-cut)"
                />
              </g>
            </g>
            <rect
              ref={flashFillRef}
              x="0"
              y="0"
              width="300"
              height="225"
              fill="var(--accent)"
              opacity="0"
              filter="url(#glowUniform)"
            />
            <rect width="300" height="225" fill="url(#crt)" opacity=".7" />
            <circle
              ref={flashDotRef}
              cx="150"
              cy="112"
              r="2"
              fill="var(--accent)"
              opacity="0"
              filter="url(#glowUniform)"
            />
          </g>
        </svg>
      </div>
      <div className="avatar-controls">
        <button data-mode="neutral">Neutre</button>
        <button data-mode="happy">Happy</button>
        <button data-mode="sad">Triste</button>
        <button data-mode="angry">Fâché</button>
        <button data-mode="skeptic">Sceptique</button>
        <button data-mode="off">OFF/ON</button>
      </div>
    </div>
  );
}
