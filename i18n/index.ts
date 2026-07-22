/**
 * Public i18n surface. App code imports everything it needs from "@/i18n".
 */
export { default as i18n } from "./config";
export { LanguageProvider, useLanguage } from "./LanguageProvider";
export { useTranslation } from "./useTranslation";
export {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type AppLanguage,
} from "./languages";
export { detectDeviceLanguage } from "./detectDeviceLanguage";
export { pickLang, type LocalizedText } from "./pickLang";
export {
  LOCALE_BY_LANGUAGE,
  formatDate,
  formatDateTime,
  formatTime,
  formatWeekday,
  formatNumber,
  formatDecimal,
} from "./formatters";
