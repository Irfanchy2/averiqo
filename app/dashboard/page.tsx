import type { Metadata } from "next";
import { BrowserFrame } from "@/components/Frames";
import { Logo } from "@/components/Logo";
import { APP_URL } from "@/lib/site";
import { Handoff } from "./Handoff";

export const metadata: Metadata = { title: "Your workspace is ready", robots: { index: false } };

export default function Page() {
  return (
    <div className="min-h-screen bg-navy-900 text-white">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-5"><Logo dark /></header>
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-10 text-center">
        <Handoff appUrl={APP_URL} />
        <div className="mx-auto mt-14 max-w-5xl text-left text-ink"><BrowserFrame slot="dashboard" alt="Averiqo dashboard" /></div>
      </main>
    </div>
  );
}
