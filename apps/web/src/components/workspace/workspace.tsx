"use client";
import { LayoutGrid, Square, Columns2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { qs } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useWorkspace } from "@/lib/store";
import { TIMEFRAMES, type Analysis, type Setup, type Timeframe } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TradingChart } from "../chart/trading-chart";
import { Tabs } from "../ui/primitives";
import { AssistantPanel } from "./assistant-panel";
import { DrawingsPanel } from "./drawings-panel";
import { MtfStrip } from "./mtf-strip";
import { OrderTicket, type TicketPrefill } from "./order-ticket";
import { PositionsPanel } from "./positions-panel";
import { SetupPanel } from "./setup-panel";
import { Watchlist } from "./watchlist";

const HTF: Record<string, Timeframe> = { "1m": "15m", "3m": "30m", "5m": "1h", "15m": "4h", "30m": "4h", "1h": "4h", "4h": "1D", "1D": "1D" };

function ChartCell({ symbol, tf, setup, main }: { symbol: string; tf: string; setup?: Setup | null; main?: boolean }) {
  const { ws } = useWorkspace();
  const a = useApi<Analysis>(`/analysis${qs({ symbol, tf })}`);
  return (
    <div className="relative min-h-0 overflow-hidden rounded-md border border-line">
      <TradingChart symbol={symbol} tf={tf} analysis={a.data} setup={main ? setup : null} visible={ws.visible} colors={ws.colors}
        overlays={ws.overlays} onBarClosed={a.reload} compact={!main} />
      {a.data && (
        <div className="pointer-events-none absolute bottom-7 left-2 z-10 rounded bg-panel/80 px-1.5 py-0.5 text-[10px] text-muted">
          structure <span className={a.data.trend === "bullish" ? "text-bull" : a.data.trend === "bearish" ? "text-bear" : ""}>{a.data.trend}</span>
          {" · "}{a.data.drawings.length} drawings
        </div>
      )}
    </div>
  );
}

