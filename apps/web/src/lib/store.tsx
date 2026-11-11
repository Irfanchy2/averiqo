"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Timeframe } from "./types";

export const DRAWING_KINDS: { kind: string; label: string }[] = [
  { kind: "swing", label: "HH / HL / LH / LL" },
  { kind: "structure_break", label: "BOS / CHoCH" },
  { kind: "order_block", label: "Order blocks" },
  { kind: "fvg", label: "Fair value gaps" },
  { kind: "demand", label: "Demand zones" },
  { kind: "supply", label: "Supply zones" },
  { kind: "sr_zone", label: "Support / resistance" },
  { kind: "liquidity", label: "BSL / SSL (inferred)" },
  { kind: "liquidity_sweep", label: "Liquidity sweeps" },
  { kind: "breakout", label: "Breakouts" },
  { kind: "trendline", label: "Trendlines" },
  { kind: "channel", label: "Channels" },
  { kind: "fibonacci", label: "Fibonacci" },
  { kind: "key_level", label: "PDH / PDL / PWH / PWL" },
  { kind: "session_level", label: "Session highs / lows" },
];

export const DEFAULT_COLORS: Record<string, string> = {
  bullish: "#22c55e",
  bearish: "#ef4444",
  swing: "#94a3b8",
  structure_break: "#eab308",
  order_block: "#3b82f6",
  fvg: "#a855f7",
  demand: "#14b8a6",
  supply: "#f97316",
  sr_zone: "#64748b",
  liquidity: "#06b6d4",
  liquidity_sweep: "#f472b6",
  breakout: "#facc15",
  trendline: "#60a5fa",
  channel: "#334155",
  fibonacci: "#c084fc",
  key_level: "#f59e0b",
  session_level: "#475569",
  setup: "#38bdf8",
};

const DEFAULT_VISIBLE = ["swing", "structure_break", "order_block", "fvg", "sr_zone", "liquidity", "liquidity_sweep", "trendline", "key_level"];

export interface Workspace {
  symbol: string;
  tf: Timeframe;
  layout: 1 | 2 | 4;
  language: "en" | "bn";
  visible: string[];
  colors: Record<string, string>;
  overlays: { ema: boolean; vwap: boolean; setup: boolean };
}

const DEFAULT: Workspace = {
  symbol: "BTCUSDT",
  tf: "1h",
  layout: 1,
  language: "en",
  visible: DEFAULT_VISIBLE,
  colors: DEFAULT_COLORS,
  overlays: { ema: true, vwap: false, setup: true },
};

const Ctx = createContext<{ ws: Workspace; set: (p: Partial<Workspace>) => void } | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [ws, setWs] = useState<Workspace>(DEFAULT);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tp.workspace");
      // Only UI preferences are persisted locally — never credentials or tokens.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage after mount (SSR-safe)
      if (raw) setWs({ ...DEFAULT, ...JSON.parse(raw), colors: { ...DEFAULT_COLORS, ...(JSON.parse(raw).colors ?? {}) } });
    } catch {}
  }, []);
  const value = useMemo(
    () => ({
      ws,
      set: (p: Partial<Workspace>) =>
        setWs((prev) => {
          const next = { ...prev, ...p };
          localStorage.setItem("tp.workspace", JSON.stringify(next));
          return next;
        }),
    }),
    [ws],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWorkspace outside provider");
  return c;
}
