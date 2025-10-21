import { useEffect, useRef } from "react";
import "./avatar.css";

type Point = { x: number; y: number };
type Polygon = [number, number][];
type DualShape = { left: Polygon; right: Polygon };
type InternalMode = "neutral" | "happy" | "sad" | "angry" | "skeptic" | "sleepy" | "drowsy";

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
const IDLE_DELAY_MS = 1000;
const SLEEPY_DELAY_MS = 35000;
const DROWSY_DELAY_MS = SLEEPY_DELAY_MS + 15000;
const OFF_DELAY_MS = DROWSY_DELAY_MS + 10000;
const IDLE_GAZE_INTERVAL_MIN_MS = 5000;
const IDLE_GAZE_INTERVAL_MAX_MS = 6000;
const IDLE_GAZE_DURATION_MIN_MS = 2000;
const IDLE_GAZE_DURATION_MAX_MS = 3000;
const ACTIVE_ANIMATION_MS = 180;
const MIN_ACTIVE_ANIMATION_MS = 24;
const SLEEPY_GLOW_OPACITY = 0.75;
const DROWSY_GLOW_OPACITY = 0.55;
const INACTIVITY_RESET_THROTTLE_MS = 120;

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

const BLINK_SHAPE: DualShape = {
  left: [
    [60, 118],
    [148, 118],
    [148, 124],
    [60, 124],
  ],
  right: [
    [152, 118],
    [240, 118],
    [240, 124],
    [152, 124],
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
  sleepy: {
    left: [
      [60, 90],
      [148, 90],
      [148, 152],
      [60, 152],
    ],
    right: [
      [152, 90],
      [240, 90],
      [240, 152],
      [152, 152],
    ],
  },
  drowsy: {
    left: [
      [60, 110],
      [148, 110],
      [148, 152],
      [60, 152],
    ],
    right: [
      [152, 110],
      [240, 110],
      [240, 152],
      [152, 152],
    ],
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

type EyeTransform = { tx: number; ty: number; sx: number; sy: number };
type GazeTransform = { left: EyeTransform; right: EyeTransform };
type GazeUpdateOptions = { immediate?: boolean; duration?: number };

const INITIAL_GAZE: GazeTransform = {
  left: { tx: 0, ty: 0, sx: 1, sy: 1 },
  right: { tx: 0, ty: 0, sx: 1, sy: 1 },
};

const cloneGaze = (state: GazeTransform): GazeTransform => ({
  left: { ...state.left },
  right: { ...state.right },
});

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
    let blinkTimer: number | null = null;
    let blinkReopenTimer: number | null = null;
    let isBlinking = false;
    let gazeState = cloneGaze(INITIAL_GAZE);
    let gazeAnimation: number | null = null;
    let idleTimer: number | null = null;
    let sleepyTimer: number | null = null;
    let drowsyTimer: number | null = null;
    let offTimer: number | null = null;
    let idleCycleTimer: number | null = null;
    let idleGazeActive = false;
    let currentGlowOpacity = 1;
    let lastInactivityReset = 0;

    const clearBlinkTimers = () => {
      if (blinkTimer !== null) {
        window.clearTimeout(blinkTimer);
        blinkTimer = null;
      }
      if (blinkReopenTimer !== null) {
        window.clearTimeout(blinkReopenTimer);
        blinkReopenTimer = null;
      }
    };

    function scheduleBlink() {
      clearBlinkTimers();
      if (!powerOn) return;
      const delay = 2600 + Math.random() * 2800;
      blinkTimer = window.setTimeout(() => {
        triggerBlink();
      }, delay);
    }

    function triggerBlink() {
      if (!powerOn || isBlinking) {
        scheduleBlink();
        return;
      }
      isBlinking = true;
      startMorph(BLINK_SHAPE, () => {
        if (!powerOn) {
          isBlinking = false;
          clearBlinkTimers();
          return;
        }
        blinkReopenTimer = window.setTimeout(() => {
          blinkReopenTimer = null;
          const target = shapeForMode(mode);
          startMorph(target, () => {
            currentShape = cloneShape(target);
            isBlinking = false;
            scheduleBlink();
          }, 90);
        }, 20);
      }, 90);
    }

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
    ensureGlowOpacity(1);

    const shapeForMode = (m: InternalMode): DualShape => {
      if (m === "skeptic") {
        const base = skepticVariant === "leftOpen" ? SKEPTIC_LEFT_OPEN : SKEPTIC_RIGHT_OPEN;
        return cloneShape(base);
      }
      return cloneShape(SHAPES[m]);
    };

    const startMorph = (targetShape: DualShape, onDone?: () => void, duration = DUR) => {
      const from = cloneShape(currentShape);
      const to = cloneShape(targetShape);
      const start = performance.now();

      if (modeAnimation !== null) {
        cancelAnimationFrame(modeAnimation);
        pendingRafs.delete(modeAnimation);
        modeAnimation = null;
      }

      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
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
          onDone?.();
        }
      };

      modeAnimation = schedule(step);
    };

    const transitionDuration = (from: InternalMode, to: InternalMode) => {
      if (
        (from === "sleepy" && to === "drowsy") ||
        (from === "drowsy" && to === "sleepy")
      ) {
        return 2000;
      }
      return DUR;
    };

    const animateTo = (target: InternalMode) => {
      if (target === mode) return;
      if (isBlinking) {
        isBlinking = false;
        clearBlinkTimers();
      }
      if (target === "skeptic") {
        skepticVariant = "leftOpen";
      }
      if (target !== "sleepy" && target !== "drowsy" && mode === "skeptic") {
        skepticVariant = "leftOpen";
      }
      ensureGlowOpacity(glowOpacityForMode(target));
      const targetShape = shapeForMode(target);
      const morphDuration = transitionDuration(mode, target);
      startMorph(targetShape, () => {
        if (powerOn) {
          scheduleBlink();
        }
      }, morphDuration);
      mode = target;
    };

    function setGroupOpacity(value: number) {
      gL!.style.opacity = value.toString();
      gR!.style.opacity = value.toString();
    }

    const glowOpacityForMode = (current: InternalMode): number => {
      if (current === "sleepy") return SLEEPY_GLOW_OPACITY;
      if (current === "drowsy") return DROWSY_GLOW_OPACITY;
      return 1;
    };

    function ensureGlowOpacity(value: number) {
      if (currentGlowOpacity === value) {
        return;
      }
      setGroupOpacity(value);
      currentGlowOpacity = value;
    }

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

    const renderGaze = (state: GazeTransform) => {
      applyTransform(gL, BASE_LEFT, state.left.tx, state.left.ty, state.left.sx, state.left.sy);
      applyTransform(gR, BASE_RIGHT, state.right.tx, state.right.ty, state.right.sx, state.right.sy);
      gazeState = cloneGaze(state);
    };

    const cancelGazeAnimation = () => {
      if (gazeAnimation !== null) {
        cancelAnimationFrame(gazeAnimation);
        pendingRafs.delete(gazeAnimation);
        gazeAnimation = null;
      }
    };

    const animateGaze = (
      target: GazeTransform,
      { immediate = false, duration = IDLE_GAZE_DURATION_MAX_MS }: GazeUpdateOptions = {},
    ) => {
      cancelGazeAnimation();
      if (immediate || duration <= 0) {
        renderGaze(target);
        return;
      }

      const from = cloneGaze(gazeState);
      const start = performance.now();

      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const k = ease(t);
        const current: GazeTransform = {
          left: {
            tx: lerp(from.left.tx, target.left.tx, k),
            ty: lerp(from.left.ty, target.left.ty, k),
            sx: lerp(from.left.sx, target.left.sx, k),
            sy: lerp(from.left.sy, target.left.sy, k),
          },
          right: {
            tx: lerp(from.right.tx, target.right.tx, k),
            ty: lerp(from.right.ty, target.right.ty, k),
            sx: lerp(from.right.sx, target.right.sx, k),
            sy: lerp(from.right.sy, target.right.sy, k),
          },
        };

        renderGaze(current);

        if (t < 1) {
          gazeAnimation = schedule(step);
        } else {
          gazeAnimation = null;
        }
      };

      gazeAnimation = schedule(step);
    };

    const computeActiveDuration = (target: GazeTransform) => {
      const txDelta = Math.max(
        Math.abs(target.left.tx - gazeState.left.tx),
        Math.abs(target.right.tx - gazeState.right.tx),
      );
      const tyDelta = Math.max(
        Math.abs(target.left.ty - gazeState.left.ty),
        Math.abs(target.right.ty - gazeState.right.ty),
      );
      const translationFactor = Math.max(txDelta / MAX_TX, tyDelta / MAX_DY);
      const sxDelta = Math.max(
        Math.abs(target.left.sx - gazeState.left.sx),
        Math.abs(target.right.sx - gazeState.right.sx),
      );
      const syDelta = Math.max(
        Math.abs(target.left.sy - gazeState.left.sy),
        Math.abs(target.right.sy - gazeState.right.sy),
      );
      const scaleRange = Math.max(1e-6, SCALE_MAX - 1);
      const scaleFactor = Math.max(sxDelta, syDelta) / scaleRange;
      const normalized = clamp(Math.max(translationFactor, scaleFactor), 0, 1);
      const baseDuration = normalized * ACTIVE_ANIMATION_MS;
      return clamp(baseDuration, MIN_ACTIVE_ANIMATION_MS, ACTIVE_ANIMATION_MS);
    };

    const updateWithClient = (
      clientX: number,
      clientY: number,
      options: GazeUpdateOptions = {},
    ) => {
      if (!powerOn) return;

      const { immediate = false, duration } = options;

      if (mode === "drowsy" && !immediate) {
        return;
      }

      const rect = svg.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      if (mode === "skeptic") {
        const desiredVariant: "leftOpen" | "rightOpen" =
          clientX >= centerX ? "rightOpen" : "leftOpen";
        if (desiredVariant !== skepticVariant) {
          skepticVariant = desiredVariant;
          if (isBlinking) {
            isBlinking = false;
            clearBlinkTimers();
          }
          const variantShape = shapeForMode("skeptic");
          startMorph(variantShape, () => {
            if (powerOn && mode !== "sleepy") {
              scheduleBlink();
            }
          });
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

      const target: GazeTransform = {
        left: {
          tx: tx + biasXL,
          ty: ty + biasYL,
          sx: sxL,
          sy: syL,
        },
        right: {
          tx: tx + biasXR,
          ty: ty + biasYR,
          sx: sxR,
          sy: syR,
        },
      };

      const animationDuration = immediate ? 0 : duration ?? computeActiveDuration(target);

      animateGaze(target, { immediate, duration: animationDuration });
    };

    const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

    const randomOutsideAvatar = () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
    });

    const randomInsideAvatar = () => {
      const rect = svg.getBoundingClientRect();
      return {
        x: rect.left + Math.random() * rect.width,
        y: rect.top + Math.random() * rect.height,
      };
    };

    const clearIdleCycle = () => {
      if (idleCycleTimer !== null) {
        window.clearTimeout(idleCycleTimer);
        idleCycleTimer = null;
      }
    };

    const triggerIdleGaze = () => {
      if (!idleGazeActive || !powerOn || mode === "drowsy") {
        return;
      }
      const targetPoint = mode === "sleepy" ? randomInsideAvatar() : randomOutsideAvatar();
      const moveDuration = randomBetween(IDLE_GAZE_DURATION_MIN_MS, IDLE_GAZE_DURATION_MAX_MS);
      updateWithClient(targetPoint.x, targetPoint.y, { duration: moveDuration });
    };

    const scheduleIdleCycle = () => {
      clearIdleCycle();
      if (!idleGazeActive || !powerOn || mode === "drowsy") {
        return;
      }
      const delay = randomBetween(IDLE_GAZE_INTERVAL_MIN_MS, IDLE_GAZE_INTERVAL_MAX_MS);
      idleCycleTimer = window.setTimeout(() => {
        idleCycleTimer = null;
        triggerIdleGaze();
        scheduleIdleCycle();
      }, delay);
    };

    const startIdleGaze = () => {
      if (idleGazeActive || !powerOn || mode === "drowsy") {
        return;
      }
      idleGazeActive = true;
      triggerIdleGaze();
      scheduleIdleCycle();
    };

    const stopIdleGaze = () => {
      if (!idleGazeActive) {
        return;
      }
      idleGazeActive = false;
      clearIdleCycle();
      cancelGazeAnimation();
    };

    const clearIdleTimer = () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const clearSleepyTimer = () => {
      if (sleepyTimer !== null) {
        window.clearTimeout(sleepyTimer);
        sleepyTimer = null;
      }
    };

    const clearDrowsyTimer = () => {
      if (drowsyTimer !== null) {
        window.clearTimeout(drowsyTimer);
        drowsyTimer = null;
      }
    };

    const clearOffTimer = () => {
      if (offTimer !== null) {
        window.clearTimeout(offTimer);
        offTimer = null;
      }
    };

    const clearInactivityTimers = () => {
      clearIdleTimer();
      clearSleepyTimer();
      clearDrowsyTimer();
      clearOffTimer();
    };

    const enterSleepy = () => {
      if (!powerOn || mode === "sleepy" || mode === "drowsy") {
        return;
      }
      const wasIdle = idleGazeActive;
      if (wasIdle) {
        stopIdleGaze();
      } else {
        cancelGazeAnimation();
      }
      clearBlinkTimers();
      ensureGlowOpacity(glowOpacityForMode("sleepy"));
      animateTo("sleepy");
      if (wasIdle || powerOn) {
        startIdleGaze();
      }
    };

    const enterDrowsy = () => {
      if (!powerOn || mode === "drowsy") {
        return;
      }
      stopIdleGaze();
      clearBlinkTimers();
      ensureGlowOpacity(glowOpacityForMode("drowsy"));
      animateTo("drowsy");
    };

    const enterOff = () => {
      if (!powerOn) {
        return;
      }
      stopIdleGaze();
      clearBlinkTimers();
      ensureGlowOpacity(1);
      powerOff();
    };

    const startInactivityTimers = () => {
      clearInactivityTimers();
      idleTimer = window.setTimeout(() => {
        idleTimer = null;
        startIdleGaze();
      }, IDLE_DELAY_MS);
      sleepyTimer = window.setTimeout(() => {
        sleepyTimer = null;
        enterSleepy();
      }, SLEEPY_DELAY_MS);
      drowsyTimer = window.setTimeout(() => {
        drowsyTimer = null;
        enterDrowsy();
      }, DROWSY_DELAY_MS);
      offTimer = window.setTimeout(() => {
        offTimer = null;
        enterOff();
      }, OFF_DELAY_MS);
    };

    const resetInactivity = () => {
      lastInactivityReset = performance.now();
      const wasSleepy = mode === "sleepy" || mode === "drowsy";
      clearInactivityTimers();
      stopIdleGaze();
      if (!powerOn) {
        powerOnReset();
        ensureGlowOpacity(1);
        animateTo("neutral");
      } else if (wasSleepy) {
        ensureGlowOpacity(1);
        animateTo("neutral");
      }
      startInactivityTimers();
    };

    const resetInactivityThrottled = () => {
      const now = performance.now();
      if (now - lastInactivityReset >= INACTIVITY_RESET_THROTTLE_MS) {
        resetInactivity();
      }
    };

    const powerOff = () => {
      if (!powerOn) return;
      clearInactivityTimers();
      stopIdleGaze();
      ensureGlowOpacity(1);
      powerOn = false;
      clearBlinkTimers();
      isBlinking = false;
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
      clearBlinkTimers();
      isBlinking = false;

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
          if (powerOn) {
            scheduleBlink();
          }
        }
      };

      flashFill.setAttribute("y", (112 - 1).toString());
      flashFill.setAttribute("height", "2");

      schedule(phase1);
    };

    const handleMouseMove = (event: MouseEvent) => {
      resetInactivityThrottled();
      updateWithClient(event.clientX, event.clientY, { immediate: true });
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) {
        resetInactivityThrottled();
        updateWithClient(touch.clientX, touch.clientY, { immediate: true });
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
            resetInactivity();
          }
        } else {
          resetInactivity();
          animateTo(target);
        }
      };
      btn.addEventListener("click", handler);
      buttonHandlers.push([btn, handler]);
    });

    updateWithClient(window.innerWidth / 2, window.innerHeight / 2, { immediate: true });
    scheduleBlink();
    startInactivityTimers();

    return () => {
      if (modeAnimation !== null) {
        cancelAnimationFrame(modeAnimation);
      }
      pendingRafs.forEach((id) => cancelAnimationFrame(id));
      clearBlinkTimers();
      isBlinking = false;
      stopIdleGaze();
      cancelGazeAnimation();
      clearInactivityTimers();
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
