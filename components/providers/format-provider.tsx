"use client";

import { createContext, useContext, useMemo } from "react";
import { createFormatters, DEFAULT_REGIONAL, type Formatters, type RegionalSettings } from "@/lib/format";

const FormatContext = createContext<Formatters>(createFormatters(DEFAULT_REGIONAL));

export function FormatProvider({ regional, children }: { regional: RegionalSettings; children: React.ReactNode }) {
  const formatters = useMemo(() => createFormatters(regional), [regional]);
  return <FormatContext.Provider value={formatters}>{children}</FormatContext.Provider>;
}

/** Formatters bound to Settings → Date & Regional, for client components. */
export function useFormat() {
  return useContext(FormatContext);
}
