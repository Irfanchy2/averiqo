import type { Metadata } from "next";
import { getPricing } from "@/lib/pricing";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Start your free trial" };

export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string; billing?: string }> }) {
  const [cfg, sp] = await Promise.all([getPricing(), searchParams]);
  const plan = cfg.plans.some((p) => p.id === sp.plan) ? sp.plan! : "business";
  return <SignupForm config={cfg} plan={plan} billing={sp.billing === "yearly" ? "yearly" : "monthly"} />;
}
