import defaults from "@/config/pricing.json";

export type BillingCycle = "monthly" | "yearly";

export type Plan = {
  id: string;
  name: string;
  tagline: string;
  monthly?: number;
  oneTime?: number;
  billing: "subscription" | "lifetime";
  highlighted: boolean;
  cta: string;
  features: string[];
};

export type PricingConfig = {
  currency: string;
  /** Months charged when paying yearly (10 = two months free). */
  yearlyMonthsCharged: number;
  trialDays: number;
  plans: Plan[];
};

/**
 * Single source of truth for pricing.
 *
 * Today it reads config/pricing.json. When the Averiqo admin/settings API
 * exposes pricing, set PRICING_API_URL and this will fetch from it instead
 * (revalidated every 5 minutes), falling back to the bundled defaults.
 */
export async function getPricing(): Promise<PricingConfig> {
  const url = process.env.PRICING_API_URL;
  if (url) {
    try {
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (res.ok) return (await res.json()) as PricingConfig;
    } catch {
      // fall through to defaults
    }
  }
  return defaults as PricingConfig;
}

export function getPlanSync(id: string | null | undefined): Plan | undefined {
  return (defaults as PricingConfig).plans.find((p) => p.id === id);
}

export function priceFor(plan: Plan, cycle: BillingCycle, cfg: PricingConfig) {
  if (plan.billing === "lifetime") {
    return { amount: plan.oneTime ?? 0, perMonth: null, period: "one-time" as const };
  }
  const monthly = plan.monthly ?? 0;
  if (cycle === "yearly") {
    const amount = monthly * cfg.yearlyMonthsCharged;
    return { amount, perMonth: Math.round(amount / 12), period: "year" as const };
  }
  return { amount: monthly, perMonth: monthly, period: "month" as const };
}

export function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US")}`;
}
