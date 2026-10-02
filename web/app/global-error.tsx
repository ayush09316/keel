"use client";

import { RotateCw } from "lucide-react";
import { useEffect } from "react";

import { Button, buttonClass } from "@/components/ui/button";
import { ErrorReference, StatusPage } from "@/components/ui/status-page";
import "./globals.css";

const THEME = `try{var t=localStorage.getItem('theme');document.documentElement.classList.add(t==='light'?'light':'dark')}catch(e){document.documentElement.classList.add('dark')}`;

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Something went wrong · Keel</title>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body className="font-sans antialiased">
        <StatusPage
          code="Application error"
          title="Keel's dashboard failed to load"
          description="A critical error stopped the shell from rendering. The engine and its database are unaffected — this is only the view."
          detail={<ErrorReference digest={error.digest} message={error.message} />}
          actions={
            <>
              <Button variant="primary" size="md" onClick={reset}>
                <RotateCw aria-hidden />
                Retry
              </Button>
              <a href="/" className={buttonClass("ghost", "md")}>
                Home
              </a>
            </>
          }
        />
      </body>
    </html>
  );
}
