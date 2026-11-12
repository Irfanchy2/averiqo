// Minimal shadcn/ui-style primitives (same API conventions: cva variants + cn()).
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Tilt } from "../three/tilt";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-accent text-black hover:bg-accent/90 press3d",
        outline: "border border-line bg-transparent hover:bg-panel-2 text-fg press3d",
        ghost: "hover:bg-panel-2 text-muted hover:text-fg",
        bull: "bg-bull/90 text-black hover:bg-bull press3d",
        bear: "bg-bear/90 text-white hover:bg-bear press3d",
        danger: "bg-bear/15 text-bear border border-bear/40 hover:bg-bear/25 press3d",
      },
      size: { sm: "h-7 px-2.5", md: "h-8 px-3", lg: "h-10 px-4 text-sm", icon: "h-7 w-7" },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export function Button({ className, variant, size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-lg border border-line", className)} {...props} />;
}

export function CardHeader({ title, right, className }: { title: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between border-b border-line px-3 py-2", className)}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
      {right}
    </div>
  );
}

const badgeVariants = cva("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", {
  variants: {
    tone: {
      neutral: "bg-panel-2 text-muted",
      bull: "bg-bull/15 text-bull",
      bear: "bg-bear/15 text-bear",
      warn: "bg-warn/15 text-warn",
      info: "bg-accent/15 text-accent",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-8 w-full rounded-md border border-line bg-bg px-2 text-xs text-fg tabular-nums placeholder:text-muted/60 focus:border-accent focus:outline-none",
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn("h-8 rounded-md border border-line bg-bg px-2 text-xs text-fg focus:border-accent focus:outline-none", props.className)}
    />
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("flex gap-0.5 rounded-md bg-bg p-0.5", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
            value === it.value ? "bg-panel-2 text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <Tilt className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={cn("truncate text-sm font-semibold tabular-nums", className)}>{value}</div>
    </Tilt>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-6 text-center text-xs text-muted">{children}</div>;
}
