import Link from "next/link";
import { Logo } from "./Logo";

const cols = [
  { title: "Product", links: [["Features", "/#features"], ["Mobile app", "/#mobile"], ["Pricing", "/pricing"], ["Live demo", "/demo"]] },
  { title: "Modules", links: [["CRM & Leads", "/#crm"], ["Invoicing", "/#sales"], ["Projects", "/#projects"], ["Documents & OCR", "/#documents"]] },
  { title: "Account", links: [["Log in", "/login"], ["Start free trial", "/signup"], ["FAQ", "/#faq"]] },
];

export function Footer() {
  return (
    <footer className="bg-navy-950 text-white/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:grid-cols-5 lg:px-8">
        <div className="md:col-span-2">
          <Logo dark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">The business operating system for teams that want everything in one place.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/40">{c.title}</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {c.links.map(([label, href]) => (
                <li key={label}><Link href={href} className="hover:text-white">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-5 py-6 text-xs sm:flex-row lg:px-8">
          <span>© {new Date().getFullYear()} Averiqo. All rights reserved.</span>
          <span className="flex gap-5"><Link href="/legal/privacy" className="hover:text-white">Privacy</Link><Link href="/legal/terms" className="hover:text-white">Terms</Link></span>
        </div>
      </div>
    </footer>
  );
}
