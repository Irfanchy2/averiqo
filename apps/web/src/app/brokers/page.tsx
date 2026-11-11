"use client";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Input, Select } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtTime } from "@/lib/utils";

interface Broker { key: string; name: string; status: string; integration: string; asset_classes: string[]; supports_server_side_stop_loss: boolean; supports_disable_withdrawals: boolean; official_api: string; notes: string[] }
interface Conn { id: number; broker: string; label: string; fingerprint: string; verified: boolean; created_at: string; declared_permissions: Record<string, boolean> }

export default function BrokersPage() {
  const { data, reload } = useApi<{ brokers: Broker[]; connections: Conn[] }>("/brokers");
  const [f, setF] = useState({ broker: "binance", label: "", api_key: "", api_secret: "", trade: true, withdraw: false });
  const [msg, setMsg] = useState<string | null>(null);
  const add = async () => {
    try {
      await api.post("/brokers/credentials", { broker: f.broker, label: f.label || f.broker, api_key: f.api_key, api_secret: f.api_secret, declared_permissions: { trade: f.trade, withdraw: f.withdraw } });
      setMsg("Stored encrypted on the server. It cannot be read back."); setF({ ...f, api_key: "", api_secret: "" }); reload();
    } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div className="grid gap-3 p-3 xl:grid-cols-[2fr_1fr]">
      <div className="space-y-3">
        {data?.brokers.map((b) => (
          <Card key={b.key}>
            <CardHeader title={b.name} right={<Badge tone={b.status === "available" ? "bull" : "warn"}>{b.status === "available" ? "available" : "planned · not verified"}</Badge>} />
            <div className="grid gap-2 p-3 text-xs md:grid-cols-2">
              <div><span className="text-muted">Integration: </span>{b.integration}</div>
              <div><span className="text-muted">Assets: </span>{b.asset_classes.join(", ")}</div>
              <div><span className="text-muted">Server-side stop-loss: </span>{b.supports_server_side_stop_loss ? "yes" : "no"}</div>
              <div><span className="text-muted">Withdrawal-disabled keys: </span>{b.supports_disable_withdrawals ? "supported" : "n/a"}</div>
              <div className="md:col-span-2"><span className="text-muted">Official API: </span>{b.official_api}</div>
              <ul className="list-disc space-y-0.5 pl-4 text-muted md:col-span-2">{b.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          </Card>
        ))}
      </div>
      <div className="space-y-3">
        <Card>
          <CardHeader title="Add API credentials" />
          <div className="space-y-2 p-3 text-xs">
            <p className="text-muted">Keys are encrypted server-side (never stored in the browser or the extension). Use a <b>trade-only</b> key with withdrawals disabled and IP allow-listing.</p>
            <Select value={f.broker} onChange={(e) => setF({ ...f, broker: e.target.value })} className="w-full"><option value="binance">Binance</option><option value="mt5">MetaTrader 5 bridge</option><option value="exness">Exness (via MT5)</option></Select>
            <Input placeholder="Label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
            <Input placeholder="API key / login" value={f.api_key} onChange={(e) => setF({ ...f, api_key: e.target.value })} autoComplete="off" />
            <Input placeholder="API secret / password" type="password" value={f.api_secret} onChange={(e) => setF({ ...f, api_secret: e.target.value })} autoComplete="new-password" />
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.withdraw} onChange={(e) => setF({ ...f, withdraw: e.target.checked })} /> Key has withdrawal permission</label>
            <Button onClick={add} disabled={!f.api_key || !f.api_secret}>Store encrypted</Button>
            {msg && <p className="text-muted">{msg}</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Connections" />
          <div className="divide-y divide-line/60 text-xs">
            {data?.connections.length ? data.connections.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2">
                <div><div className="font-medium">{c.label} <span className="text-muted">({c.broker})</span></div><div className="text-[10px] text-muted">fp {c.fingerprint} · {fmtTime(c.created_at)}</div></div>
                <div className="flex items-center gap-2"><Badge tone={c.verified ? "bull" : "warn"}>{c.verified ? "verified" : "unverified"}</Badge>
                  <Button size="sm" variant="ghost" onClick={async () => { await api.del(`/brokers/credentials/${c.id}`); reload(); }}>Remove</Button></div>
              </div>)) : <div className="p-3 text-muted">No broker connections.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
