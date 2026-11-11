"use client";
import { DRAWING_KINDS, useWorkspace } from "@/lib/store";
import type { Analysis } from "@/lib/types";
import { cn, fmtPrice, fmtTime } from "@/lib/utils";

export function DrawingsPanel({ analysis }: { analysis: Analysis | null }) {
  const { ws, set } = useWorkspace();
  const counts: Record<string, number> = {};
  for (const d of analysis?.drawings ?? []) counts[d.kind] = (counts[d.kind] ?? 0) + 1;
  const toggle = (k: string) => set({ visible: ws.visible.includes(k) ? ws.visible.filter((x) => x !== k) : [...ws.visible, k] });
  const shown = (analysis?.drawings ?? []).filter((d) => ws.visible.includes(d.kind)).sort((a, b) => b.detected_at - a.detected_at);
  return (
    <div className="text-xs">
      <div className="grid grid-cols-2 gap-1 p-2">
        {DRAWING_KINDS.map(({ kind, label }) => (
          <button key={kind} onClick={() => toggle(kind)}
            className={cn("flex items-center gap-1.5 rounded border px-2 py-1 text-left text-[11px]",
              ws.visible.includes(kind) ? "border-line bg-panel-2 text-fg" : "border-transparent text-muted hover:bg-panel-2")}>
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: ws.colors[kind] }} />
            <span className="flex-1 truncate">{label}</span>
            <span className="text-[10px] text-muted">{counts[kind] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-1 px-2 pb-2">
        <button className="text-[10px] text-muted hover:text-fg" onClick={() => set({ visible: DRAWING_KINDS.map((k) => k.kind) })}>Show all</button>
        <span className="text-muted">·</span>
        <button className="text-[10px] text-muted hover:text-fg" onClick={() => set({ visible: [] })}>Hide all</button>
      </div>
      <div className="border-t border-line">
        {shown.slice(0, 60).map((d) => (
          <details key={d.id} className="border-b border-line/60 px-3 py-1.5">
            <summary className="flex cursor-pointer list-none items-center gap-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: d.direction === "bullish" ? ws.colors.bullish : d.direction === "bearish" ? ws.colors.bearish : ws.colors[d.kind] }} />
              <span className="flex-1 truncate">{d.label}</span>
              <span className="tabular-nums text-muted">{d.price !== null ? fmtPrice(d.price) : d.top !== null ? fmtPrice(d.top) : ""}</span>
              <span className="w-8 text-right text-[10px] text-muted">Q{d.quality}</span>
            </summary>
            <div className="mt-1 space-y-0.5 text-[11px] text-muted">
              <div>{d.reason}</div>
              <div className="text-warn/80">Invalidation: {d.invalidation}</div>
              <div>{d.timeframe} · detected {fmtTime(d.detected_at)} · {d.status}{d.inferred ? " · inferred (not order-book data)" : ""}</div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
