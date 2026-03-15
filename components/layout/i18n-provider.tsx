"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const I18nContext = createContext<Dictionary | null>(null);

export function I18nProvider({ dictionary, children }: { dictionary: Dictionary; children: ReactNode }) {
  return <I18nContext.Provider value={dictionary}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const dictionary = useContext(I18nContext);
  if (!dictionary) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return dictionary;
}
