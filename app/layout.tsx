import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Averiqo — The Business Operating System",
    template: "%s · Averiqo",
  },
  description:
    "Run your entire business from one intelligent workspace. CRM, invoicing, projects, employees, documents, assets, reports, WhatsApp and AI automation in Averiqo.",
  openGraph: {
    title: "Averiqo — The Business Operating System",
    description: "Run your entire business from one intelligent workspace.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a1226",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
