import { useEffect, useRef, useState } from "preact/hooks";
import type { Roll } from "../game/types";
import "./dice.css";

type Toss = { x: number; y: number };
type Props = {
  roll: Roll;
  motion: boolean;
  toss: Toss | null;
  onToss: (velocity: Toss) => void;
  onDone: () => void;
  onImpact?: () => void;
};
const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n));

export function Dice({ roll, motion, toss, onToss, onDone, onImpact }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onToss, onDone, onImpact });
  callbacks.current = { onToss, onDone, onImpact };
  const drag = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const offset = useRef<Toss>({ x: 0, y: 0 });
  const repaint = useRef<() => void>(() => {});
  const submitted = useRef(false);
  const activeToss = useRef(toss);
  activeToss.current = toss;
  const completedRoll = useRef<string | null>(null);
  const ignoreClick = useRef(false);
  const [fallback, setFallback] = useState(false);
  const [settled, setSettled] = useState(false);
  const [dragging, setDragging] = useState(false);

  function cancelDrag() {
    const active = drag.current;
    drag.current = null;
    offset.current = { x: 0, y: 0 };
    setDragging(false);
    if (active && button.current?.hasPointerCapture(active.id)) {
      button.current.releasePointerCapture(active.id);
    }
    repaint.current();
  }
  function submit(value: Toss) {
    if (toss || submitted.current) return;
    submitted.current = true;
    cancelDrag();
    callbacks.current.onToss(value);
  }
  useEffect(() => {
    submitted.current = false;
    ignoreClick.current = false;
    cancelDrag();
  }, [roll.id]);
  useEffect(() => {
    const reset = () => {
      ignoreClick.current = true;
      if (!activeToss.current) submitted.current = false;
      cancelDrag();
    };
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, []);

  useEffect(() => {
    let stopped = false, frame = 0, completed = !!toss && completedRoll.current === roll.id;
    const resources: (() => void)[] = [];
    const begin = performance.now();
    const duration = motion ? 1550 : 40;
    if (toss) cancelDrag();
    setSettled(completed);
    setFallback(false);
    const finish = () => {
      if (stopped || completed || !toss) return;
      completed = true;
      completedRoll.current = roll.id;
      setSettled(true);
      repaint.current();
      callbacks.current.onDone();
    };
    const timeout = toss && !completed ? window.setTimeout(finish, duration + 20) : undefined;
    const impact = toss && motion && !completed ? window.setTimeout(() => {
      if (!stopped) callbacks.current.onImpact?.();
    }, duration * 0.42) : undefined;
    const lost = (event: Event) => {
      event.preventDefault();
      if (!stopped) setFallback(true);
      cancelAnimationFrame(frame);
      repaint.current = () => {};
    };
    const surface = canvas.current;
    surface?.addEventListener("webglcontextlost", lost);

    void import("three").then((T) => {
      if (stopped || !surface) return;
      const renderer = new T.WebGLRenderer({ canvas: surface, antialias: true, alpha: true });
      // The canvas survives action changes. Keep its context valid for the next
      // renderer; explicitly dispose GPU resources without forcing context loss.
      resources.push(() => renderer.dispose());
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(280, 240, false);
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(39, 280 / 240, 0.1, 100);
      camera.position.z = 6.7;
      scene.add(new T.AmbientLight(0xc7e5dd, 1.6));
      const light = new T.DirectionalLight(0xffe0a0, 3);
      light.position.set(3, 5, 4);
      scene.add(light);
      const geometry = new T.IcosahedronGeometry(1.2, 0);
      resources.push(() => geometry.dispose());
      const pos = geometry.getAttribute("position");
      const uv = new Float32Array(pos.count * 2);
      const atlas = document.createElement("canvas");
      atlas.width = 512; atlas.height = 640;
      const ctx = atlas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      for (let f = 0; f < 20; f++) {
        const x = f % 4, y = Math.floor(f / 4);
        // Every face has the same material: no result cue during flight.
        ctx.fillStyle = "#183d40";
        ctx.fillRect(x * 128, y * 128, 128, 128);
        ctx.strokeStyle = "#c5af71"; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x * 128 + 3, (y + 1) * 128 - 3);
        ctx.lineTo((x + 1) * 128 - 3, (y + 1) * 128 - 3);
        ctx.lineTo(x * 128 + 64, y * 128 + 3);
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = "#f1e5bf"; ctx.font = "bold 34px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(f + 1), x * 128 + 64, y * 128 + 79);
        const points = [[0, 0], [1, 0], [0.5, 1]];
        for (let j = 0; j < 3; j++) {
          uv[(f * 3 + j) * 2] = (x + points[j][0]) / 4;
          uv[(f * 3 + j) * 2 + 1] = (4 - y + points[j][1]) / 5;
        }
      }
      geometry.setAttribute("uv", new T.BufferAttribute(uv, 2));
      const texture = new T.CanvasTexture(atlas);
      texture.colorSpace = T.SRGBColorSpace;
      resources.push(() => texture.dispose());
      const material = new T.MeshStandardMaterial({ map: texture, roughness: 0.58, metalness: 0.22, flatShading: true });
      resources.push(() => material.dispose());
      const mesh = new T.Mesh(geometry, material);
      scene.add(mesh);
      const i = (roll.face - 1) * 3;
      const a = new T.Vector3().fromBufferAttribute(pos, i);
      const b = new T.Vector3().fromBufferAttribute(pos, i + 1);
      const c = new T.Vector3().fromBufferAttribute(pos, i + 2);
      const center = a.clone().add(b).add(c).divideScalar(3);
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const up = c.clone().sub(center).normalize();
      const right = up.clone().cross(normal).normalize();
      const target = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right, up, normal).transpose());
      const vx = clamp(Number.isFinite(toss?.x) ? toss!.x : 0.6, 2);
      const vy = clamp(Number.isFinite(toss?.y) ? toss!.y : -0.9, 2);
      const strength = Math.min(1.4, 0.65 + Math.hypot(vx, vy) * 0.25);
      function paint(now: number) {
        if (stopped) return;
        if (!toss) {
          mesh.rotation.set(0.28 + offset.current.y / 120, -0.35 + offset.current.x / 120, 0.12);
          mesh.position.set(offset.current.x / 210, -offset.current.y / 210, 0);
        } else {
          const p = motion && !completed ? Math.min(1, (now - begin) / duration) : 1;
          const remaining = Math.pow(1 - p, 2.5);
          mesh.quaternion.copy(target).premultiply(new T.Quaternion().setFromEuler(new T.Euler(
            remaining * (13 + vy * 3), remaining * (17 + vx * 4), remaining * (7 + vx * 2),
          )));
          // Three bounded arcs, with each collision losing height.
          const height = p < 0.42 ? Math.sin(p / 0.42 * Math.PI) * 0.62
            : p < 0.7 ? Math.sin((p - 0.42) / 0.28 * Math.PI) * 0.25
              : p < 0.9 ? Math.sin((p - 0.7) / 0.2 * Math.PI) * 0.08 : 0;
          mesh.position.set(Math.sin(p * Math.PI) * vx * 0.35 * (1 - p), height * strength - 0.1, 0);
          if (button.current) {
            button.current.style.setProperty("--dice-shadow-scale", String(1 - height * 0.5));
            button.current.style.setProperty("--dice-shadow-opacity", String(0.35 - height * 0.3));
          }
          if (p < 1) frame = requestAnimationFrame(paint);
        }
        renderer.render(scene, camera);
      }
      repaint.current = () => paint(performance.now());
      paint(performance.now());
    }).catch(() => { if (!stopped) setFallback(true); });
    return () => {
      stopped = true;
      clearTimeout(timeout); clearTimeout(impact); cancelAnimationFrame(frame);
      repaint.current = () => {};
      surface?.removeEventListener("webglcontextlost", lost);
      resources.reverse().forEach((dispose) => dispose());
    };
  }, [roll.id, roll.face, motion, toss?.x, toss?.y]);

  return (
    <div class="tyche-dice">
      <button ref={button} type="button"
        class={`tyche-dice__surface ${dragging ? "is-dragging" : ""} ${toss && !settled && motion ? "is-rolling" : ""}`}
        aria-label={settled ? `骰子点数：${roll.face}` : toss ? "骰子正在落定" : "投掷二十面骰，拖动松手，或按回车键"}
        aria-disabled={!!toss}
        onPointerDown={(event) => {
          if (toss || submitted.current) return;
          if (!event.isPrimary || drag.current) { ignoreClick.current = true; cancelDrag(); return; }
          if (event.button !== 0) return;
          ignoreClick.current = false;
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.id !== event.pointerId) return;
          offset.current = { x: clamp(event.clientX - active.x, 100), y: clamp(event.clientY - active.y, 80) };
          repaint.current();
        }}
        onPointerUp={(event) => {
          const active = drag.current;
          if (!active || active.id !== event.pointerId) return;
          const dx = event.clientX - active.x, dy = event.clientY - active.y;
          const elapsed = Math.max(90, performance.now() - active.time);
          ignoreClick.current = true;
          submit(Math.hypot(dx, dy) < 5 ? { x: 0.6, y: -0.9 } : { x: clamp(dx / elapsed * 3, 2), y: clamp(dy / elapsed * 3, 2) });
        }}
        onPointerCancel={() => {
          ignoreClick.current = true;
          if (!activeToss.current) submitted.current = false;
          cancelDrag();
        }}
        onLostPointerCapture={() => { if (drag.current) { ignoreClick.current = true; cancelDrag(); } }}
        onClick={(event) => { if (!ignoreClick.current || event.detail === 0) submit({ x: 0.6, y: -0.9 }); ignoreClick.current = false; }}>
        <span class="tyche-dice__shadow" aria-hidden="true" />
        <canvas ref={canvas} width="280" height="240" aria-hidden="true" hidden={fallback} />
        {fallback && <span class="tyche-dice__fallback" aria-hidden="true">{settled ? roll.face : "?"}</span>}
      </button>
      <p class="tyche-dice__hint">{settled ? "命运已定" : toss ? "等待骰子落定…" : "拖动松手甩出 · 也可点击骰子"}</p>
    </div>
  );
}
