import { defineRouting } from "next-intl/routing";

export const locales = ["zh", "en"] as const;
export const defaultLocale = "zh";
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale,
});
