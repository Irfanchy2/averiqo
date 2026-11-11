/**
 * Series primitive that renders analysis drawings (zones, levels, segments, trendlines, fib)
 * directly on the chart canvas. Time → x uses the loaded bar index (logical coordinate), so
 * drawings stay aligned for any timestamp, even between bars.
 */
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Logical,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { Drawing, TradePlan } from "@/lib/types";

export interface RenderShape {
  id: string;
  type: "rect" | "segment" | "label";
  t1: number;
  t2: number | null; // null = extend to right edge
  p1: number;
  p2: number;
  color: string;
  fillAlpha?: number;
  dash?: number[];
  width?: number;
  text?: string;
  textSide?: "left" | "right";
  drawing?: Drawing;
}

function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function drawingsToShapes(drawings: Drawing[], colors: Record<string, string>, visible: Set<string>): RenderShape[] {
  const out: RenderShape[] = [];
  const dirColor = (d: Drawing, fallback: string) =>
    d.direction === "bullish" ? colors.bullish : d.direction === "bearish" ? colors.bearish : fallback;
  for (const d of drawings) {
    if (!visible.has(d.kind) || d.kind === "swing") continue;
    const base = colors[d.kind] ?? "#94a3b8";
    const t1 = d.time_start ?? 0;
    switch (d.kind) {
      case "order_block":
      case "fvg":
      case "demand":
      case "supply":
      case "sr_zone": {
        const c = d.kind === "sr_zone" ? base : d.kind === "order_block" || d.kind === "fvg" ? dirColor(d, base) : base;
        out.push({ id: d.id, type: "rect", t1, t2: d.time_end, p1: d.top!, p2: d.bottom!, color: c,
          fillAlpha: d.kind === "sr_zone" ? 0.08 : d.status === "tested" || d.status === "partially_filled" ? 0.07 : 0.14,
          text: `${d.label} · Q${d.quality}`, drawing: d, dash: d.kind === "fvg" ? [3, 3] : undefined });
        break;
      }
      case "fibonacci": {
        for (const lv of d.levels ?? []) {
          out.push({ id: `${d.id}-${lv.ratio}`, type: "segment", t1, t2: null, p1: lv.price, p2: lv.price, color: base,
            dash: lv.ratio === 0.5 ? undefined : [2, 4], width: lv.ratio === 0.5 ? 1.2 : 0.8, text: `${lv.ratio}`, textSide: "left", drawing: d });
        }
        break;
      }
      case "trendline":
      case "channel": {
        const p = d.points ?? [];
        if (p.length >= 2)
          out.push({ id: d.id, type: "segment", t1: p[0].time, t2: p[1].time, p1: p[0].price, p2: p[1].price, color: base,
            width: d.kind === "trendline" ? 1.6 : 1, dash: d.status === "broken" ? [4, 4] : d.kind === "channel" ? [6, 3] : undefined,
            text: d.kind === "trendline" ? d.label : undefined, drawing: d });
        break;
      }
      default: {
        if (d.price === null) break;
        const c = d.kind === "liquidity" ? base : d.kind === "structure_break" ? colors.structure_break : d.kind === "liquidity_sweep" ? base : d.kind === "breakout" ? base : base;
        out.push({ id: d.id, type: "segment", t1, t2: d.kind === "liquidity" || d.kind === "key_level" ? null : d.time_end ?? null,
          p1: d.price, p2: d.price, color: c,
          dash: d.kind === "liquidity" ? [2, 3] : d.kind === "session_level" ? [1, 3] : d.kind === "key_level" ? [6, 3] : undefined,
          width: d.kind === "structure_break" ? 1.4 : 1, text: d.kind === "liquidity" ? `${d.label} (inferred)` : d.label,
          textSide: d.kind === "structure_break" ? "left" : "right", drawing: d });
      }
    }
  }
  return out;
}

export function planToShapes(plan: TradePlan, t1: number, colors: Record<string, string>, long: boolean): RenderShape[] {
  const s: RenderShape[] = [
    { id: "plan-entry", type: "rect", t1, t2: null, p1: plan.entry_zone[1], p2: plan.entry_zone[0], color: colors.setup, fillAlpha: 0.15, text: "Entry zone" },
    { id: "plan-sl", type: "segment", t1, t2: null, p1: plan.stop_loss, p2: plan.stop_loss, color: colors.bearish, width: 1.5, text: "SL" },
  ];
  plan.take_profits.forEach((tp, i) =>
    s.push({ id: `plan-tp${i}`, type: "segment", t1, t2: null, p1: tp, p2: tp, color: colors.bullish, width: 1.2, dash: i ? [4, 3] : undefined, text: `TP${i + 1} · ${plan.rr[i]}R` }));
  if (!long) s.forEach((x) => { if (x.id.startsWith("plan-tp")) x.color = colors.bullish; });
  return s;
}

