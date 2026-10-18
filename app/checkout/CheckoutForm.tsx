"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FlowShell, FormError } from "@/components/FlowShell";
import { PlanSummary } from "@/components/PlanSummary";
import { Icon } from "@/components/Icons";
import { postJSON, readFlow, writeFlow } from "@/lib/flow";
import { formatMoney, priceFor, type BillingCycle, type PricingConfig } from "@/lib/pricing";

export function CheckoutForm({ config, plan, billing: initial }: { config: PricingConfig; plan: string; billing: BillingCycle }) {
  const router = useRouter();
  const [billing, setBilling] = useState(initial);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const p = config.plans.find((x) => x.id === plan)!;
  const lifetime = p.billing === "lifetime";
  const price = priceFor(p, billing, config);

  useEffect(() => {
    const flow = readFlow();
    if (!flow.account) {
      router.replace(`/signup?plan=${plan}&billing=${billing}`);
      return;
    }
    setEmail(flow.account.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPay() {
    setError(null);
    setBusy(true);
    try {
      const res = await postJSON<{ url?: string; demo?: boolean; next?: string }>("/api/checkout", { plan, billing, email });
      writeFlow({ plan, billing, checkout: { status: res.demo ? "demo" : lifetime ? "paid" : "trial" } });
      if (res.url) window.location.href = res.url;
      else router.push(res.next || "/create-company");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <FlowShell
      step={1}
      title={lifetime ? "Complete your purchase" : "Start your free trial"}
      subtitle={
        lifetime
          ? `One-time payment of ${formatMoney(price.amount, config.currency)}. No recurring charges.`
          : `Nothing is charged today. After ${config.trialDays} days you'll be billed ${formatMoney(price.amount, config.currency)} per ${price.period} unless you cancel.`
      }
      aside={<PlanSummary config={config} planId={plan} billing={billing} onBillingChange={setBilling} />}
    >
      <div className="space-y-6">
        {email && (
          <div className="flex items-center justify-between rounded-lg bg-mist px-4 py-3 text-sm">
            <span className="text-slate-500">Account</span>
            <span className="font-medium text-ink">{email}</span>
          </div>
        )}
        <div className="rounded-xl border border-line p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon.lock className="h-4 w-4 text-slate-400" /> Secure payment</div>
          <p className="mt-2 text-sm text-slate-500">You'll enter your card details on our payment provider's secure checkout page, then return here to set up your company.</p>
        </div>
        <FormError message={error} />
        <button onClick={onPay} className="btn btn-primary w-full !py-3" disabled={busy}>
          {busy ? "Opening checkout…" : lifetime ? `Pay ${formatMoney(price.amount, config.currency)}` : `Start ${config.trialDays}-day free trial`}
        </button>
      </div>
    </FlowShell>
  );
}
