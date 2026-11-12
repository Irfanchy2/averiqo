"use client";
import { useRef } from "react";
import { cn } from "@/lib/utils";

/** Pointer-reactive 3D tilt + specular glare (CSS in globals.css → .tile3d). No React state per move. */
export function Tilt({ children, className, max = 10 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${(px - 0.5) * 2 * max}deg`);
    el.style.setProperty("--rx", `${-(py - 0.5) * 2 * max}deg`);
    el.style.setProperty("--gx", `${px * 100}%`);
    el.style.setProperty("--gy", `${py * 100}%`);
    el.style.setProperty("--glare", "1");
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    for (const k of ["--rx", "--ry"]) el.style.setProperty(k, "0deg");
    el.style.setProperty("--glare", "0");
  };
  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} className={cn("tile3d", className)}>
      {children}
    </div>
  );
}