class Renderer implements IPrimitivePaneRenderer {
  constructor(private src: DrawingsPrimitive) {}
  draw(target: CanvasRenderingTarget2D) {
    const { chart, series } = this.src;
    if (!chart || !series) return;
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr, bitmapSize }) => {
      const right = bitmapSize.width;
      ctx.font = `${10 * vr}px Inter, ui-sans-serif, system-ui`;
      // label collision avoidance: occupied [x0, x1, y0, y1] boxes in bitmap space
      const taken: [number, number, number, number][] = [];
      const free = (x0: number, x1: number, y0: number, y1: number) =>
        !taken.some(([a, b, c, d]) => x0 < b && x1 > a && y0 < d && y1 > c);
      // draw hovered shape last so it is on top and its label always wins
      const ordered = [...this.src.shapes].sort((a, b) => Number(this.src.hoverId === a.id) - Number(this.src.hoverId === b.id));
      for (const s of ordered) {
        const x1 = this.src.timeToX(s.t1);
        const x2 = s.t2 === null ? null : this.src.timeToX(s.t2);
        const y1 = series.priceToCoordinate(s.p1);
        const y2 = series.priceToCoordinate(s.p2);
        if (x1 === null || y1 === null || y2 === null) continue;
        const X1 = Math.max(0, x1 * hr);
        const X2 = x2 === null ? right : x2 * hr;
        if (X2 < 0) continue;
        const Y1 = y1 * vr, Y2 = y2 * vr;
        ctx.setLineDash((s.dash ?? []).map((d) => d * hr));
        ctx.lineWidth = (s.width ?? 1) * hr;
        ctx.strokeStyle = s.color;
        const hovered = this.src.hoverId === s.id;
        if (s.type === "rect") {
          ctx.fillStyle = hexA(s.color, (s.fillAlpha ?? 0.12) * (hovered ? 2 : 1));
          ctx.fillRect(X1, Math.min(Y1, Y2), X2 - X1, Math.abs(Y2 - Y1));
          ctx.strokeStyle = hexA(s.color, hovered ? 0.9 : 0.45);
          ctx.strokeRect(X1, Math.min(Y1, Y2), X2 - X1, Math.abs(Y2 - Y1));
        } else {
          ctx.globalAlpha = hovered ? 1 : 0.85;
          ctx.beginPath();
          ctx.moveTo(X1, Y1);
          if (x2 === null && s.p1 !== s.p2) {
            // extend sloped line to the right edge
            const slope = (Y2 - Y1) / Math.max(1, X2 - X1);
            ctx.lineTo(right, Y1 + slope * (right - X1));
          } else ctx.lineTo(X2, Y2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (s.text) {
          ctx.setLineDash([]);
          const tw = ctx.measureText(s.text).width;
          const tx = Math.max(2 * hr, s.textSide === "left" ? X1 + 4 * hr : Math.min(X2, right) - tw - 6 * hr);
          const ty = s.type === "rect" ? Math.min(Y1, Y2) + 11 * vr : Y1 - 3 * vr;
          const box: [number, number, number, number] = [tx - 2 * hr, tx + tw + 2 * hr, ty - 10 * vr, ty + 2 * vr];
          if (hovered || free(...box)) {
            taken.push(box);
            ctx.fillStyle = hexA(s.color, hovered ? 1 : 0.9);
            ctx.fillText(s.text, tx, ty);
          }
        }
      }
      ctx.setLineDash([]);
    });
  }
}

class PaneView implements IPrimitivePaneView {
  constructor(private src: DrawingsPrimitive) {}
  zOrder() { return "normal" as const; }
  renderer() { return new Renderer(this.src); }
}

export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType> | null = null;
  shapes: RenderShape[] = [];
  times: number[] = [];
  hoverId: string | null = null;
  private request: (() => void) | null = null;
  private views = [new PaneView(this)];

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart;
    this.series = p.series;
    this.request = p.requestUpdate;
  }
  detached() { this.chart = null; this.series = null; }
  paneViews() { return this.views; }
  updateAllViews() {}

  set(shapes: RenderShape[], times: number[]) {
    this.shapes = shapes;
    this.times = times;
    this.request?.();
  }
  setHover(id: string | null) {
    if (id !== this.hoverId) { this.hoverId = id; this.request?.(); }
  }

  /** Fractional bar index → x coordinate. Works for times between/before loaded bars. */
  timeToX(t: number): number | null {
    const ts = this.times;
    if (!this.chart || ts.length === 0) return null;
    let lo = 0, hi = ts.length - 1;
    if (t <= ts[0]) return this.chart.timeScale().logicalToCoordinate(0 as Logical);
    if (t >= ts[hi]) {
      const step = ts.length > 1 ? ts[hi] - ts[hi - 1] : 1;
      return this.chart.timeScale().logicalToCoordinate((hi + (t - ts[hi]) / step) as Logical);
    }
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
    const frac = (t - ts[lo]) / (ts[hi] - ts[lo]);
    return this.chart.timeScale().logicalToCoordinate((lo + frac) as Logical);
  }

  /** Hit-test in CSS pixels (for tooltips). */
  hit(x: number, y: number): RenderShape | null {
    if (!this.series) return null;
    let best: RenderShape | null = null;
    let bestD = 6;
    for (const s of this.shapes) {
      const x1 = this.timeToX(s.t1) ?? 0;
      const x2 = s.t2 === null ? Infinity : this.timeToX(s.t2) ?? Infinity;
      const y1 = this.series.priceToCoordinate(s.p1);
      const y2 = this.series.priceToCoordinate(s.p2);
      if (y1 === null || y2 === null || x < Math.max(0, x1) - 2 || x > x2 + 2) continue;
      if (s.type === "rect") {
        if (y >= Math.min(y1, y2) && y <= Math.max(y1, y2)) return s;
      } else {
        const xx2 = Number.isFinite(x2) ? x2 : x1 + 1;
        const slope = s.p1 === s.p2 ? 0 : (y2 - y1) / Math.max(1, xx2 - x1);
        const d = Math.abs(y - (y1 + slope * (x - x1)));
        if (d < bestD) { bestD = d; best = s; }
      }
    }
    return best;
  }
}
