import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Reveal } from "@/components/Reveal";
import { BrowserFrame, PhoneFrame } from "@/components/Frames";
import { ProductTabs } from "@/components/ProductTabs";
import { PricingTable } from "@/components/PricingTable";
import { Faq, faqs } from "@/components/Faq";
import { Icon } from "@/components/Icons";
import { getPricing } from "@/lib/pricing";
import { DEMO_URL } from "@/lib/site";
import type { Slot } from "@/lib/screenshots";

type Module = {
  id: string;
  slot: Slot;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  icon: keyof typeof Icon;
};

const modules: Module[] = [
  {
    id: "crm", slot: "crm", icon: "users", eyebrow: "CRM & Leads",
    title: "Every lead, every conversation, one pipeline.",
    body: "Capture leads, track each deal through your stages and see the full history of every customer before you pick up the phone.",
    points: ["Visual pipeline with custom stages", "Contacts, companies and activity timeline", "Follow-up tasks and owner assignment"],
  },
  {
    id: "sales", slot: "invoices", icon: "invoice", eyebrow: "Quotations · Invoices · Payments",
    title: "From quote to paid without retyping a thing.",
    body: "Turn a quotation into an invoice in one click, send it on email or WhatsApp, and record payments against it as they arrive.",
    points: ["Branded quotations and VAT-ready invoices", "Partial payments and outstanding balances", "Automatic reminders for overdue invoices"],
  },
  {
    id: "projects", slot: "projects", icon: "projects", eyebrow: "Projects & Work Orders",
    title: "Know where every job stands.",
    body: "Plan projects, issue work orders to your team and track progress, costs and documents against each job.",
    points: ["Work orders with assignees and due dates", "Progress tracking per project", "Link quotations, invoices and files to jobs"],
  },
  {
    id: "employees", slot: "employees", icon: "badge", eyebrow: "Employees",
    title: "Your team's records, organised and on time.",
    body: "Keep employee profiles, documents and key expiry dates in one place, and get notified before anything lapses.",
    points: ["Employee profiles and roles", "Document and expiry tracking", "Leave and attendance records"],
  },
  {
    id: "documents", slot: "documents", icon: "doc", eyebrow: "Documents & OCR",
    title: "Upload a receipt. Averiqo reads it for you.",
    body: "Scan or upload bills, receipts and contracts. OCR extracts the key fields so you review instead of type.",
    points: ["OCR extraction of vendor, date, totals and VAT", "Searchable document library", "Attach documents to any record"],
  },
  {
    id: "vehicles", slot: "vehicles", icon: "truck", eyebrow: "Vehicles & Assets",
    title: "Fleet and equipment, fully accounted for.",
    body: "Register vehicles and assets, assign them to people or projects, and stay ahead of renewals and service dates.",
    points: ["Asset register with assignments", "Registration, insurance and service reminders", "Cost history per asset"],
  },
  {
    id: "reports", slot: "reports", icon: "chart", eyebrow: "Reports & Analytics",
    title: "See the business clearly, in real time.",
    body: "Revenue, expenses, receivables and team performance — calculated from the work you already do in Averiqo.",
    points: ["Live dashboards", "Sales, finance and project reports", "Export to PDF and Excel"],
  },
  {
    id: "whatsapp", slot: "whatsapp", icon: "chat", eyebrow: "WhatsApp Integration",
    title: "Work where your customers already are.",
    body: "Send quotations, invoices and reminders on WhatsApp straight from Averiqo, with every message linked to the right customer.",
    points: ["Send documents on WhatsApp", "Conversations linked to CRM records", "Automated payment reminders"],
  },
  {
    id: "ai", slot: "ai", icon: "spark", eyebrow: "AI Automation",
    title: "Let the routine work run itself.",
    body: "Set up automations in plain language: when something happens, Averiqo does the next step for you.",
    points: ["Trigger-and-action automations", "AI-assisted drafting and data entry", "Summaries of what needs your attention"],
  },
  {
    id: "multi-company", slot: "companies", icon: "building", eyebrow: "Multi-company",
    title: "Run several companies from one login.",
    body: "Each company keeps its own data, branding, numbering and users. Switch between them in a click.",
    points: ["Separate data per company", "Per-company branding and document numbering", "Role-based access across companies"],
  },
];

