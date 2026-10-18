import fs from "node:fs";
import path from "node:path";

/**
 * Screenshot slots. Drop a real Averiqo screenshot into public/screenshots/
 * named after the slot (e.g. crm.png, mobile-dashboard.webp) and it replaces
 * the built-in UI preview on the next build/dev reload.
 */
export const SLOTS = [
  "dashboard",
  "crm",
  "invoices",
  "projects",
  "employees",
  "documents",
  "vehicles",
  "reports",
  "whatsapp",
  "ai",
  "companies",
  "mobile-dashboard",
  "mobile-invoice",
  "mobile-tasks",
] as const;

export type Slot = (typeof SLOTS)[number];

const EXTS = ["webp", "png", "jpg", "jpeg", "avif"];
const DIR = path.join(process.cwd(), "public", "screenshots");

export function findScreenshot(slot: Slot): string | null {
  for (const ext of EXTS) {
    if (fs.existsSync(path.join(DIR, `${slot}.${ext}`))) return `/screenshots/${slot}.${ext}`;
  }
  return null;
}
