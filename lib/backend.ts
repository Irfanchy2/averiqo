import { NextResponse } from "next/server";

/**
 * Forwards a funnel request to the Averiqo backend when AVERIQO_API_URL is
 * set. Without it the site runs in demo mode and returns a stub response so
 * the full flow can be clicked through end to end.
 */
export async function forward(path: string, body: unknown, demo: () => Record<string, unknown>) {
  const base = process.env.AVERIQO_API_URL;
  if (!base) return NextResponse.json({ ...demo(), demo: true });

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.AVERIQO_API_KEY ? { Authorization: `Bearer ${process.env.AVERIQO_API_KEY}` } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "We couldn't reach Averiqo right now. Please try again." }, { status: 502 });
  }
}

export function isEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}
