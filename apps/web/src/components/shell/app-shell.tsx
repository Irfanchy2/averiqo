"use client";
import { Bell, BookOpen, CandlestickChart, FlaskConical, Keyboard, Newspaper, Plug, Settings, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { WorkspaceProvider, useWorkspace } from "@/lib/store";
import { Backdrop3D } from "../three/backdrop-3d";
import type { Account } from "@/lib/types";
import { cn, fmtMoney, fmtTime, pnlClass } from "@/lib/utils";
import { Badge, Button } from "../ui/primitives";

const NAV = [
  { href: "/", label: "Workspace", icon: CandlestickChart },
  { href: "/backtest", label: "Backtesting", icon: FlaskConical },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/risk", label: "Risk", icon: ShieldCheck },
  { href: "/news", label: "News & Calendar", icon: Newspaper },
  { href: "/brokers", label: "Brokers", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface Note { id: number; title: string; body?: string; level: string; at: number }

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { ws } = useWorkspace();
  const path = usePathname();
  const router = useRouter();
  const { data: acct, reload } = useApi<Account>("/paper/account", 3000);
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setNotes((n) => [{ id: Date.now() + Math.random(), title: d.title, body: d.body ?? (d.data ? JSON.stringify(d.data) : undefined), level: d.level ?? "info", at: Date.now() / 1000 }, ...n].slice(0, 50));
    };
    window.addEventListener("tp-notification", h);
    return () => window.removeEventListener("tp-notification", h);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.altKey && /^[1-7]$/.test(e.key)) {
        e.preventDefault();
        router.push(NAV[Number(e.key) - 1].href);
      }
      if (e.key === "?") setHelp((h) => !h);
      if (e.key === "Escape") { setHelp(false); setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const toggleKill = async () => {
    if (!acct) return;
    if (!acct.kill_switch && !confirm("Engage kill switch? All new orders will be blocked and pending orders cancelled.")) return;
    await api.post("/risk/kill-switch", { engaged: !acct.kill_switch, reason: "Manual (top bar)" });
    reload();
  };

  return (
    <>
      <div data-depth={ws.depth} className="flex h-dvh flex-col overflow-hidden">
        {ws.depth !== "off" && <Backdrop3D intensity={ws.depth === "full" ? 1 : 0.55} />}
        <header className="glass relative z-30 flex h-11 shrink-0 items-center gap-3 border-b border-line px-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="[perspective:200px]"><div className="logo-cube" aria-hidden><span>TP</span><span>AI</span><span>TP</span><span>AI</span></div></div>
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">TradePilot <span className="text-accent">AI</span></span>
          </Link>
          <div className="flex items-center gap-1.5">
            {acct && (
              <Badge tone={acct.mode === "live" ? "bear" : acct.mode === "paper" ? "info" : "neutral"} title="Trading mode">
                {acct.mode === "paper" ? "Paper trading" : acct.mode === "analysis" ? "Analysis only" : "Live"}
              </Badge>
            )}
            {acct?.simulated_data && (
              <Badge tone="warn" title="Prices come from a synthetic feed — not real market data">Simulated data</Badge>
            )}
          </div>
          <div className="ml-auto flex items-center gap-4">
            {acct && (
              <div className="hidden items-center gap-4 text-xs tabular-nums md:flex">
                <span className="text-muted">Equity <span className="font-semibold text-fg">{fmtMoney(acct.equity)}</span></span>
                <span className="text-muted">Day <span className={cn("font-semibold", pnlClass(acct.daily_pnl))}>{fmtMoney(acct.daily_pnl)}</span></span>
                <span className="text-muted">Exposure <span className="font-semibold text-fg">{acct.exposure_pct ?? 0}%</span></span>
              </div>
            )}
            <Button variant={acct?.kill_switch ? "bear" : "danger"} size="sm" onClick={toggleKill} title={acct?.kill_switch_reason ?? "Block all new orders"}>
              <ShieldAlert className="h-3.5 w-3.5" />
              {acct?.kill_switch ? "Kill switch ON" : "Kill switch"}
            </Button>
            <div className="relative">
              <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
                <Bell className="h-4 w-4" />
                {notes.length > 0 && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-accent" />}
              </Button>
              {open && (
                <div className="glass no-rise absolute right-0 top-9 z-50 max-h-96 w-80 overflow-auto rounded-lg border border-line shadow-2xl">
                  <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Notifications
                    <button className="normal-case hover:text-fg" onClick={() => setNotes([])}>Clear</button>
                  </div>
                  {notes.length === 0 ? <div className="p-4 text-xs text-muted">No notifications yet.</div> :
                    notes.map((n) => (
                      <div key={n.id} className="border-b border-line/60 px-3 py-2 text-xs">
                        <div className={cn("font-medium", n.level === "warning" && "text-warn", n.level === "bull" && "text-bull", n.level === "bear" && "text-bear")}>{n.title}</div>
                        {n.body && <div className="mt-0.5 line-clamp-2 text-muted">{n.body}</div>}
                        <div className="mt-0.5 text-[10px] text-muted/70">{fmtTime(n.at)}</div>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setHelp(true)} aria-label="Keyboard shortcuts"><Keyboard className="h-4 w-4" /></Button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <nav className="glass hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-line py-2 sm:flex">
            {NAV.map((n, i) => (
              <Link key={n.href} href={n.href} title={`${n.label} (Alt+${i + 1})`}
                className={cn("lift3d grid h-9 w-9 place-items-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-fg",
                  (n.href === "/" ? path === "/" : path.startsWith(n.href)) && "bg-panel-2 text-accent")}>
                <n.icon className="h-4 w-4" />
              </Link>
            ))}
          </nav>
          <main className="min-w-0 flex-1 overflow-auto pb-14 sm:pb-0">{children}</main>
        </div>
        <nav className="glass no-rise fixed inset-x-0 bottom-0 z-40 flex h-12 items-center justify-around border-t border-line sm:hidden">
          {NAV.slice(0, 5).map((n) => (
            <Link key={n.href} href={n.href} className={cn("grid place-items-center text-muted", (n.href === "/" ? path === "/" : path.startsWith(n.href)) && "text-accent")}>
              <n.icon className="h-5 w-5" />
            </Link>
          ))}
        </nav>
        {help && <ShortcutHelp onClose={() => setHelp(false)} />}
      </div>
    </>
  );
}

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const rows = [
    ["1 – 8", "Switch timeframe (1m … 1D)"], ["[ / ]", "Previous / next symbol"], ["/", "Focus symbol search"],
    ["V", "Toggle 2D / 3D chart"], ["L", "Cycle chart layout (1 / 2 / 4)"], ["D", "Toggle all drawings"], ["B / S", "Open buy / sell ticket"],
    ["A", "Focus AI assistant"], ["Alt + 1…7", "Navigate pages"], ["?", "Toggle this help"], ["Esc", "Close dialogs"],
  ];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60" onClick={onClose}>
      <div className="glass no-rise w-96 rounded-lg border border-line p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-sm font-semibold">Keyboard shortcuts</h2>
        <table className="w-full text-xs">
          <tbody>{rows.map(([k, v]) => (
            <tr key={k} className="border-b border-line/50"><td className="py-1.5 pr-3"><kbd className="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd></td><td className="text-muted">{v}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
