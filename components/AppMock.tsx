import type { Slot } from "@/lib/screenshots";

/*
 * Built-in UI previews shown until real Averiqo screenshots are added to
 * public/screenshots/. All content is illustrative sample data, labelled as such.
 */

const modules = ["Dashboard", "CRM", "Sales", "Projects", "Employees", "Documents", "Assets", "Reports", "WhatsApp", "AI"];

const activeFor: Partial<Record<Slot, string>> = {
  dashboard: "Dashboard",
  crm: "CRM",
  invoices: "Sales",
  projects: "Projects",
  employees: "Employees",
  documents: "Documents",
  vehicles: "Assets",
  reports: "Reports",
  whatsapp: "WhatsApp",
  ai: "AI",
  companies: "Dashboard",
};

const titleFor: Partial<Record<Slot, string>> = {
  dashboard: "Good morning",
  crm: "Leads pipeline",
  invoices: "Invoices",
  projects: "Work orders",
  employees: "Team",
  documents: "Documents",
  vehicles: "Vehicles & assets",
  reports: "Reports",
  whatsapp: "WhatsApp inbox",
  ai: "Automations",
  companies: "Companies",
};

function Bar({ w, tone = "bg-slate-200" }: { w: string; tone?: string }) {
  return <span className={`block h-2 rounded-full ${tone}`} style={{ width: w }} />;
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "green" | "blue" | "amber" | "slate" }) {
  const map = {
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${map[tone]}`}>{children}</span>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-white p-3 ${className}`}>{children}</div>;
}

function Stat({ label }: { label: string }) {
  return (
    <Card>
      <div className="text-[9px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2"><Bar w="55%" tone="bg-slate-300" /></div>
      <div className="mt-2"><Bar w="35%" tone="bg-emerald-200" /></div>
    </Card>
  );
}

function Chart() {
  const h = [38, 52, 44, 61, 57, 70, 66, 78, 72, 84, 80, 90];
  return (
    <div className="flex h-24 items-end gap-1.5">
      {h.map((v, i) => (
        <div key={i} className={`flex-1 rounded-sm ${i === h.length - 1 ? "bg-accent" : "bg-blue-100"}`} style={{ height: `${v}%` }} />
      ))}
    </div>
  );
}

function Table({ cols, rows }: { cols: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="grid border-b border-line bg-mist px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-400" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
        {cols.map((c) => <span key={c}>{c}</span>)}
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid items-center border-b border-line px-3 py-2.5 text-[10px] text-slate-600 last:border-0" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
          {r.map((cell, j) => <span key={j} className="truncate pr-2">{cell}</span>)}
        </div>
      ))}
    </div>
  );
}

