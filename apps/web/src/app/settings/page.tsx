"use client";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Input } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { DEFAULT_COLORS, DRAWING_KINDS, useWorkspace } from "@/lib/store";

interface Settings { mode: string; strategy: Record<string, number | string>; live_gate_missing: string[]; live_trading_server_flag: boolean }

const MODES = [
  { key: "analysis", title: "Mode 1 — Analysis only", desc: "Insights and drawings. Order routing disabled." },
  { key: "paper", title: "Mode 2 — Paper trading", desc: "Simulated fills with spread, fees, latency and slippage." },
  { key: "live", title: "Mode 3 — Live automated trading", desc: "Requires server flag, explicit opt-in, a verified broker adapter and passing risk validation." },
];

export default function SettingsPage() {
  const { ws, set } = useWorkspace();
  const st = useApi<Settings>("/settings");
  const [msg, setMsg] = useState<string | null>(null);

  const setMode = async (mode: string) => {
    setMsg(null);
    let confirm_phrase: string | undefined;
    if (mode === "live") {
      confirm_phrase = prompt('Live trading places real orders with real money. Type "I UNDERSTAND LIVE TRADING RISKS" to continue.') ?? undefined;
      if (!confirm_phrase) return;
    }
    try { await api.put("/settings/mode", { mode, confirm_phrase }); st.reload(); }
    catch (e) { const d = (e as ApiError).detail as { missing?: string[]; message?: string }; setMsg(d?.missing ? `${d.message} ${d.missing.join(" ")}` : (e as Error).message); }
  };

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <Card>
        <CardHeader title="Trading mode" />
        <div className="space-y-2 p-3">
          {MODES.map((m) => (
            <button key={m.key} onClick={() => setMode(m.key)} className={`w-full rounded-md border p-3 text-left text-xs ${st.data?.mode === m.key ? "border-accent bg-accent/5" : "border-line hover:border-muted"}`}>
              <div className="flex items-center justify-between font-medium">{m.title}{st.data?.mode === m.key && <Badge tone="info">active</Badge>}</div>
              <div className="mt-0.5 text-muted">{m.desc}</div>
            </button>
          ))}
          {st.data && st.data.live_gate_missing.length > 0 && (
            <div className="rounded-md border border-line p-2 text-[11px] text-muted">
              <div className="mb-1 font-medium text-fg">Live trading requirements not met:</div>
              {st.data.live_gate_missing.map((m) => <div key={m}>• {m}</div>)}
            </div>
          )}
          {msg && <div className="text-xs text-warn">{msg}</div>}
        </div>
      </Card>
      {st.data && <StrategyForm key={JSON.stringify(st.data.strategy)} initial={st.data.strategy} onSaved={st.reload} />}
      <Card>
        <CardHeader title="Drawing colours" right={<Button size="sm" variant="ghost" onClick={() => set({ colors: DEFAULT_COLORS })}>Reset</Button>} />
        <div className="grid grid-cols-2 gap-2 p-3 text-xs md:grid-cols-3">
          {[{ kind: "bullish", label: "Bullish" }, { kind: "bearish", label: "Bearish" }, { kind: "setup", label: "Trade plan" }, ...DRAWING_KINDS].map(({ kind, label }) => (
            <label key={kind} className="flex items-center gap-2"><input type="color" value={ws.colors[kind] ?? "#888888"} onChange={(e) => set({ colors: { ...ws.colors, [kind]: e.target.value } })}
              className="h-6 w-8 cursor-pointer rounded border border-line bg-transparent" />{label}</label>))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Interface depth (3D)" />
        <div className="space-y-2 p-3 text-xs">
          <div className="flex gap-2">{([["off", "Off — flat"], ["subtle", "Subtle"], ["full", "Full 3D"]] as const).map(([k, l]) => (
            <Button key={k} variant={ws.depth === k ? "default" : "outline"} onClick={() => set({ depth: k })}>{l}</Button>))}</div>
          <p className="text-muted">Full 3D adds the animated market backdrop, glass panels with depth, tilting tiles, physical buttons and an angled cockpit layout on wide screens. Subtle keeps depth but dims the backdrop and stays flat. Charts are never tilted, so price reading stays exact. Your OS &ldquo;reduce motion&rdquo; setting is respected.</p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Language & interface" />
        <div className="space-y-3 p-3 text-xs">
          <div className="flex gap-2">{(["en", "bn"] as const).map((l) => (
            <Button key={l} variant={ws.language === l ? "default" : "outline"} onClick={() => set({ language: l })}>{l === "en" ? "English" : "বাংলা (Bengali)"}</Button>))}</div>
          <p className="text-muted">Interface preferences are stored in this browser only. Credentials are never stored client-side.</p>
          <p className="text-muted">Press <kbd className="rounded border border-line px-1">?</kbd> anywhere for keyboard shortcuts.</p>
        </div>
      </Card>
    </div>
  );
}

function StrategyForm({ initial, onSaved }: { initial: Record<string, number | string>; onSaved: () => void }) {
  const [strategy, setStrategy] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])));
  const [msg, setMsg] = useState<string | null>(null);
  const saveStrategy = async () => {
    try {
      const body = Object.fromEntries(Object.entries(strategy).filter(([k]) => k !== "name").map(([k, v]) => [k, Number(v)]));
      await api.put("/settings/strategy", body); setMsg("Strategy parameters saved."); onSaved();
    } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <Card>
        <CardHeader title="Strategy rules (structure_confluence_v1)" />
        <div className="grid grid-cols-2 gap-2 p-3 text-xs">
          {Object.entries(strategy).filter(([k]) => k !== "name").map(([k, v]) => (
            <label key={k} className="space-y-1"><span className="text-muted">{k.replaceAll("_", " ")}</span><Input value={v} onChange={(e) => setStrategy((s) => ({ ...s, [k]: e.target.value }))} /></label>))}
        </div>
        <div className="border-t border-line p-3"><Button onClick={saveStrategy}>Save rules</Button>{msg && <span className="ml-2 text-xs text-muted">{msg}</span>}
          <p className="mt-2 text-[10px] text-muted">min confirmations is enforced ≥ 2 — trades are never generated from a single indicator. Backtest changes before relying on them.</p></div>
      </Card>
  );
}
