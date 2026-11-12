"use client";
/**
 * 3D market view (three.js).
 *
 *   x  → time (most recent candle at x = 0, history extends to −x)
 *   y  → price (shown range mapped to 0..H)
 *   z  → depth: candles at z = 0, zones are translucent slabs straddling the candles,
 *        volume is a wall behind the chart, the trade plan floats as stacked planes.
 *
 * Same data and drawings as the 2D chart. Prices are read from the 2D view or the tooltip;
 * the 3D view is for spatial context, not precise level reading.
 */
import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { api, qs } from "@/lib/api";
import { useMarketStream } from "@/lib/hooks";
import type { Analysis, Candle, Drawing, Setup } from "@/lib/types";
import { cn, fmtPrice } from "@/lib/utils";
import { DrawingTooltip } from "./drawing-tooltip";

const SHOW = 160; // candles rendered
const H = 80; // world height of the price range
const BG = "#0d1117";
const ZONE_KINDS = new Set(["order_block", "fvg", "demand", "supply", "sr_zone"]);
const LEVEL_KINDS = new Set(["liquidity", "key_level", "session_level", "structure_break", "liquidity_sweep", "breakout"]);

interface Props {
  symbol: string;
  tf: string;
  analysis: Analysis | null;
  setup?: Setup | null;
  visible: string[];
  colors: Record<string, string>;
  showPlan: boolean;
  onBarClosed?: () => void;
  compact?: boolean;
  className?: string;
}

interface Mapper {
  x: (t: number) => number;
  y: (p: number) => number;
  lo: number;
  hi: number;
  n: number;
}

function makeMapper(c: Candle[]): Mapper {
  const lo0 = Math.min(...c.map((b) => b.low));
  const hi0 = Math.max(...c.map((b) => b.high));
  const pad = (hi0 - lo0) * 0.06 || hi0 * 0.001;
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const times = c.map((b) => b.time);
  const n = c.length;
  const step = n > 1 ? times[n - 1] - times[n - 2] : 60;
  return {
    lo, hi, n,
    y: (p) => ((p - lo) / (hi - lo)) * H,
    x: (t) => {
      if (t <= times[0]) return -(n - 1);
      if (t >= times[n - 1]) return (t - times[n - 1]) / step;
      let a = 0, b = n - 1;
      while (b - a > 1) { const m = (a + b) >> 1; if (times[m] <= t) a = m; else b = m; }
      return a + (t - times[a]) / (times[b] - times[a]) - (n - 1);
    },
  };
}

function textSprite(text: string, color: string, size = 1.6): THREE.Sprite {
  const font = "600 40px Inter, ui-sans-serif, system-ui, sans-serif";
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d")!;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  cv.width = w;
  cv.height = 56;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 8, 29);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.scale.set((size * w) / 56, size, 1);
  sp.renderOrder = 10;
  return sp;
}

function line(points: THREE.Vector3[], color: string, opacity = 0.9, dashed = false): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const m = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.8, gapSize: 0.6 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const l = new THREE.Line(g, m);
  if (dashed) l.computeLineDistances();
  return l;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      (mat as THREE.SpriteMaterial).map?.dispose();
      mat.dispose();
    }
  });
}

