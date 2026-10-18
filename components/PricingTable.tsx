"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "./Icons";
import { formatMoney, priceFor, type BillingCycle, type PricingConfig } from "@/lib/pricing";

export function PricingTable({ config, dark = false }: { config: PricingConfig; dark?: boolean }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const freeMonths = 12 - config.yearlyMonthsCharged;

  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing cycle" className={`inline-flex rounded-xl p-1 ${dark ? "bg-white/5 ring-1 ring-white/10" : "bg-mist ring-1 ring-line"}`}>
          {(["monthly", "yearly"] as const).map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={cycle === c}
              onClick={() => setCycle(c)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                cycle === c ? (dark ? "bg-white text-ink" : "bg-white text-ink shadow-sm") : dark ? "text-white/60 hover:text-white" : "text-slate-500 hover:text-ink"
              }`}
            >
              {c === "monthly" ? "Monthly" : "Yearly"}
              {c === "yearly" && freeMonths > 0 && (
                <span className={`ml-2 rounded-md px-1.5 py-0.5 text-[11px] ${cycle === c ? "bg-emerald-50 text-emerald-700" : "bg-emerald-400/10 text-emerald-500"}`}>
                  {freeMonths} months free
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {config.plans.map((plan) => {
          const p = priceFor(plan, cycle, config);
          const lifetime = plan.billing === "lifetime";
          const featured = plan.highlighted;
          const href = `/signup?plan=${plan.id}${lifetime ? "" : `&billing=${cycle}`}`;
          return (
            <div
              key={plan.id}
              data-plan={plan.id}
              className={`relative flex flex-col rounded-2xl p-7 ${
                featured
                  ? "bg-navy-900 text-white ring-1 ring-navy-900"
                  : lifetime
                    ? dark ? "bg-navy-850 text-white ring-1 ring-white/10" : "bg-mist ring-1 ring-line"
                    : dark ? "bg-navy-850 text-white ring-1 ring-white/10" : "bg-white ring-1 ring-line"
              }`}
            >
              {featured && <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
              <div className="font-display text-lg font-semibold">{plan.name}</div>
              <p className={`mt-1.5 min-h-[2.5rem] text-sm ${featured || dark ? "text-white/60" : "text-slate-500"}`}>{plan.tagline}</p>
              <div className="mt-6 flex flex-wrap items-baseline gap-x-1.5">
                <span data-price className="font-display whitespace-nowrap text-4xl font-semibold tracking-tight xl:text-[2.15rem]">
                  {formatMoney(lifetime ? p.amount : (p.perMonth ?? p.amount), config.currency)}
                </span>
                <span className={`text-sm ${featured || dark ? "text-white/50" : "text-slate-500"}`}>{lifetime ? "one-time" : "/month"}</span>
              </div>
              <div data-billed className={`mt-1 h-5 text-xs ${featured || dark ? "text-white/50" : "text-slate-500"}`}>
                {lifetime ? "Limited founder offer" : cycle === "yearly" ? `Billed ${formatMoney(p.amount, config.currency)} yearly` : "Billed monthly"}
              </div>
              <Link href={href} className={`btn mt-6 w-full ${featured ? "btn-primary" : dark ? "btn-light" : lifetime ? "btn-ghost" : "btn-ghost"}`}>
                {plan.cta}
              </Link>
              {!lifetime && <div className={`mt-2 text-center text-xs ${featured || dark ? "text-white/40" : "text-slate-400"}`}>{config.trialDays}-day free trial</div>}
              <ul className="mt-6 space-y-3 border-t border-current/10 pt-6 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Icon.check className={`mt-0.5 h-4 w-4 shrink-0 ${featured ? "text-signal" : "text-accent"}`} />
                    <span className={featured || dark ? "text-white/80" : "text-slate-600"}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className={`mt-6 text-center text-xs ${dark ? "text-white/40" : "text-slate-400"}`}>Prices in {config.currency}. VAT may apply.</p>
    </div>
  );
}
