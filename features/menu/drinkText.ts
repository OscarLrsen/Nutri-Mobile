import type { AppLanguage } from "@/i18n/languages";
import { pickLang } from "@/i18n/pickLang";
import type { ApiDrink } from "@/services/api/drinks";

/**
 * The customer-facing name and description of a drink, in the app's active
 * language.
 *
 * WHY THIS EXISTS. Drink copy lives in the product catalogue, not in the
 * locale files — an admin writes it per product, so it cannot be a
 * translation key. Before the backend grew Name/Description En/Da columns,
 * components rendered `drink.description` straight from the API, which is
 * why an English app showed "Vatten med kolsyra" under Loka. Every screen
 * that shows drink copy now goes through here instead, so a new screen gets
 * the language handling for free rather than reintroducing the bug.
 *
 * FALLBACK comes from pickLang and is shared with every other localized
 * backend field: active language → Swedish (the base language every publish
 * flow requires) → the first non-empty variant. Whitespace-only counts as
 * missing, so a half-filled admin form falls back instead of rendering an
 * empty line. The result is always a string — a caller can never render
 * undefined or a raw key through this.
 *
 * NOT FOR KEYING. These are display values. Anything that identifies a
 * product — the GoWell flavour visual lookup, cart line ids, order payload
 * mapping — must keep using `drink.name`, the Swedish base copy, so that
 * translating a flavour cannot silently change behaviour.
 */

export function drinkName(drink: ApiDrink, language: AppLanguage): string {
  return pickLang(
    { sv: drink.name, en: drink.nameEn, da: drink.nameDa },
    language
  );
}

export function drinkDescription(drink: ApiDrink, language: AppLanguage): string {
  return pickLang(
    { sv: drink.description, en: drink.descriptionEn, da: drink.descriptionDa },
    language
  );
}
