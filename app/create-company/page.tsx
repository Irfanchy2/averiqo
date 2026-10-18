"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FlowShell, FormError } from "@/components/FlowShell";
import { postJSON, readFlow, writeFlow } from "@/lib/flow";

const industries = ["Contracting & construction", "Trading", "Facilities & maintenance", "Logistics & transport", "Professional services", "Retail", "Other"];
const sizes = ["Just me", "2–10", "11–50", "51–200", "200+"];
const countries = [
  ["AE", "United Arab Emirates", "AED"],
  ["SA", "Saudi Arabia", "SAR"],
  ["QA", "Qatar", "QAR"],
  ["OM", "Oman", "OMR"],
  ["BH", "Bahrain", "BHD"],
  ["KW", "Kuwait", "KWD"],
  ["OTHER", "Other", "USD"],
];

export default function CreateCompany() {
  const router = useRouter();
  const [country, setCountry] = useState("AE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!readFlow().account) router.replace("/signup");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const currency = countries.find((c) => c[0] === country)?.[2] ?? "AED";
    const company = {
      name: String(f.get("name") || "").trim(),
      industry: String(f.get("industry") || ""),
      size: String(f.get("size") || ""),
      country,
      currency,
      trn: String(f.get("trn") || "").trim() || undefined,
    };
    if (!company.name) return setError("Please enter your company name.");
    setBusy(true);
    try {
      const flow = readFlow();
      const sessionId = new URLSearchParams(window.location.search).get("session_id") || undefined;
      const res = await postJSON<{ id?: string }>("/api/company", { ...company, userId: flow.account?.userId, plan: flow.plan, checkoutSessionId: sessionId });
      writeFlow({ company: { ...company, id: res.id } });
      router.push("/onboarding");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <FlowShell step={2} title="Create your company" subtitle="This sets up your workspace, documents and default currency. You can add more companies later.">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="name" className="label">Company name</label>
          <input id="name" name="name" className="input" autoComplete="organization" required />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="industry" className="label">Industry</label>
            <select id="industry" name="industry" className="input">{industries.map((i) => <option key={i}>{i}</option>)}</select>
          </div>
          <div>
            <label htmlFor="size" className="label">Team size</label>
            <select id="size" name="size" className="input" defaultValue="2–10">{sizes.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="country" className="label">Country</label>
            <select id="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
              {countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="trn" className="label">Tax registration no. <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="trn" name="trn" className="input" />
          </div>
        </div>
        <FormError message={error} />
        <button className="btn btn-primary w-full !py-3" disabled={busy}>{busy ? "Creating company…" : "Create company"}</button>
      </form>
    </FlowShell>
  );
}
