import { bad, forward } from "@/lib/backend";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (!b.name || typeof b.name !== "string") return bad("Please enter your company name.");

  return forward("/companies", b, () => ({ id: `demo_${crypto.randomUUID()}` }));
}
