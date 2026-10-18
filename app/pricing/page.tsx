import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PricingTable } from "@/components/PricingTable";
import { Faq } from "@/components/Faq";
import { getPricing } from "@/lib/pricing";

export const metadata: Metadata = { title: "Pricing", description: "Averiqo plans: Starter, Business, Pro and Founder Lifetime." };

export default async function Page() {
  const cfg = await getPricing();
  return (
    <>
      <Header variant="light" />
      <main className="pt-32">
        <section className="mx-auto max-w-7xl px-5 pb-24 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Pricing</div>
            <h1 className="font-display mt-4 text-4xl font-semibold sm:text-6xl">One workspace. One simple price.</h1>
            <p className="mt-5 text-lg text-slate-600">Every subscription plan starts with a {cfg.trialDays}-day free trial.</p>
          </div>
          <div className="mt-12"><PricingTable config={cfg} /></div>
        </section>
        <section className="border-t border-line bg-white py-24">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="font-display mb-8 text-3xl font-semibold">Frequently asked questions</h2>
            <Faq />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
