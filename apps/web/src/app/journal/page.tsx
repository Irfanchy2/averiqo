"use client";
import { useState } from "react";
import { EquityChart } from "@/components/chart/equity-chart";
import { Button, Card, CardHeader, Empty, Stat } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Position } from "@/lib/types";
import { cn, fmtMoney, fmtPct, fmtPrice, fmtTime, pnlClass } from "@/lib/utils";

interface Journal {
  trades: Position[];
  stats: { trades: number; net: number; win_rate: number | null; profit_factor: number | null; avg_win: number | null; avg_loss: number | null };
  equity_curve: { time: number; equity: number }[];
  by_symbol: Record<string, { trades: number; net: number; wins: number }>;
}

export default function JournalPage() {
  const { data, reload } = useApi<Journal>("/journal", 10_000);
  const [sel, setSel] = useState<Position | null>(null);
  const [note, setNote] = useState("");
  const save = async () => { if (!sel) return; await api.patch(`/journal/${sel.id}`, { notes: note }); reload(); };
  if (!data) return <Empty>Loading journal…</Empty>;
  const s = data.stats;
  return (
    <div className="grid gap-3 p-3 xl:grid-cols-[2fr_1fr]">
      <div className="space-y-3">
        <Card>
          <CardHeader title="Trade analytics (paper)" />
          <div className="grid grid-cols-3 gap-3 p-3 md:grid-cols-6">
            <Stat label="Closed trades" value={s.trades} /><Stat label="Net P&L" value={fmtMoney(s.net)} className={pnlClass(s.net)} />
            <Stat label="Win rate" value={fmtPct(s.win_rate)} /><Stat label="Profit factor" value={s.profit_factor ?? "—"} />
            <Stat label="Avg win" value={fmtMoney(s.avg_win)} className="text-bull" /><Stat label="Avg loss" value={fmtMoney(s.avg_loss)} className="text-bear" />
          </div>
          {data.equity_curve.length > 1 ? <div className="p-2"><EquityChart data={data.equity_curve} /></div> : <Empty>Close a few paper trades to see the equity curve.</Empty>}
        </Card>
        <Card>
          <CardHeader title="Trades" />
          {data.trades.length === 0 ? <Empty>No closed trades yet.</Empty> : (
            <div className="max-h-[480px] overflow-auto"><table className="w-full text-xs tabular-nums">
              <thead className="sticky top-0 bg-panel text-[10px] uppercase text-muted"><tr>{["Closed", "Symbol", "Side", "Qty", "Entry", "Exit", "Reason", "R", "P&L", "Setup"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>{data.trades.map((p) => (
                <tr key={p.id} onClick={() => { setSel(p); setNote(p.notes ?? ""); }} className={cn("cursor-pointer border-t border-line/60 hover:bg-panel-2", sel?.id === p.id && "bg-panel-2")}>
                  <td className="px-2 py-1">{fmtTime(p.closed_at)}</td><td>{p.symbol}</td><td className={p.side === "long" ? "text-bull" : "text-bear"}>{p.side}</td><td>{p.qty}</td>
                  <td>{fmtPrice(p.entry_price)}</td><td>{fmtPrice(p.exit_price)}</td><td>{p.close_reason}</td><td className={pnlClass(p.r_multiple)}>{p.r_multiple ?? "—"}</td>
                  <td className={cn("font-semibold", pnlClass(p.realized_pnl))}>{fmtMoney(p.realized_pnl)}</td><td className="text-muted">{p.setup?.status ?? "manual"}</td></tr>))}</tbody>
            </table></div>)}
        </Card>
      </div>
      <div className="space-y-3">
        <Card>
          <CardHeader title="By symbol" />
          <div className="divide-y divide-line/60 text-xs">{Object.entries(data.by_symbol).map(([k, v]) => (
            <div key={k} className="flex justify-between px-3 py-1.5"><span>{k}</span><span className="text-muted">{v.trades} trades · {fmtPct(v.wins / v.trades, 0)} win</span><span className={pnlClass(v.net)}>{fmtMoney(v.net)}</span></div>))}</div>
        </Card>
        <Card>
          <CardHeader title={sel ? `Trade #${sel.id} review` : "Trade review"} />
          {!sel ? <Empty>Select a trade to review its setup and add notes.</Empty> : (
            <div className="space-y-2 p-3 text-xs">
              <div>{sel.side} {sel.qty} {sel.symbol} · {fmtPrice(sel.entry_price)} → {fmtPrice(sel.exit_price)} · fees {fmtMoney(sel.fees)}</div>
              {sel.setup ? (
                <div className="rounded border border-line p-2">
                  <div className="mb-1 text-[10px] uppercase text-muted">Engine state at entry</div>
                  <div>Status {sel.setup.status} · quality {sel.setup.quality}</div>
                  {(sel.setup.reasons_against ?? []).slice(0, 6).map((r, i) => <div key={i} className="text-bear/90">• {r}</div>)}
                </div>
              ) : <div className="text-muted">Manual trade — no engine setup attached.</div>}
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="What did you learn from this trade?"
                className="w-full rounded-md border border-line bg-bg p-2 focus:border-accent focus:outline-none" />
              <Button size="sm" onClick={save}>Save note</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
