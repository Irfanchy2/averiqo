import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradePilot AI — Trading Intelligence",
  description: "Explainable market-structure analysis, risk-managed paper trading and backtesting.",
};

export const viewport: Viewport = { themeColor: "#07090d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