/** Builds candles + volume (instanced) into a group. Returns updater for the forming bar. */
function buildCandles(c: Candle[], mp: Mapper, colors: Record<string, string>) {
  const g = new THREE.Group();
  const n = c.length;
  const bodyGeo = new THREE.BoxGeometry(0.72, 1, 0.72);
  const wickGeo = new THREE.BoxGeometry(0.09, 1, 0.09);
  const volGeo = new THREE.BoxGeometry(0.72, 1, 0.5);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.15 });
  const volMat = new THREE.MeshStandardMaterial({ roughness: 0.9, transparent: true, opacity: 0.55 });
  const bodies = new THREE.InstancedMesh(bodyGeo, mat, n);
  const wicks = new THREE.InstancedMesh(wickGeo, mat, n);
  const vols = new THREE.InstancedMesh(volGeo, volMat, n);
  const bull = new THREE.Color(colors.bullish);
  const bear = new THREE.Color(colors.bearish);
  const vmax = Math.max(...c.map((b) => b.volume)) || 1;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();

  const set = (i: number, b: Candle) => {
    const x = i - (n - 1);
    const yo = mp.y(b.open), yc = mp.y(b.close), yh = mp.y(b.high), yl = mp.y(b.low);
    const bh = Math.max(Math.abs(yc - yo), 0.06);
    m4.compose(new THREE.Vector3(x, (yo + yc) / 2, 0), q, new THREE.Vector3(1, bh, 1));
    bodies.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, (yh + yl) / 2, 0), q, new THREE.Vector3(1, Math.max(yh - yl, 0.06), 1));
    wicks.setMatrixAt(i, m4);
    const vh = (b.volume / vmax) * H * 0.22;
    m4.compose(new THREE.Vector3(x, vh / 2, -5), q, new THREE.Vector3(1, Math.max(vh, 0.02), 1));
    vols.setMatrixAt(i, m4);
    const col = b.close >= b.open ? bull : bear;
    bodies.setColorAt(i, col);
    wicks.setColorAt(i, col);
    vols.setColorAt(i, col);
  };
  c.forEach((b, i) => set(i, b));
  g.add(bodies, wicks, vols);
  const update = (b: Candle) => {
    set(n - 1, b);
    for (const im of [bodies, wicks, vols]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  };
  return { group: g, update };
}

