/**
 * Stable internal re-export of the translation hook. App code should import
 * `useTranslation` from "@/i18n" rather than from react-i18next directly, so
 * the underlying engine stays swappable and the import surface is consistent.
 */
export { useTranslation } from "react-i18next";
