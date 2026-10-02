"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { Meta } from "@/lib/types";

type UI = {
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  meta: Meta | null;
  readonly: boolean;
  readonlyReason: string;
  apiDown: boolean;
};

const Ctx = createContext<UI | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .meta()
        .then((m) => {
          if (!alive) return;
          setMeta(m);
          setApiDown(false);
        })
        .catch(() => alive && setApiDown(true));
    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const readonly = meta?.readonly ?? false;
  const readonlyReason = readonly
    ? "Read-only demo — mutations are disabled on this instance. Clone the repo to start and replay runs."
    : "";

  return (
    <Ctx.Provider
      value={{ paletteOpen, setPaletteOpen, helpOpen, setHelpOpen, meta, readonly, readonlyReason, apiDown }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useUI() {
  const v = useContext(Ctx);
  if (!v) throw new Error("UIProvider missing");
  return v;
}
