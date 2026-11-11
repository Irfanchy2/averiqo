"use client";
import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { Setup } from "@/lib/types";
import { cn, fmtPct, fmtPrice } from "@/lib/utils";
import { Badge, Button } from "../ui/primitives";

const STATUS_UI: Record<string, { label: string; tone: "bull" | "bear" | "warn" | "neutral" }> = {
  bullish_setup: { label: "Bullish setup", tone: "bull" },
  bearish_setup: { label: "Bearish setup", tone: "bear" },
  wait_for_confirmation: { label: "Wait for confirmation", tone: "warn" },
  neutral: { label: "Neutral", tone: "neutral" },
  no_trade: { label: "No trade", tone: "neutral" },
};

function VerdictIcon({ v }: { v: string }) {
  if (v === "block") return <XCircle className="h-3.5 w-3.5 text-bear" />;
  if (v === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-warn" />;
  if (v === "neutral") return <CircleDashed className="h-3.5 w-3.5 text-muted" />;
  return <CheckCircle2 className={cn("h-3.5 w-3.5", v === "bearish" ? "text-bear" : "text-bull")} />;
}

export function SetupPanel({ setup, error, onTrade }: { setup: Setup | null; error?: string | null; onTrade: (s: Setup) => void }) {
  if (error) return <div className="p-4 text-xs text-bear">{error}</div>;
  if (!setup) return <div className="p-4 text-xs text-muted">Evaluating 7 decision layers…</div>;
  const ui = STATUS_UI[setup.status];
  const p = setup.plan;
  const tradable = setup.status === "bullish_setup" || setup.status === "bearish_setup";
  return (
    <div className="space-y-3 p-3 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <Badge tone={ui.tone} className="text-[11px]">{ui.label}</Badge>
          <div className="mt-1 text-[10px] text-muted">{setup.symbol} · {setup.timeframe} (bias {setup.htf}) · setup quality {setup.quality}/100</div>
        </div>
        {tradable && <Button size="sm" variant={setup.direction === "long" ? "bull" : "bear"} onClick={() => onTrade(setup)}>Paper trade</Button>}
      </div>

      <div className="rounded-md border border-line bg-bg/60 p-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">Confidence</div>
        {setup.confidence.calibrated ? (
          <div>Historical win rate for this quality range: <b>{fmtPct(setup.confidence.historical_win_rate)}</b>, expectancy {setup.confidence.historical_expectancy_r}R (n={setup.confidence.sample_size}).</div>
        ) : (
          <div className="text-muted">{setup.confidence.note} {setup.confidence.sample_size > 0 && `(n=${setup.confidence.sample_size})`}</div>
        )}
        {setup.confidence.simulated_data && <div className="mt-1 text-[10px] text-warn">Calibrated on simulated data — not indicative of real performance.</div>}
      </div>

      {p && (
        <div className="rounded-md border border-line p-2">
          <div className="mb-1.5 flex justify-between text-[10px] uppercase tracking-wider text-muted">
            <span>{setup.status === "wait_for_confirmation" ? "Provisional plan" : "Trade plan"} · {setup.direction}</span>
            <span>net R:R {p.rr_net_tp2}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
            <span className="text-muted">Entry zone</span><span className="text-right">{fmtPrice(p.entry_zone[0])} – {fmtPrice(p.entry_zone[1])}</span>
            <span className="text-muted">Stop-loss</span><span className="text-right text-bear">{fmtPrice(p.stop_loss)}</span>
            {p.take_profits.map((tp, i) => (
              <span key={i} className="contents"><span className="text-muted">TP{i + 1} <span className="text-[10px]">({p.tp_sources[i]})</span></span>
                <span className="text-right text-bull">{fmtPrice(tp)} <span className="text-muted">· {p.rr[i]}R</span></span></span>
            ))}
            <span className="text-muted">Est. costs</span><span className="text-right">{fmtPrice(p.estimated_cost_per_unit)} /unit ({p.cost_in_r}R)</span>
            {p.position_size && <><span className="text-muted">Position size</span><span className="text-right">{p.position_size.qty} (risk ${p.position_size.risk_amount})</span></>}
          </div>
          {setup.entry_condition && <div className="mt-2 text-muted">{setup.entry_condition}</div>}
          <div className="mt-1 text-warn/90">Invalidation: {p.invalidation}</div>
        </div>
      )}

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">Decision layers</div>
        <div className="divide-y divide-line rounded-md border border-line">
          {setup.layers.map((L, i) => (
            <details key={L.key} className="group px-2 py-1.5" open={L.verdict === "block"}>
              <summary className="flex cursor-pointer list-none items-center gap-2">
                <VerdictIcon v={L.verdict} />
                <span className="text-muted">L{i + 1}</span>
                <span className="flex-1">{L.name}</span>
                <span className="text-[10px] uppercase text-muted">{L.verdict}</span>
              </summary>
              <ul className="mt-1 space-y-0.5 pl-6 text-[11px] text-muted">{L.details.map((d, j) => <li key={j}>{d}</li>)}</ul>
            </details>
          ))}
        </div>
      </div>

      {setup.reasons_for.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-bull">Supporting</div>
          <ul className="list-disc space-y-0.5 pl-4 text-[11px]">{setup.reasons_for.slice(0, 8).map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {setup.reasons_against.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-bear">Against</div>
          <ul className="list-disc space-y-0.5 pl-4 text-[11px]">{setup.reasons_against.slice(0, 8).map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-muted/80">Deterministic rules generate this output; it is analysis, not financial advice. No setup guarantees a profitable outcome.</p>
    </div>
  );
}
