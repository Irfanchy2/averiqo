import { forward } from "@/lib/backend";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  return forward("/onboarding/complete", b, () => ({ ok: true }));
}
