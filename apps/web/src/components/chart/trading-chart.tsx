"use client";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, qs } from "@/lib/api";
import { useMarketStream } from "@/lib/hooks";
import type { Analysis, Candle, Drawing, Setup } from "@/lib/types";
import { cn, fmtPrice } from "@/lib/utils";
import { DrawingTooltip } from "./drawing-tooltip";
import { DrawingsPrimitive, drawingsToShapes, planToShapes, type RenderShape } from "./drawings-primitive";

interface Props {
  symbol: string;
  tf: string;
  analysis: Analysis | null;
  setup?: Setup | null;
  visible: string[];
  colors: Record<string, string>;
  overlays: { ema: boolean; vwap: boolean; setup: boolean };
  onBarClosed?: () => void;
  compact?: boolean;
  className?: string;
}

function ema(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  if (values.length < n) return out;
  const a = 2 / (n + 1);
  let prev = values.slice(0, n).reduce((s, v) => s + v, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i++) { prev = a * values[i] + (1 - a) * prev; out[i] = prev; }
  return out;
}

function vwap(c: Candle[]): (number | null)[] {
  let pv = 0, vv = 0, day = -1;
  return c.map((b) => {
    const d = Math.floor(b.time / 86400);
    if (d !== day) { pv = 0; vv = 0; day = d; }
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume; vv += b.volume;
    return vv ? pv / vv : tp;
  });
}

