import type { Metadata } from "next";
import { getPricing } from "@/lib/pricing";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Checkout" };

export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string; billing?: string }> }) {
  const [cfg, sp] = await Promise.all([getPricing(), searchParams]);
  const plan = cfg.plans.some((p) => p.id === sp.plan) ? sp.plan! : "business";
  return <CheckoutForm config={cfg} plan={plan} billing={sp.billing === "yearly" ? "yearly" : "monthly"} />;
}