const core: { icon: keyof typeof Icon; title: string; body: string; href: string }[] = [
  { icon: "users", title: "CRM & Leads", body: "Pipeline, contacts and follow-ups.", href: "#crm" },
  { icon: "invoice", title: "Sales & Payments", body: "Quotes, invoices and collections.", href: "#sales" },
  { icon: "projects", title: "Projects", body: "Jobs, work orders and progress.", href: "#projects" },
  { icon: "badge", title: "Employees", body: "Profiles, documents and expiries.", href: "#employees" },
  { icon: "doc", title: "Documents & OCR", body: "Scan, extract and search.", href: "#documents" },
  { icon: "truck", title: "Vehicles & Assets", body: "Register, assign and renew.", href: "#vehicles" },
  { icon: "chart", title: "Reports", body: "Live numbers across the business.", href: "#reports" },
  { icon: "chat", title: "WhatsApp", body: "Send and track on WhatsApp.", href: "#whatsapp" },
  { icon: "spark", title: "AI Automation", body: "Hand off the routine steps.", href: "#ai" },
  { icon: "building", title: "Multi-company", body: "Many companies, one login.", href: "#multi-company" },
];

function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${dark ? "text-accent" : "text-accent"}`}>{children}</div>;
}

export default async function Home() {
  const pricing = await getPricing();

  return (
    <>
      <Header variant="dark" />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-navy-900 pt-32 text-white">
          <div className="grid-lines pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
          <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
            <Reveal className="mx-auto max-w-4xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-white/70">
                <span className="h-1.5 w-1.5 rounded-full bg-signal" /> The Business Operating System
              </div>
              <h1 className="font-display mt-7 text-[2.6rem] font-semibold leading-[1.04] sm:text-6xl lg:text-[4.6rem]">
                Run your entire business from one intelligent workspace.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/65">
                CRM, invoicing, projects, people, documents, assets and reporting — connected in Averiqo, with WhatsApp and AI automation built in.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/signup" className="btn btn-primary !px-6 !py-3.5">Start Free Trial <Icon.arrow className="h-4 w-4" /></Link>
                <Link href={DEMO_URL} className="btn btn-ghost-dark !px-6 !py-3.5"><Icon.play className="h-4 w-4" /> View Live Demo</Link>
              </div>
              <p className="mt-4 text-sm text-white/45">{pricing.trialDays}-day free trial · Cancel anytime</p>
            </Reveal>

            <Reveal delay={150} className="relative mx-auto mt-16 max-w-6xl">
              <BrowserFrame slot="dashboard" alt="Averiqo dashboard" priority className="translate-y-0" />
              <div className="absolute -bottom-10 -right-2 hidden lg:block xl:-right-10">
                <PhoneFrame slot="mobile-dashboard" alt="Averiqo mobile overview" className="!w-[200px]" />
              </div>
            </Reveal>
          </div>
          <div className="h-24 bg-gradient-to-b from-transparent to-white" />
        </section>

        {/* Product screenshots */}
        <section id="product" className="bg-white py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Inside Averiqo</Eyebrow>
              <h2 className="font-display mt-4 text-4xl font-semibold sm:text-5xl">One system. Every part of the business.</h2>
              <p className="mt-5 text-lg text-slate-600">Screens from the Averiqo workspace. Switch between modules the way your team will.</p>
            </Reveal>
            <Reveal className="mt-12">
              <ProductTabs
                tabs={[
                  { id: "dashboard", label: "Dashboard", content: <BrowserFrame slot="dashboard" alt="Averiqo dashboard" /> },
                  { id: "crm", label: "CRM", content: <BrowserFrame slot="crm" alt="Averiqo CRM pipeline" /> },
                  { id: "invoices", label: "Invoices", content: <BrowserFrame slot="invoices" alt="Averiqo invoices" /> },
                  { id: "projects", label: "Projects", content: <BrowserFrame slot="projects" alt="Averiqo work orders" /> },
                  { id: "reports", label: "Reports", content: <BrowserFrame slot="reports" alt="Averiqo reports" /> },
                ]}
              />
            </Reveal>
          </div>
        </section>

        {/* Core features */}
        <section id="features" className="border-y border-line bg-mist py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <Reveal className="max-w-2xl">
              <Eyebrow>Core features</Eyebrow>
              <h2 className="font-display mt-4 text-4xl font-semibold sm:text-5xl">Replace the stack of disconnected tools.</h2>
              <p className="mt-5 text-lg text-slate-600">Ten modules that share the same customers, people, documents and numbers — so nothing lives in a spreadsheet on the side.</p>
            </Reveal>
            <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
              {core.map((c, i) => {
                const I = Icon[c.icon];
                return (
                  <Reveal key={c.title} delay={(i % 5) * 60} className="h-full">
                    <a href={c.href} className="group flex h-full flex-col bg-white p-6 transition-colors hover:bg-mist">
                      <I className="h-6 w-6 text-navy-900" />
                      <div className="font-display mt-6 font-semibold text-ink">{c.title}</div>
                      <div className="mt-1 text-sm text-slate-500">{c.body}</div>
                      <Icon.arrow className="mt-5 h-4 w-4 text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-accent" />
                    </a>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* Module deep-dives */}
        {modules.map((m, i) => {
          const I = Icon[m.icon];
          const flip = i % 2 === 1;
          return (
            <section key={m.id} id={m.id} className={`scroll-mt-16 py-20 lg:py-28 ${i % 2 ? "bg-mist/60" : "bg-white"}`}>
              <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-12 lg:gap-16 lg:px-8">
                <Reveal className={`min-w-0 lg:col-span-5 ${flip ? "lg:order-2" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 text-white"><I className="h-5 w-5" /></span>
                    <Eyebrow>{m.eyebrow}</Eyebrow>
                  </div>
                  <h2 className="font-display mt-6 text-3xl font-semibold leading-tight sm:text-[2.6rem]">{m.title}</h2>
                  <p className="mt-5 text-lg leading-relaxed text-slate-600">{m.body}</p>
                  <ul className="mt-7 space-y-3">
                    {m.points.map((p) => (
                      <li key={p} className="flex gap-3 text-slate-700"><Icon.check className="mt-0.5 h-5 w-5 shrink-0 text-accent" />{p}</li>
                    ))}
                  </ul>
                </Reveal>
                <Reveal delay={120} className={`min-w-0 lg:col-span-7 ${flip ? "lg:order-1" : ""}`}>
                  <BrowserFrame slot={m.slot} alt={`Averiqo ${m.eyebrow}`} />
                </Reveal>
              </div>
            </section>
          );
        })}

        {/* Mobile */}
        <section id="mobile" className="relative overflow-hidden bg-navy-900 py-24 text-white lg:py-32">
          <div className="grid-lines pointer-events-none absolute inset-0 opacity-70" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 lg:grid-cols-2 lg:px-8">
            <Reveal>
              <Eyebrow dark>Mobile app experience</Eyebrow>
              <h2 className="font-display mt-4 text-4xl font-semibold sm:text-5xl">The whole business, in your pocket.</h2>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/65">
                Create an invoice on site, snap a receipt for OCR, check today's tasks or reply to a client — the same workspace, designed for your phone.
              </p>
              <ul className="mt-8 grid max-w-lg gap-3 sm:grid-cols-2">
                {["Create quotes & invoices", "Scan documents with OCR", "Tasks and work orders", "WhatsApp sharing"].map((p) => (
                  <li key={p} className="flex gap-2.5 text-white/80"><Icon.check className="mt-0.5 h-5 w-5 shrink-0 text-signal" />{p}</li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={120} className="flex items-end justify-center gap-4 sm:gap-6">
              <PhoneFrame slot="mobile-invoice" alt="Create invoice on mobile" className="hidden translate-y-8 !w-[200px] sm:block" />
              <PhoneFrame slot="mobile-dashboard" alt="Averiqo mobile overview" />
              <PhoneFrame slot="mobile-tasks" alt="Tasks on mobile" className="hidden translate-y-8 !w-[200px] sm:block" />
            </Reveal>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="bg-white py-24 lg:py-32">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Pricing</Eyebrow>
              <h2 className="font-display mt-4 text-4xl font-semibold sm:text-5xl">Simple plans that grow with you.</h2>
              <p className="mt-5 text-lg text-slate-600">Start free. Upgrade when your team is ready.</p>
            </Reveal>
            <Reveal className="mt-12"><PricingTable config={pricing} /></Reveal>
          </div>
        </section>

        {/* Testimonials — placeholders until real customer quotes exist */}
        <section className="border-y border-line bg-mist py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <Reveal className="max-w-2xl">
              <Eyebrow>Customer stories</Eyebrow>
              <h2 className="font-display mt-4 text-4xl font-semibold sm:text-5xl">What teams say about Averiqo.</h2>
            </Reveal>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <Reveal key={n} delay={n * 60}>
                  <figure className="flex h-full flex-col rounded-2xl border border-dashed border-slate-300 bg-white p-7">
                    <svg viewBox="0 0 24 24" className="h-6 w-6 text-slate-300" fill="currentColor" aria-hidden><path d="M9.5 6C6 7 4 9.8 4 13.5V18h6v-6H7c0-2.4 1.1-3.9 3.2-4.6zM19.5 6C16 7 14 9.8 14 13.5V18h6v-6h-3c0-2.4 1.1-3.9 3.2-4.6z" /></svg>
                    <blockquote className="mt-5 flex-1 text-slate-400">Customer testimonial placeholder. Replace with a real quote from a verified Averiqo customer.</blockquote>
                    <figcaption className="mt-6 flex items-center gap-3 border-t border-line pt-5">
                      <span className="h-10 w-10 rounded-full bg-slate-100" />
                      <span className="text-sm"><span className="block font-semibold text-slate-400">Customer name</span><span className="text-slate-400">Role, Company</span></span>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="bg-white py-24 lg:py-32">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-12 lg:px-8">
            <Reveal className="lg:col-span-4">
              <Eyebrow>FAQ</Eyebrow>
              <h2 className="font-display mt-4 text-4xl font-semibold">Questions, answered.</h2>
              <p className="mt-5 text-slate-600">Can't find what you need? <Link href="/signup" className="font-semibold text-accent hover:underline">Start a trial</Link> and explore it yourself.</p>
            </Reveal>
            <Reveal className="lg:col-span-8"><Faq /></Reveal>
          </div>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
              }),
            }}
          />
        </section>

        {/* Final CTA */}
        <section className="px-5 pb-24 lg:px-8">
          <Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-navy-900 px-6 py-20 text-center text-white sm:px-12">
            <div className="grid-lines pointer-events-none absolute inset-0" />
            <div className="relative">
              <h2 className="font-display mx-auto max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">Bring your whole business into one workspace.</h2>
              <p className="mx-auto mt-5 max-w-xl text-lg text-white/65">Start a free trial, set up your company and see everything working together.</p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/signup" className="btn btn-primary !px-6 !py-3.5">Start Free Trial <Icon.arrow className="h-4 w-4" /></Link>
                <Link href={DEMO_URL} className="btn btn-ghost-dark !px-6 !py-3.5">View Live Demo</Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
    </>
  );
}
