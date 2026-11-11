"use client";
import { useEffect, useState } from "react";
import { api, qs } from "@/lib/api";
import type { Order, Setup } from "@/lib/types";
import { cn, fmtPrice } from "@/lib/utils";
import { Button, Input, Select, Tabs } from "../ui/primitives";

export interface TicketPrefill { side: "buy" | "sell"; setup?: Setup | null; nonce: number }

export function OrderTicket({ symbol, tf, prefill, onPlaced }: { symbol: string; tf: string; prefill: TicketPrefill | null; onPlaced: () => void }) {
  const plan = prefill?.setup?.symbol === symbol ? prefill.setup.plan : null;
  const [side, setSide] = useState<"buy" | "sell">(prefill?.side ?? "buy");
  const [type, setType] = useState("market");
  const [qty, setQty] = useState(plan?.position_size?.qty ? String(plan.position_size.qty) : "");
  const [price, setPrice] = useState("");
  const [sl, setSl] = useState(plan ? String(+plan.stop_loss.toPrecision(8)) : "");
  const [tp, setTp] = useState(plan ? String(+plan.take_profits[1].toPrecision(8)) : "");
  const fromSetup = Boolean(plan);
  const [result, setResult] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<{ bid: number; ask: number } | null>(null);

  useEffect(() => {
    const run = () => api.get<{ bid: number; ask: number }>(`/quote${qs({ symbol })}`).then(setQuote).catch(() => setQuote(null));
    run();
    const id = setInterval(run, 2000);
    return () => clearInterval(id);
  }, [symbol]);

  const autoSize = async () => {
    if (!quote || !sl) return;
    const entry = type === "market" ? (side === "buy" ? quote.ask : quote.bid) : Number(price);
    const r = await api.post<{ qty: number; note: string | null }>("/risk/position-size", { symbol, entry, stop_loss: Number(sl) });
    setQty(String(r.qty));
  };

  const submit = async () => {
    setBusy(true);
    try {
      const o = await api.post<Order>("/orders", {
        symbol, side, type, qty: Number(qty),
        limit_price: type === "limit" ? Number(price) : undefined, stop_price: type === "stop" ? Number(price) : undefined,
        stop_loss: sl ? Number(sl) : undefined, take_profit: tp ? Number(tp) : undefined,
        client_order_id: `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        from_setup: fromSetup, timeframe: tf,
      });
      setResult(o);
      onPlaced();
    } catch (e) {
      setResult({ status: "error", reject_reasons: [(e as Error).message] } as Order);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 p-3 text-xs">
      <Tabs value={side} onChange={setSide} className="w-full" items={[
        { value: "buy", label: <span className={side === "buy" ? "text-bull" : ""}>Buy {quote && fmtPrice(quote.ask)}</span> },
        { value: "sell", label: <span className={side === "sell" ? "text-bear" : ""}>Sell {quote && fmtPrice(quote.bid)}</span> }]} />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className="text-[10px] text-muted">Type</span>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-full">
            <option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop</option>
          </Select></label>
        <label className="space-y-1"><span className="text-[10px] text-muted">Quantity</span>
          <div className="flex gap-1"><Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />
            <Button variant="outline" size="sm" onClick={autoSize} title="Size from max risk per trade and stop distance">Risk</Button></div></label>
        {type !== "market" && <label className="col-span-2 space-y-1"><span className="text-[10px] text-muted">{type === "limit" ? "Limit" : "Stop"} price</span>
          <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" /></label>}
        <label className="space-y-1"><span className="text-[10px] text-muted">Stop-loss (required)</span><Input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" /></label>
        <label className="space-y-1"><span className="text-[10px] text-muted">Take-profit</span><Input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" /></label>
      </div>
      {fromSetup && <div className="text-[10px] text-accent">Linked to the current {tf} setup (snapshot stored in the journal).</div>}
      <Button className="w-full" size="lg" variant={side === "buy" ? "bull" : "bear"} disabled={busy || !qty} onClick={submit}>
        {busy ? "Validating…" : `Paper ${side} ${qty || ""} ${symbol}`}
      </Button>
      {result && (
        <div className={cn("rounded-md border p-2", result.status === "filled" || result.status === "pending" ? "border-bull/40 bg-bull/5" : "border-bear/40 bg-bear/5")}>
          <div className="font-medium">{result.status === "filled" ? `Filled @ ${fmtPrice(result.fill_price)} (fees $${result.fees.toFixed(2)}, slippage ${fmtPrice(result.slippage)})` : result.status === "pending" ? "Order working" : "Rejected"}</div>
          {result.reject_reasons?.map((r, i) => <div key={i} className="text-bear">• {r}</div>)}
          {result.risk_checks && (
            <details className="mt-1"><summary className="cursor-pointer text-[10px] text-muted">Risk checks ({result.risk_checks.filter((c) => c.passed).length}/{result.risk_checks.length} passed)</summary>
              {result.risk_checks.map((c) => <div key={c.name} className={cn("text-[10px]", c.passed ? "text-muted" : "text-bear")}>{c.passed ? "✓" : "✗"} {c.detail}</div>)}
            </details>)}
        </div>
      )}
    </div>
  );
}
