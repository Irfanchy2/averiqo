"use client";
import { AreaSeries, ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";

export function EquityChart({ data, height = 220 }: { data: { time: number; equity: number }[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b95a7", fontSize: 10 },
      grid: { vertLines: { visible: false }, horzLines: { color: "#141a24" } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true },
      handleScroll: false, handleScale: false,
    });
    const up = data.length < 2 || data[data.length - 1].equity >= data[0].equity;
    const s = chart.addSeries(AreaSeries, {
      lineColor: up ? "#22c55e" : "#ef4444", topColor: up ? "#22c55e33" : "#ef444433", bottomColor: "#00000000", lineWidth: 2,
      priceLineVisible: false,
    });
    const seen = new Set<number>();
    s.setData(data.filter((d) => (seen.has(d.time) ? false : (seen.add(d.time), true))).map((d) => ({ time: d.time as UTCTimestamp, value: d.equity })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data]);
  return <div ref={ref} style={{ height }} className="w-full" />;
}
