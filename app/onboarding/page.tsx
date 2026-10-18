"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FlowShell, FormError } from "@/components/FlowShell";
import { Icon } from "@/components/Icons";
import { postJSON, readFlow, writeFlow } from "@/lib/flow";

const modules: { id: string; label: string; icon: keyof typeof Icon }[] = [
  { id: "crm", label: "CRM & Leads", icon: "users" },
  { id: "sales", label: "Quotations & Invoices", icon: "invoice" },
  { id: "projects", label: "Projects & Work Orders", icon: "projects" },
  { id: "employees", label: "Employees", icon: "badge" },
  { id: "documents", label: "Documents & OCR", icon: "doc" },
  { id: "assets", label: "Vehicles & Assets", icon: "truck" },
  { id: "reports", label: "Reports", icon: "chart" },
  { id: "whatsapp", label: "WhatsApp", icon: "chat" },
  { id: "ai", label: "AI Automation", icon: "spark" },
];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>(["crm", "sales", "documents", "reports"]);
  const [invites, setInvites] = useState("");
  const [company, setCompany] = useState("your company");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const flow = readFlow();
    if (!flow.company) return router.replace(flow.account ? "/create-company" : "/signup");
    setCompany(flow.company.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function finish() {
    setError(null);
    const emails = invites.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const invalid = emails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (invalid) return setError(`"${invalid}" isn't a valid email.`);
    setBusy(true);
    try {
      const flow = readFlow();
      await postJSON("/api/onboarding", { companyId: flow.company?.id, modules: selected, invites: emails });
      writeFlow({ onboarding: { modules: selected, invites: emails, done: true } });
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <FlowShell
      step={3}
      title={step === 0 ? `Set up ${company}` : "Invite your team"}
      subtitle={step === 0 ? "Pick the modules to start with. Everything else stays one click away." : "Add teammates now or skip and do it later from Settings."}
    >
      {step === 0 ? (
        <div>
          <div className="grid gap-3 sm:grid-cols-3">
            {modules.map((m) => {
              const I = Icon[m.icon];
              const on = selected.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(m.id)}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 text-left text-sm font-medium transition-colors ${on ? "border-accent bg-blue-50/60 text-ink" : "border-line text-slate-600 hover:border-slate-300"}`}
                >
                  <I className={`h-5 w-5 shrink-0 ${on ? "text-accent" : "text-slate-400"}`} />
                  {m.label}
                </button>
              );
            })}
          </div>
          <button className="btn btn-primary mt-8 w-full !py-3" onClick={() => setStep(1)} disabled={!selected.length}>Continue</button>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label htmlFor="invites" className="label">Teammate emails</label>
            <textarea id="invites" rows={4} className="input" placeholder="name@company.com, another@company.com" value={invites} onChange={(e) => setInvites(e.target.value)} />
          </div>
          <FormError message={error} />
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button className="btn btn-ghost sm:w-1/3" onClick={() => setStep(0)} disabled={busy}>Back</button>
            <button className="btn btn-primary flex-1 !py-3" onClick={finish} disabled={busy}>{busy ? "Preparing workspace…" : invites.trim() ? "Send invites & open Averiqo" : "Skip & open Averiqo"}</button>
          </div>
        </div>
      )}
    </FlowShell>
  );
}
