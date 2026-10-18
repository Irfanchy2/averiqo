import Image from "next/image";
import { findScreenshot, type Slot } from "@/lib/screenshots";
import { AppMock, MobileMock } from "./AppMock";
import { FitWidth } from "./FitWidth";

/** Desktop browser frame. Shows the real screenshot when present, otherwise the UI preview. */
export function BrowserFrame({
  slot,
  alt,
  priority = false,
  className = "",
}: {
  slot: Slot;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  const src = findScreenshot(slot);
  return (
    <div className={`overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_30px_80px_-30px_rgba(6,11,24,0.45)] ${className}`}>
      <div className="flex h-9 items-center gap-1.5 border-b border-line bg-mist px-3.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#d9dee8]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#d9dee8]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#d9dee8]" />
        <div className="mx-auto flex h-5 w-1/2 max-w-xs items-center justify-center rounded-md bg-white text-[10px] text-slate-400">
          app.averiqo.com
        </div>
      </div>
      {src ? (
        <Image src={src} alt={alt} width={1600} height={1000} priority={priority} className="block h-auto w-full" sizes="(min-width: 1024px) 1100px, 100vw" />
      ) : (
        <FitWidth width={880}>
          <AppMock slot={slot} label={alt} />
        </FitWidth>
      )}
    </div>
  );
}

/** Phone frame for mobile screenshots. */
export function PhoneFrame({ slot, alt, className = "" }: { slot: Slot; alt: string; className?: string }) {
  const src = findScreenshot(slot);
  return (
    <div className={`relative w-[240px] rounded-[2.4rem] border border-white/10 bg-navy-950 p-2.5 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)] ${className}`}>
      <div className="absolute left-1/2 top-4 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-navy-950" />
      <div className="aspect-[9/19.5] overflow-hidden rounded-[1.9rem] bg-white">
        {src ? (
          <Image src={src} alt={alt} width={600} height={1300} className="h-full w-full object-cover object-top" sizes="240px" />
        ) : (
          <MobileMock slot={slot} label={alt} />
        )}
      </div>
    </div>
  );
}
