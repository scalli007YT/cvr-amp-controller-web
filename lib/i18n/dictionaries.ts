import "server-only";

import type { Locale } from "@/lib/i18n/config";

const dictionaries = {
  en: () => import("@/lib/i18n/locales/en.json").then((module) => module.default),
  de: () => import("@/lib/i18n/locales/de.json").then((module) => module.default)
};

export type Dictionary = Awaited<ReturnType<(typeof dictionaries)[Locale]>>;

export const getDictionary = async (locale: Locale): Promise<Dictionary> => dictionaries[locale]();
