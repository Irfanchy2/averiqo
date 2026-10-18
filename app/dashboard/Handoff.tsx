"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readFlow } from "@/lib/flow";

/** Final step: hands the new customer over to the Averiqo app dashboard. */
export function Handoff({ appUrl }: { appUrl: string }) {
  const [name, setName] = useState<string | null>(null);
  const target = appUrl ? `${appUrl.replace(/\/$/, "")}/dashboard` : null;

  useEffect(() => {
    const flow = readFlow();
    setName(flow.company?.name ?? null);
    if (target) {
      const t = setTimeout(() => (window.location.href = target), 1800);
      return () => clearTimeout(t);
    }
  }, [target]);

  return (
    <div>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-signal/15 text-2xl text-signal">✓</span>
      <h1 className="font-display mt-6 text-4xl font-semibold sm:text-5xl">{name ? `${name} is ready.` : "Your workspace is ready."}</h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-white/65">
        {target ? "Taking you to your Averiqo dashboard…" : "Your Averiqo dashboard is set up with the modules you chose."}
      </p>
      <div className="mt-8 flex justify-center">
        {target ? (
          <a href={target} className="btn btn-primary !px-6 !py-3.5">Open dashboard</a>
        ) : (
          <Link href="/" className="btn btn-light !px-6 !py-3.5">Back to site</Link>
        )}
      </div>
    </div>
  );
}
