"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlowShell, FormError } from "@/components/FlowShell";
import { PlanSummary } from "@/components/PlanSummary";
import { postJSON, writeFlow } from "@/lib/flow";
import type { BillingCycle, PricingConfig } from "@/lib/pricing";

export function SignupForm({ config, plan, billing: initial }: { config: PricingConfig; plan: string; billing: BillingCycle }) {
  const router = useRouter();
  const [billing, setBilling] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const body = {
      name: String(f.get("name") || "").trim(),
      email: String(f.get("email") || "").trim(),
      password: String(f.get("password") || ""),
      plan,
      billing,
    };
    setBusy(true);
    try {
      const res = await postJSON<{ userId?: string }>("/api/signup", body);
      writeFlow({ plan, billing, account: { name: body.name, email: body.email, userId: res.userId } });
      router.push(`/checkout?plan=${plan}&billing=${billing}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <FlowShell
      step={0}
      title="Create your Averiqo account"
      subtitle={<>Already have an account? <Link href="/login" className="font-semibold text-accent hover:underline">Log in</Link></>}
      aside={<PlanSummary config={config} planId={plan} billing={billing} onBillingChange={setBilling} />}
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input id="name" name="name" className="input" autoComplete="name" required />
        </div>
        <div>
          <label htmlFor="email" className="label">Work email</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required />
          <p className="mt-1.5 text-xs text-slate-400">At least 8 characters.</p>
        </div>
        <FormError message={error} />
        <button className="btn btn-primary w-full !py-3" disabled={busy}>{busy ? "Creating account…" : "Continue"}</button>
        <p className="text-center text-xs text-slate-400">
          By continuing you agree to the <Link href="/legal/terms" className="underline">Terms</Link> and <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </form>
    </FlowShell>
  );
}
