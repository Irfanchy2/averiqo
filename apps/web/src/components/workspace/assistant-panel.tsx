"use client";
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Msg { role: "user" | "assistant"; text: string; meta?: string }

const SUGGEST = {
  en: ["Why is BTC bullish?", "Where is the nearest resistance?", "Identify liquidity sweeps.", "Explain this order block.", "Why was this setup rejected?", "What news could affect Gold today?", "Explain my last losing trade."],
  bn: ["BTC কেন বুলিশ?", "নিকটতম রেজিস্ট্যান্স কোথায়?", "লিকুইডিটি সুইপ দেখাও", "এই অর্ডার ব্লক ব্যাখ্যা করো", "সেটআপ কেন বাতিল হলো?", "আজ সোনার উপর কোন খবর প্রভাব ফেলতে পারে?", "আমার সর্বশেষ লস ট্রেড ব্যাখ্যা করো"],
};

export function AssistantPanel({ inputRef }: { inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const { ws, set } = useWorkspace();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setQ("");
    setBusy(true);
    try {
      const r = await api.post<{ answer: string; intent: string; evidence: { symbol: string }; actions: { type: string; kinds: string[] }[] }>(
        "/assistant/ask", { question, symbol: ws.symbol, timeframe: ws.tf, language: ws.language });
      setMsgs((m) => [...m, { role: "assistant", text: r.answer, meta: `${r.evidence.symbol} · ${ws.tf} · grounded in computed analysis` }]);
      const hl = r.actions.find((a) => a.type === "highlight");
      if (hl) set({ visible: Array.from(new Set([...ws.visible, ...hl.kinds])) });
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: `Error: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-[10px] text-muted">Answers cite only computed data — no invented facts.</span>
        <div className="flex gap-0.5 rounded bg-bg p-0.5">
          {(["en", "bn"] as const).map((l) => (
            <button key={l} onClick={() => set({ language: l })} className={cn("rounded px-1.5 py-0.5 text-[10px]", ws.language === l ? "bg-panel-2 text-fg" : "text-muted")}>
              {l === "en" ? "EN" : "বাংলা"}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGEST[ws.language].map((s) => (
              <button key={s} onClick={() => ask(s)} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted hover:border-accent hover:text-fg">{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("max-w-[95%] whitespace-pre-wrap rounded-lg px-2.5 py-2 leading-relaxed",
            m.role === "user" ? "ml-auto bg-accent/15 text-fg" : "bg-panel-2")}>
            {m.text}
            {m.meta && <div className="mt-1 text-[10px] text-muted">{m.meta}</div>}
          </div>
        ))}
        {busy && <div className="text-muted">Analysing…</div>}
        <div ref={end} />
      </div>
      <form className="flex gap-1.5 border-t border-line p-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={ws.language === "bn" ? "চার্ট সম্পর্কে জিজ্ঞাসা করুন…" : "Ask about the chart… (A)"}
          className="h-8 flex-1 rounded-md border border-line bg-bg px-2 focus:border-accent focus:outline-none" />
        <button type="submit" disabled={busy} className="grid h-8 w-8 place-items-center rounded-md bg-accent text-black disabled:opacity-40" aria-label="Send"><Send className="h-3.5 w-3.5" /></button>
      </form>
    </div>
  );
}
