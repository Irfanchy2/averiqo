import type { Drawing } from "@/lib/types";
import { fmtPrice, fmtTime } from "@/lib/utils";

/** Shared hover card for a detected structure (used by the 2D and 3D charts). */
export function DrawingTooltip({ d, x, y }: { d: Drawing; x: number; y: number }) {
  return (
    <div className="pointer-events-none absolute z-30 w-72 rounded-md border border-line bg-panel/95 p-2.5 text-[11px] shadow-xl backdrop-blur"
      style={{ left: x, top: y }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">{d.label}</span>
        <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">Quality {d.quality}/100</span>
      </div>
      <div className="mb-1 text-muted">
        {d.price !== null ? fmtPrice(d.price) : d.top !== null ? `${fmtPrice(d.bottom)} – ${fmtPrice(d.top)}` : ""}
        {" · "}{d.timeframe} · {d.status}{d.inferred && " · inferred"}
      </div>
      <div className="mb-1">{d.reason}</div>
      <div className="text-warn/90">Invalidation: {d.invalidation}</div>
      <div className="mt-1 text-[10px] text-muted">Detected {fmtTime(d.detected_at)} · quality is a heuristic score, not a probability</div>
    </div>
  );
}
