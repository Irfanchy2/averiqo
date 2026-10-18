"use client";

import type { BillingCycle } from "./pricing";

/**
 * Client-side state carried through Pricing → Sign Up → Checkout →
 * Create Company → Onboarding → Dashboard. The backend is the source of
 * truth once AVERIQO_API_URL is configured; this only keeps the funnel
 * continuous across page loads.
 */
export type FlowState = {
  plan?: string;
  billing?: BillingCycle;
  account?: { name: string; email: string; userId?: string };
  checkout?: { status: "trial" | "paid" | "demo"; reference?: string };
  company?: { id?: string; name: string; industry: string; country: string; currency: string; size: string; trn?: string };
  onboarding?: { modules: string[]; invites: string[]; done: boolean };
};

const KEY = "averiqo.flow";

export function readFlow(): FlowState {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}") as FlowState;
  } catch {
    return {};
  }
}

export function writeFlow(patch: Partial<FlowState>): FlowState {
  const next = { ...readFlow(), ...patch };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode); flow still works within the page
  }
  return next;
}

export async function postJSON<T = Record<string, unknown>>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Something went wrong. Please try again.");
  return data as T;
}
