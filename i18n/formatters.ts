import type { AppLanguage } from "./languages";

/**
 * Central locale formatting. The ONLY place that maps an app language to an
 * Intl locale — user-visible date/time/number/currency formatting must go
 * through these helpers (or utils/money.formatPriceKr, which delegates
 * here). No component should call toLocale/Intl APIs with a hardcoded
 * "sv-SE".
 *
 * Currency note: prices are always SEK. All three languages render "129 kr"
 * (uniform brand presentation; avoids Danish "kr." being read as DKK and
 * English "SEK 129" feeling foreign at the till) — only the digit grouping
 * and decimal separator follow the active language.
 */
export const LOCALE_BY_LANGUAGE: Record<AppLanguage, string> = {
  sv: "sv-SE",
  en: "en-GB",
  da: "da-DK",
};

export function formatDate(
  date: Date,
  language: AppLanguage,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
): string {
  return date.toLocaleDateString(LOCALE_BY_LANGUAGE[language], options);
}

export function formatTime(
  date: Date,
  language: AppLanguage,
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  return date.toLocaleTimeString(LOCALE_BY_LANGUAGE[language], options);
}

export function formatWeekday(
  date: Date,
  language: AppLanguage,
  options: Intl.DateTimeFormatOptions = { weekday: "long" },
): string {
  return date.toLocaleDateString(LOCALE_BY_LANGUAGE[language], options);
}

/** Combined date+time formatting (e.g. weekday + clock time). */
export function formatDateTime(
  date: Date,
  language: AppLanguage,
  options: Intl.DateTimeFormatOptions,
): string {
  return date.toLocaleString(LOCALE_BY_LANGUAGE[language], options);
}

export function formatNumber(
  value: number,
  language: AppLanguage,
  options?: Intl.NumberFormatOptions,
): string {
  return value.toLocaleString(LOCALE_BY_LANGUAGE[language], options);
}

export function formatDecimal(
  value: number,
  language: AppLanguage,
  maximumFractionDigits = 1,
): string {
  return formatNumber(value, language, { maximumFractionDigits });
}
