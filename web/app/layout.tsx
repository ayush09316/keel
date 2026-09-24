import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { Nav } from "@/components/Nav";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Keel — durable workflow engine",
  description:
    "Postgres-backed workflow engine: leases, transactional outbox, dead letters, replay.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-bg text-fg antialiased">
        <header className="sticky top-0 z-10 border-b border-line bg-panel/95 backdrop-blur">
          <div className="mx-auto max-w-6xl px-5">
            <div className="flex items-baseline gap-3 pt-4">
              <h1 className="text-[17px] font-semibold tracking-tight">Keel</h1>
              <span className="font-mono text-[11px] text-muted">
                durable workflow engine · postgres-backed
              </span>
            </div>
            <Nav />
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-5">
          <main className="pb-20">{children}</main>
        </div>
      </body>
    </html>
  );
}
