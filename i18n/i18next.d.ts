import "i18next";

/**
 * Types t() keys against the Swedish resource (the source-of-truth key set),
 * giving autocomplete and catching typos/missing keys at compile time. Because
 * en/da are validated to share sv's exact key structure (npm run i18n:check),
 * typing against sv alone is sufficient for every locale.
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: typeof import("./locales/sv.json");
    };
  }
}
