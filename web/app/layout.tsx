import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { StatStrip } from "@/components/StatStrip";

export const metadata: Metadata = {
  title: "Keel — durable workflow engine",
  description:
    "Postgres-backed workflow engine: leases, transactional outbox, dead letters, replay.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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
          <StatStrip />
          <main className="pb-20 pt-2">{children}</main>
        </div>
      </body>
    </html>
  );
}
