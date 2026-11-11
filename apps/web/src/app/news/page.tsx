"use client";
import { useState } from "react";
import { Badge, Card, CardHeader, Empty, Select } from "@/components/ui/primitives";
import { useApi } from "@/lib/hooks";
import type { NewsEvent } from "@/lib/types";
import { cn, fmtTime } from "@/lib/utils";

interface Cal { provider: string; now: number; is_simulated: boolean; disclaimer: string; events: NewsEvent[] }
interface Blackout { active: boolean; reason?: string; until?: number; next_event?: NewsEvent | null }

export default function NewsPage() {
  const [sym, setSym] = useState("");
  const cal = useApi<Cal>(`/news/calendar?hours_back=24&hours_ahead=336${sym ? `&symbol=${sym}` : ""}`, 60_000);
  const bo = useApi<Blackout>(`/news/blackout?symbol=${sym || "XAUUSD"}`, 30_000);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="grid gap-3 p-3 xl:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader title="Economic calendar & event timeline" right={
          <Select value={sym} onChange={(e) => setSym(e.target.value)}><option value="">All instruments</option>
            {["BTCUSDT", "XAUUSD", "USOIL", "EURUSD", "GBPUSD", "USDJPY"].map((s) => <option key={s}>{s}</option>)}</Select>} />
        {cal.data?.is_simulated && <div className="border-b border-warn/30 bg-warn/5 px-3 py-2 text-[11px] text-warn">{cal.data.disclaimer}</div>}
        {!cal.data ? <Empty>Loading…</Empty> : cal.data.events.length === 0 ? <Empty>No events in range.</Empty> : (
          <div className="relative">
            {cal.data.events.map((e) => {
              const past = e.time < cal.data!.now;
              return (
                <div key={e.id} className={cn("border-b border-line/60 px-3 py-2 text-xs", past && "opacity-50")}>
                  <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
                    <span className="w-36 shrink-0 tabular-nums text-muted">{fmtTime(e.time)}</span>
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", e.importance === "high" ? "bg-bear" : e.importance === "medium" ? "bg-warn" : "bg-muted")} title={`${e.importance} impact`} />
                    <span className="flex-1 font-medium">{e.title}</span>
                    <span className="hidden gap-1 sm:flex">{e.currency_tags.map((t) => <Badge key={t}>{t}</Badge>)}</span>
                  </button>
                  {open === e.id && (
                    <div className="mt-2 grid gap-2 pl-[9.75rem] md:grid-cols-2">
                      {Object.entries(e.impact ?? {}).map(([k, v]) => <div key={k}><div className="text-[10px] font-semibold uppercase text-muted">{k}</div><div className="text-[11px]">{v}</div></div>)}
                      <div className="text-[10px] text-muted md:col-span-2">Source: {e.source} · Actual/forecast: {e.actual ?? "not available from this source"}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <div className="space-y-3">
        <Card>
          <CardHeader title={`Automated-entry blackout · ${sym || "XAUUSD"}`} />
          <div className="p-3 text-xs">
            {bo.data?.active ? (<><Badge tone="bear">Blackout active</Badge><p className="mt-2">{bo.data.reason}</p><p className="text-muted">New automated entries blocked until {fmtTime(bo.data.until)}.</p></>)
              : (<><Badge tone="bull">No blackout</Badge>{bo.data?.next_event && <p className="mt-2 text-muted">Next high-impact: {bo.data.next_event.title} at {fmtTime(bo.data.next_event.time)}</p>}</>)}
          </div>
        </Card>
        <Card>
          <CardHeader title="Data licensing" />
          <div className="space-y-2 p-3 text-[11px] text-muted">
            <p>No live news or calendar feed is configured. TradePilot never fabricates headlines, figures or prices.</p>
            <p>To enable real-time coverage, connect a licensed provider (economic calendar, central-bank feeds, crypto incident feeds) in the backend by implementing <code className="text-fg">CalendarProvider</code>. See <code className="text-fg">docs/DATA_LICENSING.md</code>.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
