"use client";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Input, Stat } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Account, Position } from "@/lib/types";
import { cn, fmtMoney, fmtTime, pnlClass } from "@/lib/utils";

interface Settings { risk: Record<string, number | boolean>; mode: string; kill_switch: boolean; live_gate_missing: string[] }
interface Audit { chain_valid: boolean; entries: { id: number; ts: string; actor: string; action: string; payload: unknown; hash: string }[] }

const FIELDS: [string, string, string][] = [
  ["max_risk_per_trade_pct", "Max risk per trade", "%"], ["max_daily_loss_pct", "Max daily loss", "%"],
  ["max_total_exposure_pct", "Max total exposure", "% of equity"], ["max_leverage", "Max leverage", "×"],
  ["max_open_trades", "Max simultaneous trades", ""], ["max_spread_atr", "Max spread", "× ATR"],
  ["max_slippage_bps", "Max slippage", "bps"], ["stale_price_seconds", "Stale-price limit", "s"],
  ["news_blackout_before_min", "News blackout before", "min"], ["news_blackout_after_min", "News blackout after", "min"],
];

export default function RiskPage() {
  const acct = useApi<Account>("/paper/account", 3000);
  const pos = useApi<Position[]>("/positions?status=open", 3000);
  const st = useApi<Settings>("/settings");
  const audit = useApi<Audit>("/audit?limit=100", 10_000);
  const kill = async (engaged: boolean, flatten = false) => { await api.post("/risk/kill-switch", { engaged, flatten, reason: "Risk dashboard" }); acct.reload(); pos.reload(); audit.reload(); };

  const a = acct.data;
  const risk = st.data?.risk;
  const dailyUsed = a && risk ? Math.max(0, (-a.daily_pnl / a.equity) * 100 / Number(risk.max_daily_loss_pct)) : 0;
  const expUsed = a && risk ? (a.exposure_pct ?? 0) / Number(risk.max_total_exposure_pct) : 0;
  const tradesUsed = a && risk ? a.open_positions / Number(risk.max_open_trades) : 0;

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-[1.2fr_1fr]">
      <div className="space-y-3">
        <Card>
          <CardHeader title="Portfolio risk" right={a?.kill_switch ? <Badge tone="bear">Kill switch engaged</Badge> : <Badge tone="bull">Trading allowed</Badge>} />
          {a && (
            <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-4">
              <Stat label="Equity" value={fmtMoney(a.equity)} /><Stat label="Unrealised" value={fmtMoney(a.unrealized_pnl)} className={pnlClass(a.unrealized_pnl)} />
              <Stat label="Day P&L" value={fmtMoney(a.daily_pnl)} className={pnlClass(a.daily_pnl)} /><Stat label="Exposure" value={fmtMoney(a.exposure)} />
            </div>
          )}
          <div className="space-y-2 px-3 pb-3">
            {[["Daily loss budget used", dailyUsed], ["Exposure limit used", expUsed], ["Trade slots used", tradesUsed]].map(([l, v]) => (
              <div key={l as string}>
                <div className="mb-0.5 flex justify-between text-[11px] text-muted"><span>{l}</span><span>{Math.round((v as number) * 100)}%</span></div>
                <div className="h-1.5 overflow-hidden rounded bg-bg"><div className={cn("h-full", (v as number) > 0.8 ? "bg-bear" : (v as number) > 0.5 ? "bg-warn" : "bg-bull")} style={{ width: `${Math.min(100, (v as number) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line p-3">
            {a?.kill_switch ? <Button variant="outline" onClick={() => kill(false)}>Release kill switch</Button> : <>
              <Button variant="danger" onClick={() => kill(true)}>Engage kill switch</Button>
              <Button variant="bear" onClick={() => confirm("Engage kill switch AND close all open positions at market?") && kill(true, true)}>Kill & flatten all</Button></>}
            {a?.kill_switch_reason && <span className="self-center text-xs text-muted">Reason: {a.kill_switch_reason}</span>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Open positions risk" />
          <table className="w-full text-xs tabular-nums"><thead className="text-[10px] uppercase text-muted"><tr>{["Symbol", "Side", "Qty", "Stop", "Unrealised"].map((h) => <th key={h} className="px-3 py-1 text-left">{h}</th>)}</tr></thead>
            <tbody>{(pos.data ?? []).map((p) => (
              <tr key={p.id} className="border-t border-line/60"><td className="px-3 py-1">{p.symbol}</td><td>{p.side}</td><td>{p.qty}</td>
                <td className={p.stop_loss ? "" : "text-bear"}>{p.stop_loss ?? "NONE"}</td><td className={pnlClass(p.unrealized_pnl)}>{fmtMoney(p.unrealized_pnl)}</td></tr>))}</tbody></table>
        </Card>
        <Card>
          <CardHeader title="Audit log" right={<Badge tone={audit.data?.chain_valid ? "bull" : "bear"}>{audit.data?.chain_valid ? "hash chain valid" : "chain broken"}</Badge>} />
          <div className="max-h-80 overflow-auto font-mono text-[11px]">{audit.data?.entries.map((e) => (
            <div key={e.id} className="border-b border-line/50 px-3 py-1"><span className="text-muted">{fmtTime(e.ts)}</span> <span className="text-accent">{e.action}</span> <span className="text-muted">by {e.actor}</span>
              <div className="truncate text-muted/80" title={JSON.stringify(e.payload)}>{JSON.stringify(e.payload)}</div></div>))}</div>
        </Card>
      </div>
      {st.data ? <RiskLimitsForm key={JSON.stringify(st.data.risk)} initial={st.data.risk} onSaved={() => { st.reload(); audit.reload(); }} /> : <Card className="h-fit p-4 text-xs text-muted">Loading…</Card>}
    </div>
  );
}

function RiskLimitsForm({ initial, onSaved }: { initial: Record<string, number | boolean>; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, typeof v === "boolean" ? v : String(v)])));
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === "boolean" ? v : Number(v)]));
      await api.put("/settings/risk", body); setMsg("Saved."); onSaved();
    } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <Card className="h-fit">
        <CardHeader title="Risk limits (enforced server-side on every order)" />
        <div className="grid grid-cols-2 gap-3 p-3 text-xs">
          {FIELDS.map(([k, label, unit]) => (
            <label key={k} className="space-y-1"><span className="text-muted">{label} {unit && <span className="text-muted/60">({unit})</span>}</span>
              <Input value={String(form[k] ?? "")} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} inputMode="decimal" /></label>))}
          {(["require_stop_loss", "flatten_on_daily_loss"] as const).map((k) => (
            <label key={k} className="col-span-2 flex items-center gap-2"><input type="checkbox" className="accent-sky-400" checked={Boolean(form[k])}
              disabled={k === "require_stop_loss"} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} />
              {k === "require_stop_loss" ? "Mandatory stop-loss (always on)" : "Flatten all positions when the daily loss limit is hit"}</label>))}
        </div>
        <div className="flex items-center gap-2 border-t border-line p-3"><Button onClick={save}>Save limits</Button>{msg && <span className="text-xs text-muted">{msg}</span>}</div>
        <p className="px-3 pb-3 text-[10px] text-muted">Platform ceilings: 5% per trade, 20% daily loss, 50× leverage. Limits apply identically to paper and (future) live execution.</p>
      </Card>
  );
}
