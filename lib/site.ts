/** Where the real Averiqo app lives. Onboarding hands off here. */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
export const DEMO_URL = process.env.NEXT_PUBLIC_DEMO_URL || "/demo";

export const nav = [
  { href: "/#product", label: "Product" },
  { href: "/#features", label: "Features" },
  { href: "/#mobile", label: "Mobile" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];
