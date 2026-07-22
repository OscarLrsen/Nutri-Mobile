import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";

import { DEFAULT_LANGUAGE } from "./languages";
import sv from "./locales/sv.json";
import en from "./locales/en.json";
import da from "./locales/da.json";

/**
 * The shared i18next instance and its bundled resources.
 *
 * A dedicated instance (createInstance) rather than the global singleton, so
 * this module fully owns its configuration. Swedish is both the initial
 * language and the fallback, so no lookup can ever resolve to null/undefined —
 * a missing key falls through to Swedish, and a missing Swedish key returns the
 * key string itself. Initialised synchronously (initAsync: false) with the
 * resources bundled inline, so the very first render already has strings
 * available — the LanguageProvider then updates the active language once it has
 * read the stored/device preference.
 *
 * These resources are the app's single source of customer-facing copy —
 * the legacy constants/copy.ts has been fully migrated and deleted.
 */
export const resources = {
  sv: { translation: sv },
  en: { translation: en },
  da: { translation: da },
} as const;

const i18n = createInstance();

// Resolves synchronously here (inline resources + initAsync:false); the promise
// is intentionally not awaited.
void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: ["sv", "en", "da"],
  defaultNS: "translation",
  ns: ["translation"],
  returnNull: false,
  returnEmptyString: false,
  interpolation: {
    // React Native renders text safely; i18next's HTML escaping is
    // unnecessary and would corrupt characters like & in copy.
    escapeValue: false,
  },
  // Resources are bundled inline (no async backend), so init synchronously —
  // t() is usable on the very first render without waiting on a callback.
  initAsync: false,
});

export default i18n;