function buildScenery(c: Candle[], mp: Mapper) {
  const g = new THREE.Group();
  const n = c.length;
  // floor grid + back wall
  const grid = new THREE.GridHelper(n + 20, Math.round((n + 20) / 5), "#1f2633", "#141a24");
  grid.position.set(-(n - 1) / 2 + 5, -0.05, 0);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.7;
  g.add(grid);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(n + 20, H), new THREE.MeshBasicMaterial({ color: "#0a0e14", transparent: true, opacity: 0.6 }));
  wall.position.set(-(n - 1) / 2 + 5, H / 2, -8);
  g.add(wall);
  // price ticks along the right edge, mirrored as faint rails on the wall
  const ticks = 6;
  for (let k = 0; k <= ticks; k++) {
    const p = mp.lo + ((mp.hi - mp.lo) * k) / ticks;
    const y = mp.y(p);
    g.add(line([new THREE.Vector3(-(n - 1) - 5, y, -7.9), new THREE.Vector3(14, y, -7.9)], "#1f2633", 0.9));
    const s = textSprite(fmtPrice(p, mp.hi), "#8b95a7", 1.3);
    s.position.set(9 + s.scale.x / 2, y, 0);
    g.add(s);
  }
  // time labels along the front of the floor
  const every = Math.max(1, Math.round(n / 6));
  for (let i = 0; i < n; i += every) {
    const d = new Date(c[i].time * 1000);
    const txt = `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    const s = textSprite(txt, "#64748b", 1.1);
    s.position.set(i - (n - 1), -2, 5);
    g.add(s);
  }
  return g;
}

function buildDrawings(drawings: Drawing[], mp: Mapper, colors: Record<string, string>, visible: Set<string>,
  candles: Candle[], pick: THREE.Object3D[]) {
  const g = new THREE.Group();
  const right = 8;
  const inRange = (p: number) => p >= mp.lo && p <= mp.hi;
  const clampY = (p: number) => mp.y(Math.min(mp.hi, Math.max(mp.lo, p)));
  const dirColor = (d: Drawing, base: string) => (d.direction === "bullish" ? colors.bullish : d.direction === "bearish" ? colors.bearish : base);

  for (const d of drawings) {
    if (!visible.has(d.kind)) continue;
    const base = colors[d.kind] ?? "#94a3b8";
    if (ZONE_KINDS.has(d.kind) && d.top !== null && d.bottom !== null) {
      if (d.top < mp.lo || d.bottom > mp.hi) continue;
      const x1 = mp.x(d.time_start ?? 0);
      const x2 = d.time_end ? mp.x(d.time_end) : right;
      const y1 = clampY(d.bottom), y2 = clampY(d.top);
      const w = Math.max(0.5, x2 - x1), h = Math.max(0.15, y2 - y1);
      const depth = d.kind === "sr_zone" ? 4.5 : d.kind === "fvg" ? 2.2 : 3.2;
      const col = d.kind === "order_block" || d.kind === "fvg" ? dirColor(d, base) : base;
      const faded = d.status === "tested" || d.status === "partially_filled";
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth),
        new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: (d.kind === "sr_zone" ? 0.08 : 0.16) * (faded ? 0.6 : 1), depthWrite: false, roughness: 1 }));
      box.position.set(x1 + w / 2, y1 + h / 2, 0);
      box.userData.drawing = d;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55 }));
      box.add(edges);
      g.add(box);
      pick.push(box);
      const lab = textSprite(`${d.label} · Q${d.quality}`, col, 1.1);
      lab.position.set(x2 - lab.scale.x / 2 - 0.3, y2 + 0.8, depth / 2);
      g.add(lab);
    } else if (LEVEL_KINDS.has(d.kind) && d.price !== null && inRange(d.price)) {
      const x1 = mp.x(d.time_start ?? 0);
      const x2 = d.kind === "liquidity" || d.kind === "key_level" ? right : d.time_end ? mp.x(d.time_end) : right;
      const y = mp.y(d.price);
      const col = d.kind === "structure_break" ? colors.structure_break : base;
      const z = d.kind === "liquidity" ? 1.6 : 0.6;
      const l = line([new THREE.Vector3(x1, y, z), new THREE.Vector3(x2, y, z)], col, 0.85, d.kind !== "structure_break");
      l.userData.drawing = d;
      g.add(l);
      pick.push(l);
      if (d.kind === "liquidity") {
        // inferred liquidity pool: a thin glowing ribbon receding into depth
        const rib = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, 3), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
        rib.rotation.x = -Math.PI / 2;
        rib.position.set((x1 + x2) / 2, y, z - 1.5);
        g.add(rib);
      }
      const lab = textSprite(d.kind === "liquidity" ? `${d.label} (inferred)` : d.label, col, 1.05);
      lab.position.set(d.kind === "structure_break" ? x1 + lab.scale.x / 2 : x2 - lab.scale.x / 2, y + 0.75, z);
      g.add(lab);
    } else if ((d.kind === "trendline" || d.kind === "channel") && d.points && d.points.length >= 2) {
      const [a, b] = d.points;
      const l = line([new THREE.Vector3(mp.x(a.time), clampY(a.price), 0.4), new THREE.Vector3(mp.x(b.time), clampY(b.price), 0.4)],
        base, d.kind === "trendline" ? 0.95 : 0.6, d.status === "broken" || d.kind === "channel");
      l.userData.drawing = d;
      g.add(l);
      pick.push(l);
    } else if (d.kind === "fibonacci" && d.levels) {
      const x1 = mp.x(d.time_start ?? 0);
      for (const lv of d.levels) {
        if (!inRange(lv.price)) continue;
        const y = mp.y(lv.price);
        const l = line([new THREE.Vector3(x1, y, -2.5), new THREE.Vector3(right, y, -2.5)], base, lv.ratio === 0.5 ? 0.8 : 0.4, lv.ratio !== 0.5);
        l.userData.drawing = d;
        g.add(l);
        pick.push(l);
        const s = textSprite(String(lv.ratio), base, 0.9);
        s.position.set(x1 + s.scale.x / 2 + 0.2, y + 0.55, -2.5);
        g.add(s);
      }
    } else if (d.kind === "swing" && d.price !== null && inRange(d.price)) {
      const x = mp.x(d.time_start ?? 0);
      const col = d.direction === "bullish" ? colors.bullish : colors.bearish;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5 }));
      const up = d.position === "above";
      orb.position.set(x, mp.y(d.price) + (up ? 1.1 : -1.1), 0);
      orb.userData.drawing = d;
      g.add(orb);
      pick.push(orb);
      const s = textSprite(d.label, col, 1.1);
      s.position.set(x, orb.position.y + (up ? 1.1 : -1.1), 0);
      g.add(s);
    }
  }
  // sweep arrows on their candle
  if (visible.has("liquidity_sweep")) {
    for (const d of drawings.filter((x) => x.kind === "liquidity_sweep" && x.time_end)) {
      const i = candles.findIndex((b) => b.time === d.time_end);
      if (i < 0) continue;
      const b = candles[i];
      const bullish = d.direction === "bullish";
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 12), new THREE.MeshStandardMaterial({ color: colors.liquidity_sweep, emissive: colors.liquidity_sweep, emissiveIntensity: 0.4 }));
      cone.position.set(i - (candles.length - 1), bullish ? mp.y(b.low) - 1.6 : mp.y(b.high) + 1.6, 0);
      if (!bullish) cone.rotation.z = Math.PI;
      cone.userData.drawing = d;
      g.add(cone);
      pick.push(cone);
    }
  }
  return g;
}

function buildPlan(setup: Setup, mp: Mapper, colors: Record<string, string>) {
  const g = new THREE.Group();
  const p = setup.plan!;
  const x1 = -12, x2 = 8, w = x2 - x1;
  const slab = (lo: number, hi: number, col: string, opacity: number, label: string) => {
    if (hi < mp.lo || lo > mp.hi) return;
    const y1 = mp.y(Math.max(lo, mp.lo)), y2 = mp.y(Math.min(hi, mp.hi));
    const h = Math.max(0.18, y2 - y1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity, depthWrite: false, emissive: col, emissiveIntensity: 0.25 }));
    m.position.set(x1 + w / 2, y1 + h / 2, 0);
    g.add(m);
    const s = textSprite(label, col, 1.15);
    s.position.set(x2 + 0.4 + s.scale.x / 2, y1 + h / 2, 3);
    g.add(s);
  };
  slab(p.entry_zone[0], p.entry_zone[1], colors.setup, 0.22, "Entry zone");
  slab(p.stop_loss, p.stop_loss, colors.bearish, 0.45, `SL ${fmtPrice(p.stop_loss)}`);
  p.take_profits.forEach((tp, i) => slab(tp, tp, colors.bullish, 0.35 - i * 0.08, `TP${i + 1} · ${p.rr[i]}R`));
  return g;
}

export function Chart3D({ symbol, tf, analysis, setup, visible, colors, showPlan, onBarClosed, compact, className }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    world: THREE.Group; pick: THREE.Object3D[]; update: ((b: Candle) => boolean) | null; home: () => void;
  } | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [last, setLast] = useState<Candle | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; d: Drawing } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [webgl, setWebgl] = useState(true);

  // ---- renderer / scene / camera / controls (once)
  useEffect(() => {
    const el = box.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      // WebGL unavailable (blocked GPU / old browser): report asynchronously, show the fallback notice
      queueMicrotask(() => setWebgl(false));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.Fog(BG, 230, 480);
    scene.add(new THREE.HemisphereLight("#cbd5e1", "#0b1220", 1.1));
    const key = new THREE.DirectionalLight("#ffffff", 1.6);
    key.position.set(30, 80, 60);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#38bdf8", 0.6);
    rim.position.set(-80, 30, -60);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.5, 900);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.minDistance = 15;
    controls.maxDistance = 420;
    const home = () => {
      // slightly right of and above the latest candle, looking back across history
      camera.position.set(-8, H * 0.72, 150);
      controls.target.set(-66, H * 0.47, 0);
      controls.update();
    };
    home();
    const world = new THREE.Group();
    scene.add(world);
    three.current = { renderer, scene, camera, controls, world, pick: [], update: null, home };

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);

    const ray = new THREE.Raycaster();
    ray.params.Line = { threshold: 0.6 };
    const onMove = (e: PointerEvent) => {
      if (e.buttons) { setTip(null); return; }
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(three.current?.pick ?? [], false).find((h) => h.object.userData.drawing);
      const px = e.clientX - r.left, py = e.clientY - r.top;
      setTip(hit ? { x: Math.max(4, Math.min(px + 14, r.width - 300)), y: Math.max(4, py - 10), d: hit.object.userData.drawing } : null);
      renderer.domElement.style.cursor = hit ? "help" : "grab";
    };
    const onLeave = () => setTip(null);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      disposeTree(scene);
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  // ---- data
  useEffect(() => {
    let alive = true;
    api.get<{ candles: Candle[] }>(`/candles${qs({ symbol, tf, limit: SHOW })}`)
      .then((r) => { if (alive) { setErr(null); setCandles(r.candles); setLast(r.candles.at(-1) ?? null); } })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [symbol, tf]);

  const visibleSet = useMemo(() => new Set(visible), [visible]);

  // ---- (re)build the world whenever data or drawings change
  useEffect(() => {
    const t = three.current;
    if (!t || candles.length < 2) return;
    for (const ch of [...t.world.children]) { t.world.remove(ch); disposeTree(ch); }
    const mp = makeMapper(candles);
    const pick: THREE.Object3D[] = [];
    const cs = buildCandles(candles, mp, colors);
    t.world.add(buildScenery(candles, mp), cs.group);
    const d = analysis && analysis.symbol === symbol && analysis.timeframe === tf ? analysis.drawings : [];
    t.world.add(buildDrawings(d, mp, colors, visibleSet, candles, pick));
    if (showPlan && setup?.plan && setup.symbol === symbol && setup.timeframe === tf &&
        ["bullish_setup", "bearish_setup", "wait_for_confirmation"].includes(setup.status)) {
      t.world.add(buildPlan(setup, mp, colors));
    }
    t.pick = pick;
    // live updates of the forming bar only while it stays inside the mapped range
    t.update = (b) => {
      if (b.low < mp.lo || b.high > mp.hi) return false;
      cs.update(b);
      return true;
    };
  }, [candles, analysis, setup, colors, visibleSet, showPlan, symbol, tf]);

  // ---- live stream
  const connected = useMarketStream(symbol, tf, (m) => {
    const b = m.bar;
    setLast(b);
    const lastT = candles.at(-1)?.time;
    if (lastT === undefined || b.time < lastT) return;
    // same bar: update the instanced meshes in place (no scene rebuild) unless it left the mapped price range
    if (b.time === lastT && three.current?.update?.(b)) return;
    setCandles((prev) => (b.time === prev.at(-1)?.time ? [...prev.slice(0, -1), b] : [...prev.slice(1), b]));
  }, onBarClosed);

  const chg = last && candles.length > 1 ? last.close - candles[0].close : 0;

  return (
    <div className={cn("relative h-full min-h-[280px] w-full overflow-hidden", className)}>
      <div ref={box} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
      <div className="pointer-events-none absolute left-2 top-1.5 z-10 flex items-center gap-2 text-xs">
        <span className="font-semibold">{symbol}</span>
        <span className="text-muted">{tf}</span>
        <span className="rounded bg-accent/15 px-1 text-[10px] font-semibold text-accent">3D</span>
        {last && <span className={cn("tabular-nums", chg >= 0 ? "text-bull" : "text-bear")}>{fmtPrice(last.close)}</span>}
        <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-bull" : "bg-bear")} title={connected ? "Live stream connected" : "Stream disconnected"} />
      </div>
      {!compact && (
        <div className="pointer-events-none absolute bottom-2 right-2 z-10 rounded bg-panel/80 px-2 py-1 text-[10px] text-muted">
          Drag to orbit · scroll to zoom · right-drag to pan · hover a structure for details
        </div>
      )}
      <button onClick={() => three.current?.home()} title="Reset camera"
        className="absolute right-2 top-1.5 z-10 grid h-6 w-6 place-items-center rounded bg-panel/80 text-muted hover:text-fg">
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
      {!webgl && <div className="absolute inset-0 z-20 grid place-items-center bg-panel p-4 text-center text-xs text-muted">WebGL is not available in this browser — switch back to the 2D view.</div>}
      {err && <div className="absolute inset-0 z-20 grid place-items-center bg-panel/80 p-4 text-center text-xs text-bear">{err}</div>}
      {tip && <DrawingTooltip d={tip.d} x={tip.x} y={tip.y} />}
    </div>
  );
}
