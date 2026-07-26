/**
 * Language registry — the single source of truth for which languages the app
 * supports. Swedish is the default and the fallback (spec §11.5: mobile
 * mirrors the web's sv-default behaviour). `label`/`nativeLabel` live here,
 * NOT in the translation resources, so a future language switcher can list
 * languages without any locale being loaded.
 */
export const SUPPORTED_LANGUAGES = [
  { code: "sv", label: "Svenska", nativeLabel: "Svenska" },
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "da", label: "Dansk", nativeLabel: "Dansk" },
] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

/** Default + fallback language. Swedish, always. */
export const DEFAULT_LANGUAGE: AppLanguage = "sv";

export const SUPPORTED_LANGUAGE_CODES: readonly AppLanguage[] = SUPPORTED_LANGUAGES.map(
  (l) => l.code,
);

/** Narrows an arbitrary string (stored value, device locale) to an AppLanguage. */
export function isSupportedLanguage(code: string | null | undefined): code is AppLanguage {
  return code != null && (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(code);
}
