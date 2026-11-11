"use client";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface Row { timeframe: string; trend: string; ema_alignment: string | null; rsi: number | null; last_break: { kind: string; direction: string } | null }

export function MtfStrip({ symbol, onPick, active }: { symbol: string; onPick: (tf: string) => void; active: string }) {
  const { data } = useApi<Row[]>(`/mtf?symbol=${symbol}`, 60_000);
  return (
    <div className="flex gap-1 overflow-x-auto">
      {(data ?? []).map((r) => (
        <button key={r.timeframe} onClick={() => onPick(r.timeframe)} title={`Structure ${r.trend} · EMA ${r.ema_alignment ?? "n/a"} · RSI ${r.rsi ?? "n/a"}${r.last_break ? ` · last ${r.last_break.kind} ${r.last_break.direction}` : ""}`}
          className={cn("flex min-w-[54px] flex-col items-center rounded border px-1.5 py-0.5 text-[10px]",
            active === r.timeframe ? "border-accent" : "border-line hover:border-muted")}>
          <span className="font-semibold">{r.timeframe}</span>
          <span className={cn(r.trend === "bullish" ? "text-bull" : r.trend === "bearish" ? "text-bear" : "text-muted")}>
            {r.trend === "bullish" ? "▲ bull" : r.trend === "bearish" ? "▼ bear" : "— n/a"}
          </span>
        </button>
      ))}
    </div>
  );
}
