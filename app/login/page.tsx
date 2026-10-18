"use client";

import Link from "next/link";
import { useState } from "react";
import { FlowShell, FormError } from "@/components/FlowShell";
import { postJSON } from "@/lib/flow";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await postJSON<{ redirect?: string }>("/api/login", { email: f.get("email"), password: f.get("password") });
      window.location.href = res.redirect || (APP_URL ? `${APP_URL.replace(/\/$/, "")}/dashboard` : "/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <FlowShell title="Log in to Averiqo" subtitle={<>New to Averiqo? <Link href="/signup" className="font-semibold text-accent hover:underline">Start a free trial</Link></>}>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="label">Password</label>
            <Link href={APP_URL ? `${APP_URL}/forgot-password` : "/login"} className="mb-1.5 text-xs font-semibold text-accent hover:underline">Forgot password?</Link>
          </div>
          <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
        </div>
        <FormError message={error} />
        <button className="btn btn-primary w-full !py-3" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      </form>
    </FlowShell>
  );
}
