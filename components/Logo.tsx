import Link from "next/link";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Averiqo home">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill={dark ? "#fff" : "#0a1226"} />
        <path d="M9 23l7-14 7 14" fill="none" stroke={dark ? "#0a1226" : "#fff"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="19" r="2" fill="#3d7bff" />
      </svg>
      <span className={`font-display text-[1.15rem] font-semibold ${dark ? "text-white" : "text-ink"}`}>Averiqo</span>
    </Link>
  );
}
