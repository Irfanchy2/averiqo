"use client";
import { useState } from "react";
import { EquityChart } from "@/components/chart/equity-chart";
import { Badge, Button, Card, CardHeader, Empty, Input, Select, Stat } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { TIMEFRAMES } from "@/lib/types";
import { cn, fmtMoney, fmtPct, fmtPrice, fmtTime, pnlClass } from "@/lib/utils";

type Metrics = Record<string, number | boolean | string | null>;
interface Result {
  metrics: Metrics; trades: Record<string, unknown>[]; equity_curve: { time: number; equity: number }[];
  by_regime: Record<string, { trades: number; win_rate: number; expectancy_r: number; net: number }>;
  calibration: { quality_range: number[]; trades: number; win_rate: number | null; expectancy_r: number | null }[];
  limitations: string[]; signals: number; period: { start: number; end: number; bars: number };
  out_of_sample?: { split_time: number; in_sample: Metrics; out_of_sample: Metrics };
  walk_forward?: { folds: { fold: number; oos_start: number; oos_end: number; chosen_params: Record<string, number>; is_expectancy_r: number | null; oos: Metrics }[]; oos_expectancy_r: number | null; oos_total_trades: number; oos_win_rate: number | null };
}

const M = (m: Metrics) => [
  ["Trades", m.trades], ["Net profit", fmtMoney(m.net_profit as number)], ["Return", `${m.return_pct}%`],
  ["Win rate", fmtPct(m.win_rate as number)], ["Profit factor", m.profit_factor ?? "—"], ["Expectancy", `${fmtMoney(m.expectancy as number)} (${m.expectancy_r ?? "—"}R)`],
  ["Max drawdown", `${m.max_drawdown_pct}%`], ["Max consec. losses", m.max_consecutive_losses], ["Sharpe (daily)", m.sharpe ?? "—"], ["Fees paid", fmtMoney(m.total_fees as number)],
] as const;

