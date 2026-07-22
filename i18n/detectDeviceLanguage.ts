import { getLocales } from "expo-localization";

import { DEFAULT_LANGUAGE, isSupportedLanguage, type AppLanguage } from "./languages";

/**
 * Best-effort device-language detection. Walks the device's ordered locale
 * list and returns the first one the app supports (sv/en/da); falls back to
 * Swedish when the device language is anything else, or if the platform API
 * is unavailable. Never throws.
 */
export function detectDeviceLanguage(): AppLanguage {
  try {
    for (const locale of getLocales()) {
      const code = locale.languageCode?.toLowerCase();
      if (isSupportedLanguage(code)) return code;
    }
  } catch {
    // getLocales can throw on some platforms/edge cases — fall back safely.
  }
  return DEFAULT_LANGUAGE;
}
