"use client";

import Link from "next/link";
import { Icon } from "./Icons";
import { formatMoney, priceFor, type BillingCycle, type PricingConfig } from "@/lib/pricing";

export function PlanSummary({
  config,
  planId,
  billing,
  onBillingChange,
}: {
  config: PricingConfig;
  planId: string;
  billing: BillingCycle;
  onBillingChange?: (b: BillingCycle) => void;
}) {
  const plan = config.plans.find((p) => p.id === planId) ?? config.plans[1];
  const lifetime = plan.billing === "lifetime";
  const price = priceFor(plan, billing, config);

  return (
    <div className="rounded-2xl bg-navy-900 p-7 text-white lg:sticky lg:top-8">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Your plan</div>
        <Link href="/pricing" className="text-xs font-semibold text-white/70 hover:text-white">Change</Link>
      </div>
      <div className="font-display mt-3 text-2xl font-semibold">{plan.name}</div>
      <div className="mt-1 text-sm text-white/60">{plan.tagline}</div>

      {!lifetime && onBillingChange && (
        <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-white/5 p-1 ring-1 ring-white/10">
          {(["monthly", "yearly"] as const).map((c) => (
            <button key={c} type="button" onClick={() => onBillingChange(c)} className={`rounded-md py-1.5 text-sm font-semibold ${billing === c ? "bg-white text-ink" : "text-white/60"}`}>
              {c === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      )}

      <dl className="mt-6 space-y-3 border-t border-white/10 pt-6 text-sm">
        <div className="flex justify-between">
          <dt className="text-white/60">{lifetime ? "One-time payment" : billing === "yearly" ? "Billed yearly" : "Billed monthly"}</dt>
          <dd className="font-semibold">{formatMoney(price.amount, config.currency)}</dd>
        </div>
        {!lifetime && (
          <div className="flex justify-between">
            <dt className="text-white/60">Due today</dt>
            <dd className="font-semibold text-signal">{formatMoney(0, config.currency)} · {config.trialDays}-day trial</dd>
          </div>
        )}
      </dl>
      <ul className="mt-6 space-y-2.5 border-t border-white/10 pt-6 text-sm">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2.5 text-white/75"><Icon.check className="mt-0.5 h-4 w-4 shrink-0 text-signal" />{f}</li>
        ))}
      </ul>
    </div>
  );
}