function Body({ slot }: { slot: Slot }) {
  switch (slot) {
    case "crm":
      return (
        <div className="grid grid-cols-4 gap-2.5">
          {["New", "Contacted", "Quoted", "Won"].map((stage, i) => (
            <div key={stage} className="rounded-lg bg-mist p-2">
              <div className="mb-2 flex items-center justify-between text-[10px] font-semibold text-slate-600">{stage}<span className="text-slate-400">{4 - i}</span></div>
              {Array.from({ length: 4 - i }).map((_, k) => (
                <Card key={k} className="mb-2 !p-2">
                  <Bar w="70%" tone="bg-slate-300" />
                  <div className="mt-1.5"><Bar w="45%" /></div>
                  <div className="mt-2 flex justify-between"><Pill tone={i === 3 ? "green" : "blue"}>{i === 3 ? "Won" : "Lead"}</Pill><span className="h-4 w-4 rounded-full bg-slate-200" /></div>
                </Card>
              ))}
            </div>
          ))}
        </div>
      );
    case "invoices":
      return (
        <Table
          cols={["Number", "Client", "Due", "Amount", "Status"]}
          rows={[
            ["INV-0001", <Bar key="a" w="80%" />, "—", <Bar key="b" w="60%" tone="bg-slate-300" />, <Pill key="c" tone="green">Paid</Pill>],
            ["INV-0002", <Bar key="a" w="70%" />, "—", <Bar key="b" w="50%" tone="bg-slate-300" />, <Pill key="c" tone="amber">Due</Pill>],
            ["QUO-0003", <Bar key="a" w="85%" />, "—", <Bar key="b" w="65%" tone="bg-slate-300" />, <Pill key="c" tone="blue">Quote</Pill>],
            ["INV-0004", <Bar key="a" w="60%" />, "—", <Bar key="b" w="40%" tone="bg-slate-300" />, <Pill key="c" tone="slate">Draft</Pill>],
            ["INV-0005", <Bar key="a" w="75%" />, "—", <Bar key="b" w="55%" tone="bg-slate-300" />, <Pill key="c" tone="green">Paid</Pill>],
          ]}
        />
      );
    case "projects":
      return (
        <div className="space-y-2">
          {[["WO-101", 82, "green"], ["WO-102", 54, "blue"], ["WO-103", 30, "amber"], ["WO-104", 12, "slate"]].map(([id, pct, tone]) => (
            <Card key={id as string} className="flex items-center gap-3">
              <span className="w-12 text-[10px] font-semibold text-slate-600">{id}</span>
              <div className="flex-1"><Bar w="60%" tone="bg-slate-300" /></div>
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
              <Pill tone={tone as "green"}>{pct as number}%</Pill>
            </Card>
          ))}
        </div>
      );
    case "employees":
      return (
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="flex items-center gap-2.5">
              <span className="h-8 w-8 shrink-0 rounded-full bg-slate-200" />
              <div className="flex-1 space-y-1.5"><Bar w="80%" tone="bg-slate-300" /><Bar w="50%" /></div>
              <Pill tone={i % 3 === 2 ? "amber" : "green"}>{i % 3 === 2 ? "Visa" : "Active"}</Pill>
            </Card>
          ))}
        </div>
      );
    case "documents":
      return (
        <div className="grid grid-cols-5 gap-2.5">
          <div className="col-span-2 rounded-lg border border-dashed border-slate-300 bg-mist p-3">
            <div className="mx-auto aspect-[3/4] w-3/4 space-y-1.5 rounded bg-white p-2 shadow-sm">
              {["90%", "60%", "75%", "40%", "85%", "55%"].map((w, i) => <Bar key={i} w={w} />)}
            </div>
          </div>
          <div className="col-span-3 space-y-2">
            <div className="text-[10px] font-semibold text-slate-600">Extracted by OCR</div>
            {["Vendor", "Document no.", "Date", "Total", "VAT"].map((f) => (
              <div key={f} className="flex items-center justify-between rounded-md border border-line px-2.5 py-2 text-[10px]">
                <span className="text-slate-400">{f}</span><Bar w="40%" tone="bg-blue-100" />
              </div>
            ))}
          </div>
        </div>
      );
    case "vehicles":
      return (
        <Table
          cols={["Asset", "Assigned", "Registration", "Service", "Status"]}
          rows={["VH-01", "VH-02", "EQ-03", "VH-04", "EQ-05"].map((a, i) => [
            a, <Bar key="a" w="70%" />, <Bar key="b" w="55%" />, <Bar key="c" w="45%" />,
            <Pill key="d" tone={i === 1 ? "amber" : "green"}>{i === 1 ? "Renew soon" : "Valid"}</Pill>,
          ])}
        />
      );
    case "reports":
      return (
        <div className="grid grid-cols-3 gap-2.5">
          <Card className="col-span-2"><div className="mb-3 text-[10px] font-semibold text-slate-600">Revenue vs. expenses</div><Chart /></Card>
          <Card>
            <div className="mb-3 text-[10px] font-semibold text-slate-600">By category</div>
            <div className="mx-auto h-20 w-20 rounded-full" style={{ background: "conic-gradient(#3d7bff 0 42%, #22c9a0 42% 68%, #c7d2fe 68% 86%, #e2e8f0 86%)" }}>
              <div className="relative left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
            </div>
          </Card>
          <Stat label="Receivables" /><Stat label="Payables" /><Stat label="Margin" />
        </div>
      );
    case "whatsapp":
      return (
        <div className="grid grid-cols-5 gap-2.5">
          <div className="col-span-2 space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`flex items-center gap-2 rounded-md p-2 ${i === 0 ? "bg-blue-50" : ""}`}>
                <span className="h-6 w-6 rounded-full bg-slate-200" /><div className="flex-1 space-y-1"><Bar w="70%" tone="bg-slate-300" /><Bar w="45%" /></div>
              </div>
            ))}
          </div>
          <div className="col-span-3 space-y-2 rounded-lg bg-mist p-3">
            <div className="w-3/5 rounded-lg rounded-tl-none bg-white p-2 text-[10px] text-slate-600">Hi, can you send the quotation?</div>
            <div className="ml-auto w-3/5 rounded-lg rounded-tr-none bg-emerald-100 p-2 text-[10px] text-emerald-900">Sure — QUO-0003 attached.</div>
            <div className="ml-auto flex w-3/5 items-center gap-2 rounded-lg bg-white p-2 text-[10px]"><span className="h-6 w-5 rounded bg-red-100" /> <Bar w="60%" /></div>
          </div>
        </div>
      );
    case "ai":
      return (
        <div className="space-y-2">
          {["When an invoice is overdue → send WhatsApp reminder", "When a lead is created → assign owner & create task", "When a document is uploaded → extract with OCR", "Every Monday → email weekly summary"].map((r, i) => (
            <Card key={r} className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-[10px] font-bold text-accent">AI</span>
              <span className="flex-1 text-[10px] text-slate-600">{r}</span>
              <span className={`h-3.5 w-6 rounded-full ${i === 3 ? "bg-slate-200" : "bg-accent"}`} />
            </Card>
          ))}
        </div>
      );
    case "companies":
      return (
        <div className="grid grid-cols-3 gap-2.5">
          {["Company A", "Company B", "Company C"].map((c, i) => (
            <Card key={c} className={i === 0 ? "ring-2 ring-accent" : ""}>
              <div className="flex items-center gap-2"><span className="h-7 w-7 rounded-md bg-navy-800" /><span className="text-[10px] font-semibold text-slate-700">{c}</span></div>
              <div className="mt-3 space-y-1.5"><Bar w="80%" /><Bar w="55%" /></div>
              <div className="mt-3"><Pill tone={i === 0 ? "blue" : "slate"}>{i === 0 ? "Current" : "Switch"}</Pill></div>
            </Card>
          ))}
        </div>
      );
    default:
      return (
        <div className="space-y-2.5">
          <div className="grid grid-cols-4 gap-2.5">
            <Stat label="Revenue" /><Stat label="Open invoices" /><Stat label="Active projects" /><Stat label="New leads" />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <Card className="col-span-2"><div className="mb-3 text-[10px] font-semibold text-slate-600">Cash flow</div><Chart /></Card>
            <Card>
              <div className="mb-2 text-[10px] font-semibold text-slate-600">Today</div>
              {["Follow up quote", "Approve leave", "Vehicle service"].map((t) => (
                <div key={t} className="flex items-center gap-2 border-b border-line py-1.5 text-[10px] text-slate-500 last:border-0"><span className="h-3 w-3 rounded border border-slate-300" />{t}</div>
              ))}
            </Card>
          </div>
          <Table
            cols={["Recent", "Customer", "Type", "Amount", "Status"]}
            rows={[
              ["INV-0005", <Bar key="a" w="70%" />, "Invoice", <Bar key="b" w="50%" tone="bg-slate-300" />, <Pill key="c" tone="green">Paid</Pill>],
              ["QUO-0006", <Bar key="a" w="80%" />, "Quotation", <Bar key="b" w="60%" tone="bg-slate-300" />, <Pill key="c" tone="blue">Sent</Pill>],
              ["WO-104", <Bar key="a" w="60%" />, "Work order", <Bar key="b" w="40%" tone="bg-slate-300" />, <Pill key="c" tone="amber">In progress</Pill>],
            ]}
          />
        </div>
      );
  }
}