export function TradingChart({ symbol, tf, analysis, setup, visible, colors, overlays, onBarClosed, compact, className }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const emaRefs = useRef<ISeriesApi<"Line">[]>([]);
  const vwapRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const primRef = useRef<DrawingsPrimitive | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [last, setLast] = useState<Candle | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; d: Drawing } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ---- create chart once
  useEffect(() => {
    const el = box.current!;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0d1117" }, textColor: "#8b95a7", fontSize: 11,
        fontFamily: "Inter, ui-sans-serif, system-ui", attributionLogo: true },
      grid: { vertLines: { color: "#141a24" }, horzLines: { color: "#141a24" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1f2633" },
      timeScale: { borderColor: "#1f2633", timeVisible: true, secondsVisible: false, rightOffset: 8 },
    });
    const cs = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", color: "#1e293b" });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    emaRefs.current = [
      chart.addSeries(LineSeries, { color: "#38bdf8", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }),
      chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }),
      chart.addSeries(LineSeries, { color: "#e879f9", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }),
    ];
    vwapRef.current = chart.addSeries(LineSeries, { color: "#a3e635", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const prim = new DrawingsPrimitive();
    cs.attachPrimitive(prim);
    markersRef.current = createSeriesMarkers(cs, []);
    chart.subscribeCrosshairMove((p) => {
      if (!p.point) { setTip(null); prim.setHover(null); return; }
      const hit = prim.hit(p.point.x, p.point.y);
      prim.setHover(hit?.id ?? null);
      setTip(hit?.drawing ? { x: Math.max(4, Math.min(p.point.x + 14, el.clientWidth - 300)), y: Math.max(4, p.point.y - 10), d: hit.drawing } : null);
    });
    chartRef.current = chart; candleRef.current = cs; volRef.current = vol; primRef.current = prim;
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  // ---- load candles on symbol/tf change
  useEffect(() => {
    let alive = true;
    api.get<{ candles: Candle[] }>(`/candles${qs({ symbol, tf, limit: 600 })}`)
      .then((r) => { if (alive) { setErr(null); setCandles(r.candles); setLast(r.candles.at(-1) ?? null); chartRef.current?.timeScale().scrollToRealTime(); } })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [symbol, tf]);

  useEffect(() => {
    if (!candleRef.current) return;
    candleRef.current.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
    volRef.current?.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? "#14532d88" : "#7f1d1d88" })));
  }, [candles]);

  // ---- overlays (EMA / VWAP) computed client-side from the same candles
  useEffect(() => {
    const closes = candles.map((c) => c.close);
    [21, 50, 200].forEach((n, i) => {
      const s = emaRefs.current[i];
      if (!s) return;
      const v = overlays.ema ? ema(closes, n) : [];
      s.setData(v.flatMap((x, j) => (x === null ? [] : [{ time: candles[j].time as UTCTimestamp, value: x }])));
    });
    const vw = overlays.vwap && !["4h", "1D"].includes(tf) ? vwap(candles) : [];
    vwapRef.current?.setData(vw.flatMap((x, j) => (x === null ? [] : [{ time: candles[j].time as UTCTimestamp, value: x }])));
  }, [candles, overlays.ema, overlays.vwap, tf]);

  // ---- live updates
  const connected = useMarketStream(symbol, tf, (m) => {
    const b = m.bar;
    candleRef.current?.update({ ...b, time: b.time as UTCTimestamp });
    volRef.current?.update({ time: b.time as UTCTimestamp, value: b.volume, color: b.close >= b.open ? "#14532d88" : "#7f1d1d88" });
    setLast(b);
    if (primRef.current && primRef.current.times.at(-1) !== undefined && b.time > primRef.current.times.at(-1)!) {
      primRef.current.times = [...primRef.current.times, b.time];
    }
  }, onBarClosed);

  // ---- drawings + markers
  const visibleSet = useMemo(() => new Set(visible), [visible]);
  useEffect(() => {
    const prim = primRef.current;
    if (!prim || !candles.length) return;
    const d = analysis && analysis.symbol === symbol && analysis.timeframe === tf ? analysis.drawings : [];
    let shapes: RenderShape[] = drawingsToShapes(d, colors, visibleSet);
    if (overlays.setup && setup?.plan && setup.symbol === symbol && setup.timeframe === tf &&
        ["bullish_setup", "bearish_setup", "wait_for_confirmation"].includes(setup.status)) {
      shapes = shapes.concat(planToShapes(setup.plan, candles[Math.max(0, candles.length - 12)].time, colors, setup.direction === "long"));
    }
    prim.set(shapes, candles.map((c) => c.time));
    const markers: SeriesMarker<Time>[] = [];
    if (visibleSet.has("swing")) {
      for (const s of d.filter((x) => x.kind === "swing")) {
        markers.push({ time: s.time_start as UTCTimestamp, position: s.position === "above" ? "aboveBar" : "belowBar",
          shape: "circle", size: 0.4, color: s.direction === "bullish" ? colors.bullish : colors.bearish, text: s.label });
      }
    }
    if (visibleSet.has("liquidity_sweep")) {
      for (const s of d.filter((x) => x.kind === "liquidity_sweep" && x.time_end)) {
        markers.push({ time: s.time_end as UTCTimestamp, position: s.direction === "bullish" ? "belowBar" : "aboveBar",
          shape: s.direction === "bullish" ? "arrowUp" : "arrowDown", color: colors.liquidity_sweep, text: "Sweep" });
      }
    }
    if (visibleSet.has("structure_break")) {
      for (const s of d.filter((x) => x.kind === "structure_break" && x.time_end)) {
        markers.push({ time: s.time_end as UTCTimestamp, position: s.direction === "bullish" ? "aboveBar" : "belowBar",
          shape: "square", size: 0.3, color: colors.structure_break, text: s.label });
      }
    }
    const times = new Set(candles.map((c) => c.time));
    markersRef.current?.setMarkers(markers.filter((m) => times.has(m.time as number)).sort((a, b) => (a.time as number) - (b.time as number)));
  }, [analysis, setup, candles, colors, visibleSet, overlays.setup, symbol, tf]);

  const chg = last && candles.length > 1 ? (last.close / candles[Math.max(0, candles.length - 25)].close - 1) * 100 : 0;

  return (
    <div className={cn("relative h-full min-h-[280px] w-full", className)}>
      <div ref={box} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-2 top-1.5 z-10 flex items-center gap-2 text-xs">
        <span className="font-semibold">{symbol}</span>
        <span className="text-muted">{tf}</span>
        {last && (
          <span className="hidden tabular-nums text-muted sm:inline">
            O <span className="text-fg">{fmtPrice(last.open)}</span> H <span className="text-fg">{fmtPrice(last.high)}</span>{" "}
            L <span className="text-fg">{fmtPrice(last.low)}</span> C <span className={chg >= 0 ? "text-bull" : "text-bear"}>{fmtPrice(last.close)}</span>
          </span>
        )}
        <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-bull" : "bg-bear")} title={connected ? "Live stream connected" : "Stream disconnected"} />
      </div>
      {!compact && overlays.ema && (
        <div className="pointer-events-none absolute left-2 top-6 z-10 flex gap-2 text-[10px]">
          <span className="text-sky-400">EMA21</span><span className="text-amber-500">EMA50</span><span className="text-fuchsia-400">EMA200</span>
          {overlays.vwap && <span className="text-lime-400">VWAP</span>}
        </div>
      )}
      {err && <div className="absolute inset-0 z-20 grid place-items-center bg-panel/80 p-4 text-center text-xs text-bear">{err}</div>}
      {tip && <DrawingTooltip d={tip.d} x={tip.x} y={tip.y} />}
    </div>
  );
}
