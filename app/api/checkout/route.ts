import { NextResponse } from "next/server";
import { bad } from "@/lib/backend";
import { getPricing, priceFor, type BillingCycle } from "@/lib/pricing";

/**
 * Creates a checkout. With STRIPE_SECRET_KEY set it opens a Stripe Checkout
 * session (subscription with trial, or one-time payment for lifetime) and
 * returns its URL. Without it the site is in demo mode and goes straight on
 * to company creation.
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const cfg = await getPricing();
  const plan = cfg.plans.find((p) => p.id === b.plan);
  if (!plan) return bad("Please choose a plan.");
  const cycle: BillingCycle = b.billing === "yearly" ? "yearly" : "monthly";
  const price = priceFor(plan, cycle, cfg);

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ demo: true, next: "/create-company" });

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const lifetime = plan.billing === "lifetime";
  const form = new URLSearchParams({
    mode: lifetime ? "payment" : "subscription",
    success_url: `${origin}/create-company?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout?plan=${plan.id}&billing=${cycle}`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": cfg.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(price.amount * 100),
    "line_items[0][price_data][product_data][name]": `Averiqo ${plan.name}`,
    "metadata[plan]": plan.id,
    "metadata[billing]": lifetime ? "lifetime" : cycle,
  });
  if (typeof b.email === "string" && b.email) form.set("customer_email", b.email);
  if (!lifetime) {
    form.set("line_items[0][price_data][recurring][interval]", cycle === "yearly" ? "year" : "month");
    form.set("subscription_data[trial_period_days]", String(cfg.trialDays));
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: data?.error?.message || "Checkout failed." }, { status: 502 });
  return NextResponse.json({ url: data.url });
}
