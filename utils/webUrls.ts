import * as WebBrowser from "expo-web-browser";

import { env } from "@/lib/env";
import type { AppLanguage } from "@/i18n";

/**
 * Policy/terms pages on the website, in the READER'S language.
 *
 * The site resolves `?lang=sv|en` (and persists it) — added together with
 * this helper, so the app's language survives into the browser view.
 * Danish is not on the website; it falls back to English deliberately
 * rather than serving a Dane the Swedish default. One helper, five former
 * hard-coded call sites — the slugs never appear inline again.
 */
export function policyUrl(
  page: "kopvillkor" | "integritet",
  language: AppLanguage,
): string {
  const lang = language === "sv" ? "sv" : "en";
  return `${env.EXPO_PUBLIC_WEB_URL}/${page}?lang=${lang}`;
}

/**
 * Opens a policy page WITHOUT leaving the app stuck.
 *
 * THE BUG THIS CLOSES. Policies opened via `Linking.openURL`, which
 * app-switches to the external browser: on iOS the customer lands in
 * Safari with no obvious way back, and mid-registration or mid-consent
 * that reads as "the app kicked me out". An in-app browser view
 * (SFSafariViewController / Android Custom Tabs via expo-web-browser)
 * keeps the app underneath: it has its own close button, respects the
 * safe area, handles internal web history itself, and the Android system
 * back dismisses it — the customer can ALWAYS return to exactly where
 * they were.
 *
 * Every policy entry point (My account, registration, the consent gate,
 * checkout) goes through here, so the behaviour cannot drift per screen.
 * Falls back to the system browser only if the in-app view cannot open.
 */
export async function openPolicy(
  page: "kopvillkor" | "integritet",
  language: AppLanguage,
): Promise<void> {
  const url = policyUrl(page, language);
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      createTask: false,
    });
  } catch {
    // Extremely rare (no browser view available) — the external browser is
    // still a working path back via the OS task switcher.
    const { Linking } = await import("react-native");
    await Linking.openURL(url).catch(() => {});
  }
}
