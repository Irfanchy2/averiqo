"use client";

import { useEffect, useRef, useState } from "react";

/** Renders children at a fixed design width and scales them down to fit narrow screens. */
export function FitWidth({ width, children }: { width: number; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>();

  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const ro = new ResizeObserver(() => {
      const s = Math.min(1, o.clientWidth / width);
      setScale(s);
      setHeight(i.offsetHeight * s);
    });
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={outer} style={{ height }} className="overflow-hidden">
      <div ref={inner} style={scale < 1 ? { width, transform: `scale(${scale})`, transformOrigin: "top left" } : undefined}>
        {children}
      </div>
    </div>
  );
}
