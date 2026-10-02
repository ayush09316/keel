"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";

import { UIProvider } from "./ui-context";

function Toasts() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === "light" ? "light" : "dark"}
      position="bottom-right"
      offset={{ bottom: 20, right: 20 }}
      mobileOffset={{ bottom: 84 }}
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border-border !bg-surface !text-fg !shadow-pop !font-sans",
          description: "!text-fg-muted !font-mono !text-[12px]",
          actionButton: "!bg-fg !text-bg !rounded-md",
        },
      }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <Tooltip.Provider delayDuration={250}>
        <UIProvider>
          {children}
          <Toasts />
        </UIProvider>
      </Tooltip.Provider>
    </ThemeProvider>
  );
}