export default function BacktestPage() {
  const [form, setForm] = useState({ symbol: "BTCUSDT", timeframe: "1h", bars: 2000, mode: "walk_forward", risk_pct: 1, min_rr: 1.5, sl_buffer_atr: 0.25, min_confirmations: 2 });
  const [res, setRes] = useState<Result | null>(null);
  const [cmp, setCmp] = useState<Record<string, { params: object; metrics: Metrics; by_regime: Result["by_regime"] }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const up = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      setRes(await api.post<Result>("/backtest", { symbol: form.symbol, timeframe: form.timeframe, bars: Number(form.bars), mode: form.mode,
        risk_pct: Number(form.risk_pct), params: { min_rr: Number(form.min_rr), sl_buffer_atr: Number(form.sl_buffer_atr), min_confirmations: Number(form.min_confirmations) } }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const compare = async () => {
    setBusy(true); setErr(null);
    try { setCmp(await api.post(`/backtest/compare?symbol=${form.symbol}&timeframe=${form.timeframe}&bars=${form.bars}`)); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 p-3">
      <Card>
        <CardHeader title="Strategy tester — structure_confluence_v1" right={<Badge tone="info">next-bar fills · costs included · no look-ahead</Badge>} />
        <div className="grid grid-cols-2 gap-2 p-3 text-xs md:grid-cols-5 xl:grid-cols-9">
          <label className="space-y-1"><span className="text-muted">Symbol</span>
            <Select value={form.symbol} onChange={(e) => up("symbol", e.target.value)} className="w-full">
              {["BTCUSDT", "ETHUSDT", "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "USOIL"].map((s) => <option key={s}>{s}</option>)}</Select></label>
          <label className="space-y-1"><span className="text-muted">Timeframe</span>
            <Select value={form.timeframe} onChange={(e) => up("timeframe", e.target.value)} className="w-full">{TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}</Select></label>
          <label className="space-y-1"><span className="text-muted">Bars</span><Input type="number" value={form.bars} onChange={(e) => up("bars", e.target.value)} /></label>
          <label className="space-y-1"><span className="text-muted">Validation</span>
            <Select value={form.mode} onChange={(e) => up("mode", e.target.value)} className="w-full">
              <option value="single">Full period</option><option value="oos">In/out-of-sample (70/30)</option><option value="walk_forward">Walk-forward (4 folds)</option></Select></label>
          <label className="space-y-1"><span className="text-muted">Risk / trade %</span><Input type="number" step="0.1" value={form.risk_pct} onChange={(e) => up("risk_pct", e.target.value)} /></label>
          <label className="space-y-1"><span className="text-muted">Min net R:R</span><Input type="number" step="0.1" value={form.min_rr} onChange={(e) => up("min_rr", e.target.value)} /></label>
          <label className="space-y-1"><span className="text-muted">SL buffer (ATR)</span><Input type="number" step="0.05" value={form.sl_buffer_atr} onChange={(e) => up("sl_buffer_atr", e.target.value)} /></label>
          <label className="space-y-1"><span className="text-muted">Min confirmations</span><Input type="number" min={2} max={6} value={form.min_confirmations} onChange={(e) => up("min_confirmations", e.target.value)} /></label>
          <div className="flex items-end gap-1"><Button onClick={run} disabled={busy} className="flex-1">{busy ? "Running…" : "Run"}</Button><Button variant="outline" onClick={compare} disabled={busy}>Compare</Button></div>
        </div>
        {err && <div className="px-3 pb-3 text-xs text-bear">{err}</div>}
      </Card>

      {res && (
        <>
          <div className="rounded-md border border-warn/30 bg-warn/5 p-2 text-[11px] text-warn">
            {res.limitations.map((l) => <div key={l}>• {l}</div>)}
          </div>
          <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader title={`Equity curve · ${fmtTime(res.period.start)} → ${fmtTime(res.period.end)} · ${res.signals} signals`} />
              <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-5">{M(res.metrics).map(([k, v]) => <Stat key={k} label={k} value={String(v)} />)}</div>
              {res.metrics.sample_warning && <div className="px-3 text-[11px] text-warn">Fewer than 30 trades — statistics are not reliable.</div>}
              <div className="p-2"><EquityChart data={res.equity_curve} height={240} /></div>
            </Card>
            <div className="space-y-3">
              <Card>
                <CardHeader title="Performance by market regime" />
                <table className="w-full text-xs tabular-nums"><thead className="text-[10px] uppercase text-muted"><tr><th className="px-3 py-1 text-left">Regime</th><th>Trades</th><th>Win</th><th>Exp. R</th><th className="pr-3 text-right">Net</th></tr></thead>
                  <tbody>{Object.entries(res.by_regime).map(([k, v]) => (
                    <tr key={k} className="border-t border-line/60"><td className="px-3 py-1">{k.replace("_", " ")}</td><td className="text-center">{v.trades}</td><td className="text-center">{fmtPct(v.win_rate, 0)}</td>
                      <td className={cn("text-center", pnlClass(v.expectancy_r))}>{v.expectancy_r}</td><td className={cn("pr-3 text-right", pnlClass(v.net))}>{fmtMoney(v.net)}</td></tr>))}</tbody></table>
              </Card>
              <Card>
                <CardHeader title="Confidence calibration (quality → outcome)" />
                <table className="w-full text-xs tabular-nums"><thead className="text-[10px] uppercase text-muted"><tr><th className="px-3 py-1 text-left">Quality</th><th>Trades</th><th>Win rate</th><th className="pr-3 text-right">Exp. R</th></tr></thead>
                  <tbody>{res.calibration.map((r) => (
                    <tr key={r.quality_range[0]} className="border-t border-line/60"><td className="px-3 py-1">{r.quality_range[0]}–{r.quality_range[1]}</td><td className="text-center">{r.trades}</td>
                      <td className="text-center">{fmtPct(r.win_rate, 0)}</td><td className="pr-3 text-right">{r.expectancy_r ?? "—"}</td></tr>))}</tbody></table>
                <p className="p-3 text-[10px] text-muted">Buckets with &lt;30 trades are never shown as calibrated confidence in the live setup panel.</p>
              </Card>
            </div>
          </div>

          {res.out_of_sample && (
            <Card><CardHeader title={`In-sample vs out-of-sample (split ${fmtTime(res.out_of_sample.split_time)})`} />
              <div className="grid gap-3 p-3 md:grid-cols-2">{(["in_sample", "out_of_sample"] as const).map((k) => (
                <div key={k}><div className="mb-2 text-xs font-semibold">{k === "in_sample" ? "In-sample" : "Out-of-sample"}</div>
                  <div className="grid grid-cols-3 gap-2">{M(res.out_of_sample![k]).slice(0, 9).map(([a, b]) => <Stat key={a} label={a} value={String(b)} />)}</div></div>))}</div></Card>
          )}
          {res.walk_forward && (
            <Card><CardHeader title={`Walk-forward · OOS expectancy ${res.walk_forward.oos_expectancy_r ?? "—"}R over ${res.walk_forward.oos_total_trades} trades`} />
              <table className="w-full text-xs tabular-nums"><thead className="text-[10px] uppercase text-muted"><tr>
                {["Fold", "OOS window", "Chosen params (IS)", "IS exp. R", "OOS trades", "OOS win", "OOS exp. R", "OOS max DD"].map((h) => <th key={h} className="px-3 py-1 text-left">{h}</th>)}</tr></thead>
                <tbody>{res.walk_forward.folds.map((f) => (
                  <tr key={f.fold} className="border-t border-line/60"><td className="px-3 py-1">{f.fold}</td><td className="px-3">{fmtTime(f.oos_start).slice(0, 10)} → {fmtTime(f.oos_end).slice(0, 10)}</td>
                    <td className="px-3">{Object.entries(f.chosen_params).map(([k, v]) => `${k}=${v}`).join(", ")}</td><td className="px-3">{f.is_expectancy_r ?? "—"}</td>
                    <td className="px-3">{String(f.oos.trades)}</td><td className="px-3">{fmtPct(f.oos.win_rate as number, 0)}</td>
                    <td className={cn("px-3", pnlClass(f.oos.expectancy_r as number))}>{String(f.oos.expectancy_r ?? "—")}</td><td className="px-3">{String(f.oos.max_drawdown_pct)}%</td></tr>))}</tbody></table></Card>
          )}

          <Card><CardHeader title={`Trade-by-trade journal (${res.trades.length})`} />
            {res.trades.length === 0 ? <Empty>No trades — the rules found no qualifying setups in this period.</Empty> : (
              <div className="max-h-96 overflow-auto"><table className="w-full text-xs tabular-nums"><thead className="sticky top-0 bg-panel text-[10px] uppercase text-muted"><tr>
                {["Entry time", "Dir", "Entry", "Stop", "TP1/2/3", "Exit", "Reason", "Quality", "Regime", "R", "P&L"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
                <tbody>{res.trades.map((t, i) => {
                  const tr = t as { entry_time: number; direction: string; entry: number; stop: number; tps: number[]; exit_price: number; exit_reason: string; quality: number; regime: string; r_multiple: number; pnl: number };
                  return (<tr key={i} className="border-t border-line/60"><td className="px-2 py-1">{fmtTime(tr.entry_time)}</td>
                    <td className={tr.direction === "long" ? "text-bull" : "text-bear"}>{tr.direction}</td><td>{fmtPrice(tr.entry)}</td><td>{fmtPrice(tr.stop)}</td>
                    <td className="text-muted">{tr.tps.map((x) => fmtPrice(x)).join(" / ")}</td><td>{fmtPrice(tr.exit_price)}</td><td>{tr.exit_reason}</td><td>{tr.quality}</td><td>{tr.regime}</td>
                    <td className={pnlClass(tr.r_multiple)}>{tr.r_multiple.toFixed(2)}</td><td className={pnlClass(tr.pnl)}>{fmtMoney(tr.pnl)}</td></tr>);
                })}</tbody></table></div>)}</Card>
        </>
      )}

      {cmp && (
        <Card><CardHeader title="Strategy comparison across regimes" />
          <table className="w-full text-xs tabular-nums"><thead className="text-[10px] uppercase text-muted"><tr>
            {["Variant", "Params", "Trades", "Win", "PF", "Exp. R", "Max DD", "Best regime", "Worst regime"].map((h) => <th key={h} className="px-3 py-1 text-left">{h}</th>)}</tr></thead>
            <tbody>{Object.entries(cmp).map(([name, v]) => {
              const reg = Object.entries(v.by_regime).sort((a, b) => b[1].expectancy_r - a[1].expectancy_r);
              return (<tr key={name} className="border-t border-line/60"><td className="px-3 py-1 font-medium">{name}</td><td className="px-3 text-muted">{JSON.stringify(v.params)}</td>
                <td className="px-3">{String(v.metrics.trades)}</td><td className="px-3">{fmtPct(v.metrics.win_rate as number, 0)}</td><td className="px-3">{String(v.metrics.profit_factor ?? "—")}</td>
                <td className={cn("px-3", pnlClass(v.metrics.expectancy_r as number))}>{String(v.metrics.expectancy_r ?? "—")}</td><td className="px-3">{String(v.metrics.max_drawdown_pct)}%</td>
                <td className="px-3">{reg[0] ? `${reg[0][0]} (${reg[0][1].expectancy_r}R)` : "—"}</td><td className="px-3">{reg.at(-1) ? `${reg.at(-1)![0]} (${reg.at(-1)![1].expectancy_r}R)` : "—"}</td></tr>);
            })}</tbody></table></Card>
      )}
    </div>
  );
}
