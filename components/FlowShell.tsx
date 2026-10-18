import Link from "next/link";
import { Logo } from "./Logo";

const steps = ["Account", "Plan & payment", "Company", "Setup"];

export function FlowShell({
  step,
  title,
  subtitle,
  children,
  aside,
}: {
  step?: number;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          {step !== undefined ? (
            <ol className="hidden items-center gap-2 text-xs font-medium sm:flex" aria-label="Progress">
              {steps.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span
                    aria-current={i === step ? "step" : undefined}
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                      i < step ? "bg-navy-900 text-white" : i === step ? "bg-accent text-white" : "bg-mist text-slate-400 ring-1 ring-line"
                    }`}
                  >
                    {i < step ? "✓" : i + 1}
                  </span>
                  <span className={i === step ? "text-ink" : "text-slate-400"}>{s}</span>
                  {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line" />}
                </li>
              ))}
            </ol>
          ) : (
            <Link href="/" className="text-sm font-medium text-slate-500 hover:text-ink">Back to site</Link>
          )}
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-12 lg:grid-cols-12 lg:py-16">
        <div className={aside ? "lg:col-span-7" : "mx-auto w-full max-w-xl lg:col-span-12"}>
          {step !== undefined && <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-accent sm:hidden">Step {step + 1} of {steps.length}</div>}
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-3 text-slate-600">{subtitle}</p>}
          <div className="mt-8 rounded-2xl border border-line bg-white p-6 sm:p-8">{children}</div>
        </div>
        {aside && <aside className="lg:col-span-5">{aside}</aside>}
      </main>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{message}</p>;
}