export function Workspace() {
  const { ws, set } = useWorkspace();
  const [panel, setPanel] = useState<"setup" | "drawings" | "ai" | "ticket">("setup");
  const [prefill, setPrefill] = useState<TicketPrefill | null>(null);
  const [refresh, setRefresh] = useState(0);
  const setupQ = useApi<Setup>(`/setup${qs({ symbol: ws.symbol, tf: ws.tf })}`, 30_000);
  const analysisQ = useApi<Analysis>(`/analysis${qs({ symbol: ws.symbol, tf: ws.tf })}`, 60_000);
  const searchRef = useRef<HTMLInputElement>(null);
  const askRef = useRef<HTMLInputElement>(null);
  const symbols = ["BTCUSDT", "ETHUSDT", "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "USOIL"];

  const openTicket = useCallback((side: "buy" | "sell", setup?: Setup | null) => {
    setPrefill({ side, setup, nonce: Date.now() });
    setPanel("ticket");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.altKey || e.metaKey || e.ctrlKey) return;
      if (/^[1-8]$/.test(e.key)) set({ tf: TIMEFRAMES[Number(e.key) - 1] });
      else if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "[" || e.key === "]") {
        const i = symbols.indexOf(ws.symbol);
        set({ symbol: symbols[(i + (e.key === "]" ? 1 : symbols.length - 1)) % symbols.length] });
      } else if (e.key.toLowerCase() === "l") set({ layout: ws.layout === 1 ? 2 : ws.layout === 2 ? 4 : 1 });
      else if (e.key.toLowerCase() === "d") set({ visible: ws.visible.length ? [] : ["swing", "structure_break", "order_block", "fvg", "sr_zone", "liquidity", "liquidity_sweep", "trendline", "key_level"] });
      else if (e.key.toLowerCase() === "b") openTicket("buy");
      else if (e.key.toLowerCase() === "s") openTicket("sell");
      else if (e.key.toLowerCase() === "a") { e.preventDefault(); setPanel("ai"); setTimeout(() => askRef.current?.focus(), 50); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const cells: { tf: string; main?: boolean }[] =
    ws.layout === 1 ? [{ tf: ws.tf, main: true }] :
    ws.layout === 2 ? [{ tf: ws.tf, main: true }, { tf: HTF[ws.tf] === ws.tf ? "4h" : HTF[ws.tf] }] :
    [{ tf: ws.tf, main: true }, ...["15m", "1h", "4h", "1D"].filter((t) => t !== ws.tf).slice(0, 3).map((tf) => ({ tf }))];

  return (
    <div className="grid grid-cols-1 gap-2 p-2 lg:h-full lg:min-h-[640px] lg:grid-cols-[200px_minmax(0,1fr)_340px]">
      <aside className="hidden overflow-hidden rounded-lg border border-line bg-panel lg:block">
        <Watchlist symbol={ws.symbol} tf={ws.tf} onSelect={(s) => set({ symbol: s })} searchRef={searchRef} />
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1.5">
          <select value={ws.symbol} onChange={(e) => set({ symbol: e.target.value })} className="h-7 rounded border border-line bg-bg px-1.5 text-xs font-semibold lg:hidden">
            {symbols.map((s) => <option key={s}>{s}</option>)}
          </select>
          <div className="flex gap-0.5 rounded-md bg-bg p-0.5">
            {TIMEFRAMES.map((t, i) => (
              <button key={t} onClick={() => set({ tf: t })} title={`Timeframe ${t} (${i + 1})`}
                className={cn("rounded px-2 py-0.5 text-[11px] font-medium", ws.tf === t ? "bg-panel-2 text-accent" : "text-muted hover:text-fg")}>{t}</button>
            ))}
          </div>
          <div className="flex gap-0.5 rounded-md bg-bg p-0.5">
            {([1, 2, 4] as const).map((l) => (
              <button key={l} onClick={() => set({ layout: l })} title={`${l} chart layout (L)`}
                className={cn("grid h-6 w-6 place-items-center rounded", ws.layout === l ? "bg-panel-2 text-accent" : "text-muted hover:text-fg")}>
                {l === 1 ? <Square className="h-3.5 w-3.5" /> : l === 2 ? <Columns2 className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            {(["ema", "vwap", "setup"] as const).map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-1">
                <input type="checkbox" checked={ws.overlays[k]} onChange={(e) => set({ overlays: { ...ws.overlays, [k]: e.target.checked } })} className="accent-sky-400" />
                {k === "ema" ? "EMA 21/50/200" : k === "vwap" ? "VWAP" : "Trade plan"}
              </label>
            ))}
          </div>
          <div className="ml-auto hidden xl:block"><MtfStrip symbol={ws.symbol} active={ws.tf} onPick={(t) => set({ tf: t as Timeframe })} /></div>
        </div>

        <div className={cn("grid auto-rows-[55vh] gap-2 lg:min-h-[360px] lg:flex-1 lg:auto-rows-auto", ws.layout === 1 && "grid-cols-1", ws.layout === 2 && "grid-cols-1 md:grid-cols-2", ws.layout === 4 && "grid-cols-1 md:grid-cols-2 md:grid-rows-2")}>
          {cells.map((c) => <ChartCell key={`${ws.symbol}-${c.tf}-${c.main}`} symbol={ws.symbol} tf={c.tf} setup={setupQ.data} main={c.main} />)}
        </div>

        <div className="h-44 shrink-0 overflow-hidden rounded-lg border border-line bg-panel">
          <PositionsPanel refreshKey={refresh} />
        </div>
      </section>

      <aside className="flex h-[80vh] flex-col overflow-hidden rounded-lg border border-line bg-panel lg:h-auto lg:min-h-[520px]">
        <div className="border-b border-line p-1.5">
          <Tabs value={panel} onChange={setPanel} className="w-full" items={[
            { value: "setup", label: "Setup" }, { value: "drawings", label: "Drawings" }, { value: "ai", label: "AI Assistant" }, { value: "ticket", label: "Order" }]} />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {panel === "setup" && <SetupPanel setup={setupQ.data} error={setupQ.error} onTrade={(s) => openTicket(s.direction === "long" ? "buy" : "sell", s)} />}
          {panel === "drawings" && <DrawingsPanel analysis={analysisQ.data} />}
          {panel === "ai" && <AssistantPanel inputRef={askRef} />}
          {panel === "ticket" && <OrderTicket key={`${ws.symbol}-${prefill?.nonce ?? 0}`} symbol={ws.symbol} tf={ws.tf} prefill={prefill} onPlaced={() => setRefresh((r) => r + 1)} />}
        </div>
      </aside>
    </div>
  );
}