export function AppMock({ slot, label }: { slot: Slot; label: string }) {
  const active = activeFor[slot] ?? "Dashboard";
  return (
    <div role="img" aria-label={`${label} (preview)`} className="flex aspect-[16/10] w-full select-none bg-white text-left">
      <aside className="hidden w-[18%] shrink-0 flex-col gap-0.5 bg-navy-900 p-2.5 sm:flex">
        <div className="mb-3 flex items-center gap-1.5 px-1.5 pt-1">
          <span className="h-4 w-4 rounded bg-white" /><span className="text-[10px] font-semibold text-white">Averiqo</span>
        </div>
        {modules.map((m) => (
          <div key={m} className={`rounded-md px-2 py-1.5 text-[9.5px] ${m === active ? "bg-white/10 font-semibold text-white" : "text-white/50"}`}>{m}</div>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-mist/60">
        <div className="flex items-center justify-between border-b border-line bg-white px-4 py-2.5">
          <span className="font-display text-[12px] font-semibold text-ink">{titleFor[slot] ?? "Dashboard"}</span>
          <div className="flex items-center gap-2">
            <span className="hidden h-5 w-32 rounded-md bg-mist sm:block" />
            <span className="rounded-md bg-accent px-2 py-1 text-[9px] font-semibold text-white">+ New</span>
            <span className="h-5 w-5 rounded-full bg-slate-200" />
          </div>
        </div>
        <div className="flex-1 overflow-hidden p-3.5"><Body slot={slot} /></div>
        <div className="px-4 pb-2 text-right text-[8px] uppercase tracking-widest text-slate-300">Preview · sample data</div>
      </div>
    </div>
  );
}

export function MobileMock({ slot, label }: { slot: Slot; label: string }) {
  const title = slot === "mobile-invoice" ? "New invoice" : slot === "mobile-tasks" ? "My tasks" : "Overview";
  return (
    <div role="img" aria-label={`${label} (preview)`} className="flex h-full flex-col bg-mist text-left">
      <div className="bg-navy-900 px-4 pb-4 pt-10">
        <div className="text-[9px] text-white/50">Averiqo</div>
        <div className="font-display text-[15px] font-semibold text-white">{title}</div>
      </div>
      <div className="flex-1 space-y-2 p-3">
        {slot === "mobile-invoice" ? (
          <>
            {["Client", "Items", "VAT", "Due date"].map((f) => (
              <div key={f} className="rounded-lg bg-white p-2.5"><div className="text-[8px] uppercase text-slate-400">{f}</div><div className="mt-1.5"><Bar w="60%" tone="bg-slate-300" /></div></div>
            ))}
            <div className="rounded-lg bg-accent p-2.5 text-center text-[10px] font-semibold text-white">Send via WhatsApp</div>
          </>
        ) : slot === "mobile-tasks" ? (
          ["Site visit", "Upload receipt", "Approve quote", "Call client", "Vehicle check"].map((t, i) => (
            <div key={t} className="flex items-center gap-2 rounded-lg bg-white p-2.5 text-[10px] text-slate-600">
              <span className={`h-3.5 w-3.5 rounded-full border ${i < 2 ? "border-accent bg-accent" : "border-slate-300"}`} />{t}
            </div>
          ))
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {["Revenue", "Due", "Leads", "Tasks"].map((s) => (
                <div key={s} className="rounded-lg bg-white p-2.5"><div className="text-[8px] uppercase text-slate-400">{s}</div><div className="mt-2"><Bar w="70%" tone="bg-slate-300" /></div></div>
              ))}
            </div>
            <div className="rounded-lg bg-white p-2.5"><Chart /></div>
            <div className="rounded-lg bg-white p-2.5 space-y-1.5"><Bar w="80%" /><Bar w="60%" /><Bar w="70%" /></div>
          </>
        )}
      </div>
      <div className="flex justify-around border-t border-line bg-white py-2.5">
        {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 w-5 rounded-full ${i === 0 ? "bg-accent" : "bg-slate-200"}`} />)}
      </div>
    </div>
  );
}
