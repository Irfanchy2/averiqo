"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { Icon } from "./Icons";
import { nav } from "@/lib/site";

export function Header({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const dark = variant === "dark" && !scrolled;
  const shell = dark
    ? "bg-transparent border-transparent"
    : variant === "dark"
      ? "bg-navy-900/95 border-white/10 backdrop-blur"
      : "bg-white/95 border-line backdrop-blur";
  const onDark = variant === "dark";

  return (
    <header className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${shell}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Logo dark={onDark} />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={`text-sm font-medium transition-colors ${onDark ? "text-white/70 hover:text-white" : "text-slate-600 hover:text-ink"}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login" className={`text-sm font-medium ${onDark ? "text-white/80 hover:text-white" : "text-slate-700 hover:text-ink"}`}>Log in</Link>
          <Link href="/signup" className={`btn !py-2 !text-sm ${onDark ? "btn-light" : "btn-primary"}`}>Start Free Trial</Link>
        </div>
        <button
          className={`md:hidden ${onDark ? "text-white" : "text-ink"}`}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <Icon.close className="h-6 w-6" /> : <Icon.menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div className={`border-t px-5 pb-6 pt-2 md:hidden ${onDark ? "border-white/10 bg-navy-900" : "border-line bg-white"}`}>
          {nav.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`block py-3 text-base font-medium ${onDark ? "text-white/80" : "text-slate-700"}`}>
              {n.label}
            </Link>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link href="/login" className={`btn ${onDark ? "btn-ghost-dark" : "btn-ghost"}`}>Log in</Link>
            <Link href="/signup" className="btn btn-primary">Start Free Trial</Link>
          </div>
        </div>
      )}
    </header>
  );
}
