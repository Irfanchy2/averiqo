export const faqs = [
  {
    q: "What is Averiqo?",
    a: "Averiqo is a business operating system: CRM, quotations, invoices, payments, projects, employees, documents, vehicles, reports, WhatsApp and AI automation in one workspace, so you don't have to stitch separate tools together.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Subscription plans start with a free trial so you can set up your company and try the modules before paying.",
  },
  {
    q: "Can I manage more than one company?",
    a: "Yes. The multi-company workspace lets you run separate companies, each with its own data, branding and documents, and switch between them from one login.",
  },
  {
    q: "Does Averiqo work on mobile?",
    a: "Yes. Averiqo is built for desktop and mobile, so you can create invoices, check tasks and upload documents from your phone.",
  },
  {
    q: "How does WhatsApp integration work?",
    a: "You can send quotations, invoices and reminders to clients on WhatsApp directly from Averiqo, and keep conversations linked to the right customer.",
  },
  {
    q: "What does the Founder Lifetime plan include?",
    a: "A one-time payment for long-term access to Averiqo as an early supporter, with no monthly fees. It is a limited offer.",
  },
  {
    q: "Can I switch plans or cancel?",
    a: "You can upgrade, downgrade or cancel your subscription from your account settings.",
  },
];

export function Faq() {
  return (
    <div className="divide-y divide-line border-y border-line">
      {faqs.map((f) => (
        <details key={f.q} className="group py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left font-display text-[1.05rem] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            {f.q}
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-slate-500 transition-transform group-open:rotate-45">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            </span>
          </summary>
          <p className="mt-3 max-w-3xl text-[0.95rem] leading-relaxed text-slate-600">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
