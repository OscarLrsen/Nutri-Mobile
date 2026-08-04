import { type AppLanguage } from "./languages";

/**
 * Picks the display value for a backend-localized field set (…Sv/…En/…Da
 * columns). Selection order: the active app language → Swedish (the base
 * language every publish flow requires) → the first non-empty value at
 * all. Whitespace-only counts as missing. Always returns a string — a UI
 * can never render undefined through this helper.
 */
export interface LocalizedText {
  sv: string | null | undefined;
  en: string | null | undefined;
  da: string | null | undefined;
}

export function pickLang(text: LocalizedText, language: AppLanguage): string {
  const candidates = [text[language], text.sv, text.en, text.da];
  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) return candidate;
  }
  return "";
}
