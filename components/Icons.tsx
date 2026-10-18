type P = { className?: string };
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};

export const Icon = {
  users: (p: P) => (
    <svg {...base} className={p.className}><path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" /><circle cx="9" cy="8" r="3.5" /><path d="M22 20v-1a4 4 0 0 0-3-3.87M16 4.13A3.5 3.5 0 0 1 16 11" /></svg>
  ),
  invoice: (p: P) => (
    <svg {...base} className={p.className}><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6M9 13h7M9 17h5" /></svg>
  ),
  projects: (p: P) => (
    <svg {...base} className={p.className}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
  ),
  badge: (p: P) => (
    <svg {...base} className={p.className}><rect x="3" y="5" width="18" height="15" rx="2" /><circle cx="9" cy="12" r="2.5" /><path d="M5.5 17.5a3.5 3.5 0 0 1 7 0M15 10h3M15 14h3M9 5V3h6v2" /></svg>
  ),
  doc: (p: P) => (
    <svg {...base} className={p.className}><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3" /><path d="M8 9h8M8 12h8M8 15h5" /></svg>
  ),
  truck: (p: P) => (
    <svg {...base} className={p.className}><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7z" /><circle cx="6" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></svg>
  ),
  chart: (p: P) => (
    <svg {...base} className={p.className}><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 6-7" /></svg>
  ),
  chat: (p: P) => (
    <svg {...base} className={p.className}><path d="M3.5 20.5l1.3-4A8.5 8.5 0 1 1 8 19.6z" /><path d="M9 10.5c.5 1.8 2 3.3 3.8 3.8l1.2-1.1 2 .9-.4 1.6c-3.6.2-7.4-3.6-7.2-7.2l1.6-.4.9 2z" /></svg>
  ),
  spark: (p: P) => (
    <svg {...base} className={p.className}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></svg>
  ),
  building: (p: P) => (
    <svg {...base} className={p.className}><path d="M3 21h18M5 21V5l7-2v18M12 8h7v13M8 9h1M8 13h1M8 17h1M15 12h1M15 16h1" /></svg>
  ),
  phone: (p: P) => (
    <svg {...base} className={p.className}><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
  ),
  check: (p: P) => (
    <svg {...base} className={p.className}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  ),
  arrow: (p: P) => (
    <svg {...base} className={p.className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
  ),
  play: (p: P) => (
    <svg {...base} className={p.className}><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l5.5-3.5z" /></svg>
  ),
  lock: (p: P) => (
    <svg {...base} className={p.className}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
  ),
  plus: (p: P) => (
    <svg {...base} className={p.className}><path d="M12 5v14M5 12h14" /></svg>
  ),
  menu: (p: P) => (
    <svg {...base} className={p.className}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
  ),
  close: (p: P) => (
    <svg {...base} className={p.className}><path d="M6 6l12 12M18 6L6 18" /></svg>
  ),
};
