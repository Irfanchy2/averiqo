/**
 * Same-origin proxy to the quant service. The bearer token (TP_API_TOKEN) is attached here,
 * on the server, so it is never shipped to the browser.
 */
import type { NextRequest } from "next/server";

const UPSTREAM = process.env.QUANT_API_URL ?? "http://127.0.0.1:8000";
const TOKEN = process.env.QUANT_API_TOKEN ?? "";

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = `${UPSTREAM}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = { "content-type": req.headers.get("content-type") ?? "application/json" };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) headers["x-forwarded-for"] = fwd;
  try {
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.text();
    const r = await fetch(url, { method: req.method, headers, body, cache: "no-store" });
    return new Response(await r.text(), {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "Quant service unreachable. Is it running on " + UPSTREAM + "?" }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
