import { bad, forward, isEmail } from "@/lib/backend";
import { getPlanSync } from "@/lib/pricing";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (!b.name || typeof b.name !== "string") return bad("Please enter your name.");
  if (!isEmail(b.email)) return bad("Please enter a valid work email.");
  if (typeof b.password !== "string" || b.password.length < 8) return bad("Password must be at least 8 characters.");
  if (b.plan && !getPlanSync(b.plan)) return bad("Unknown plan.");

  return forward("/auth/signup", b, () => ({ userId: `demo_${crypto.randomUUID()}` }));
}
