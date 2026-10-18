import { bad, forward, isEmail } from "@/lib/backend";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (!isEmail(b.email)) return bad("Please enter a valid email.");
  if (typeof b.password !== "string" || !b.password) return bad("Please enter your password.");

  return forward("/auth/login", b, () => ({ ok: true }));
}
