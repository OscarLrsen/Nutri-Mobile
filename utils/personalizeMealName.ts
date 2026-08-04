import type { AppLanguage } from "@/i18n";

/**
 * "[Namn] + rättens namn" — presentation only.
 *
 * "Oscars Beef Power Bowl" is the wanted feeling. The FIRST name is used
 * (a full "Oscar Andersson Beef Power Bowl" is a sentence, not a dish), the
 * genitive follows the language — Swedish/Danish add "s" unless the name
 * already ends in an s-sound, English adds "'s" — and anything that would
 * read oddly (no name, a name with digits, an email-derived fallback, an
 * already-long name) falls back to the plain dish name.
 *
 * NEVER the stored product name: orders, history and the backend keep the
 * real name — see the call sites, which pass this to the UI only.
 */
export function personalizeMealName(
  mealName: string,
  displayName: string | null | undefined,
  language: AppLanguage,
): string {
  const first = (displayName ?? "").trim().split(/\s+/)[0] ?? "";

  // A usable first name: letters only (incl. diacritics), 2–14 chars —
  // e-mail fallbacks ("oscar.larsen@…"), digits and initials read wrong.
  if (!/^[\p{L}][\p{L}'-]{1,13}$/u.test(first)) return mealName;

  const endsInSSound = /[szx]$/i.test(first);

  if (language === "en") {
    return `${first}${endsInSSound ? "’" : "’s"} ${mealName}`;
  }

  // Swedish/Danish genitive: bare "s", nothing when the name already ends
  // in s/z/x ("Hans Beef Power Bowl").
  return `${first}${endsInSSound ? "" : "s"} ${mealName}`;
}
