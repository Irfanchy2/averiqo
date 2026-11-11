import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtPrice(p: number | null | undefined, ref?: number): string {
  if (p === null || p === undefined || Number.isNaN(p)) return "—";
  const r = Math.abs(ref ?? p);
  const d = r < 10 ? 5 : r < 1000 ? 3 : 2;
  return p.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtTime(unix: number | string | null | undefined): string {
  if (unix === null || unix === undefined) return "—";
  const d = typeof unix === "number" ? new Date(unix * 1000) : new Date(unix);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function pnlClass(v: number | null | undefined) {
  if (!v) return "text-muted";
  return v > 0 ? "text-bull" : "text-bear";
}
