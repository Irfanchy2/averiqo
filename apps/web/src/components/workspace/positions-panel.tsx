"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Order, Position } from "@/lib/types";
import { cn, fmtMoney, fmtPrice, pnlClass } from "@/lib/utils";
import { Button, Empty, Tabs } from "../ui/primitives";

export function PositionsPanel({ refreshKey }: { refreshKey: number }) {
  const [tab, setTab] = useState<"positions" | "orders">("positions");
  const pos = useApi<Position[]>(`/positions?status=open&k=${refreshKey}`, 2000);
  const ord = useApi<Order[]>(`/orders?limit=30&k=${refreshKey}`, 5000);
  const close = async (id: number) => { await api.post(`/positions/${id}/close`); pos.reload(); };
  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex items-center justify-between border-b border-line px-2 py-1">
        <Tabs value={tab} onChange={setTab} items={[{ value: "positions", label: `Positions (${pos.data?.length ?? 0})` }, { value: "orders", label: "Orders" }]} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "positions" ? (
          !pos.data?.length ? <Empty>No open paper positions.</Empty> : (
            <table className="w-full tabular-nums">
              <thead className="sticky top-0 bg-panel text-[10px] uppercase text-muted"><tr>
                {["Symbol", "Side", "Qty", "Entry", "SL", "TP", "P&L", ""].map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
              <tbody>{pos.data.map((p) => (
                <tr key={p.id} className="border-t border-line/60">
                  <td className="px-2 py-1 font-medium">{p.symbol}</td>
                  <td className={cn("px-2", p.side === "long" ? "text-bull" : "text-bear")}>{p.side}</td>
                  <td className="px-2">{p.qty}</td><td className="px-2">{fmtPrice(p.entry_price)}</td>
                  <td className="px-2 text-bear">{fmtPrice(p.stop_loss)}</td><td className="px-2 text-bull">{fmtPrice(p.take_profit)}</td>
                  <td className={cn("px-2 font-semibold", pnlClass(p.unrealized_pnl))}>{fmtMoney(p.unrealized_pnl)}</td>
                  <td className="px-2 text-right"><Button size="sm" variant="outline" onClick={() => close(p.id)}>Close</Button></td>
                </tr>))}</tbody>
            </table>)
        ) : (
          !ord.data?.length ? <Empty>No orders yet.</Empty> : (
            <table className="w-full tabular-nums">
              <thead className="sticky top-0 bg-panel text-[10px] uppercase text-muted"><tr>
                {["ID", "Symbol", "Side", "Type", "Qty", "Status", "Fill / reason"].map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
              <tbody>{ord.data.map((o) => (
                <tr key={o.id} className="border-t border-line/60">
                  <td className="px-2 py-1 text-muted">{o.id}</td><td className="px-2">{o.symbol}</td>
                  <td className={cn("px-2", o.side === "buy" ? "text-bull" : "text-bear")}>{o.side}</td><td className="px-2">{o.type}</td>
                  <td className="px-2">{o.qty}</td>
                  <td className={cn("px-2", o.status === "rejected" && "text-bear", o.status === "filled" && "text-bull")}>{o.status}</td>
                  <td className="max-w-xs truncate px-2 text-muted" title={o.reject_reasons?.join("; ")}>{o.fill_price ? fmtPrice(o.fill_price) : o.reject_reasons?.[0]}</td>
                </tr>))}</tbody>
            </table>)
        )}
      </div>
    </div>
  );
}
