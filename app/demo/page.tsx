import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BrowserFrame } from "@/components/Frames";

export const metadata: Metadata = { title: "Live demo" };

/*
 * Shown when NEXT_PUBLIC_DEMO_URL isn't set. Point that variable at the real
 * demo workspace (or a video) and the "View Live Demo" buttons go there instead.
 */
export default function Page() {
  return (
    <>
      <Header variant="dark" />
      <main className="bg-navy-900 pb-24 pt-32 text-white">
        <div className="mx-auto max-w-6xl px-5 text-center">
          <h1 className="font-display text-4xl font-semibold sm:text-5xl">Take a look inside Averiqo.</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/65">The interactive demo workspace is coming soon. Start a free trial to explore Averiqo with your own data.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn btn-primary !px-6 !py-3.5">Start Free Trial</Link>
            <Link href="/#product" className="btn btn-ghost-dark !px-6 !py-3.5">See product screens</Link>
          </div>
          <div className="mt-14 text-left text-ink"><BrowserFrame slot="dashboard" alt="Averiqo dashboard" /></div>
        </div>
      </main>
      <Footer />
    </>
  );
}
