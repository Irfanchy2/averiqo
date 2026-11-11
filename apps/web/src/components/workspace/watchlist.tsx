"use client";
import { useEffect, useRef, useState } from "react";
import { api, qs } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Instrument } from "@/lib/types";
import { cn, fmtPrice } from "@/lib/utils";
import { CardHeader } from "../ui/primitives";

interface ScanRow { symbol: string; status: string; direction: string | null; quality: number; price: number }
const STATUS: Record<string, { t: string; c: string }> = {
  bullish_setup: { t: "BULL SETUP", c: "text-bull" }, bearish_setup: { t: "BEAR SETUP", c: "text-bear" },
  wait_for_confirmation: { t: "WAIT", c: "text-warn" }, neutral: { t: "NEUTRAL", c: "text-muted" },
  no_trade: { t: "NO TRADE", c: "text-muted" }, data_unavailable: { t: "NO DATA", c: "text-bear" },
};

export function Watchlist({ symbol, tf, onSelect, searchRef }: { symbol: string; tf: string; onSelect: (s: string) => void; searchRef?: React.RefObject<HTMLInputElement | null> }) {
  const { data: instruments } = useApi<Instrument[]>("/instruments");
  const [scan, setScan] = useState<Record<string, ScanRow>>({});
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const prev = useRef<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    const run = () => api.get<ScanRow[]>(`/scan${qs({ tf })}`).then((rows) => {
      if (!alive) return;
      const m: Record<string, ScanRow> = {};
      for (const r of rows) {
        m[r.symbol] = r;
        const was = prev.current[`${r.symbol}${tf}`];
        if (was && was !== r.status && (r.status === "bullish_setup" || r.status === "bearish_setup")) {
          window.dispatchEvent(new CustomEvent("tp-notification", { detail: {
            title: `${r.symbol} ${tf}: ${STATUS[r.status].t}`, body: `Quality ${r.quality}. Open the setup panel for the full plan.`,
            level: r.status === "bullish_setup" ? "bull" : "bear" } }));
        }
        prev.current[`${r.symbol}${tf}`] = r.status;
      }
      setScan(m);
    }).catch(() => {});
    run();
    const id = setInterval(run, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [tf]);

  useEffect(() => {
    if (!instruments) return;
    let alive = true;
    const run = () => Promise.all(instruments.map((i) => api.get<{ mid: number }>(`/quote${qs({ symbol: i.symbol })}`).then((r) => [i.symbol, r.mid] as const).catch(() => [i.symbol, NaN] as const)))
      .then((rows) => alive && setQuotes(Object.fromEntries(rows)));
    run();
    const id = setInterval(run, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [instruments]);

  const list = (instruments ?? []).filter((i) => !q || i.symbol.includes(q.toUpperCase()) || i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex h-full flex-col">
      <CardHeader title="Watchlist" right={<span className="text-[10px] text-muted">scan {tf}</span>} />
      <div className="p-2">
        <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search  ( / )"
          onKeyDown={(e) => { if (e.key === "Enter" && list[0]) { onSelect(list[0].symbol); setQ(""); (e.target as HTMLInputElement).blur(); } }}
          className="h-7 w-full rounded border border-line bg-bg px-2 text-xs focus:border-accent focus:outline-none" />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {list.map((i) => {
          const s = scan[i.symbol];
          return (
            <button key={i.symbol} onClick={() => onSelect(i.symbol)}
              className={cn("flex w-full items-center justify-between border-l-2 border-transparent px-3 py-2 text-left hover:bg-panel-2",
                i.symbol === symbol && "border-accent bg-panel-2")}>
              <div className="min-w-0">
                <div className="text-xs font-semibold">{i.symbol}</div>
                <div className="truncate text-[10px] text-muted">{i.name}</div>
              </div>
              <div className="text-right">
                <div className="text-xs tabular-nums">{fmtPrice(quotes[i.symbol])}</div>
                {s && <div className={cn("text-[9px] font-semibold", STATUS[s.status]?.c)}>{STATUS[s.status]?.t}{s.quality ? ` · Q${s.quality}` : ""}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
