/**
 * Customer-facing copy, copied EXACTLY from Nutri-Frontend's
 * src/lib/i18n/translations.ts (Swedish variants — the web app's default
 * language). Keys are noted so a future full i18n port (the web's
 * translations.ts is pure TS and portable as-is) can replace this module
 * without hunting for hardcoded strings. Do not invent copy here — every
 * string must trace back to a web translation key.
 */
export const heroCopy = {
  /** hero.headline1 */
  headline1: "Hela råvaror.",
  /** hero.headline2 */
  headline2: "Beräknat för dig.",
  /** hero.seeMenu */
  seeMenu: "Se menyn",
  /** hero.nutriCustomize */
  nutriCustomize: "Nutri anpassar",
  /** hero.myProfile */
  myProfile: "Min profil",
  /** hero.today */
  today: "IDAG",
  /** hero.fallbackLocation */
  fallbackLocation: "PREMIÄR",
} as const;

export const menuCopy = {
  /** menu.category.* */
  categories: {
    frukost: "Frukost",
    huvudmaltider: "Huvudmåltider",
    mellanmal: "Mellanmål",
    shakes: "Shakes",
    dryck: "Dryck",
  },
  /** menu.empty */
  empty: "Menyn är tom just nu.",
  /** menu.retry */
  retry: "Försök igen",
  /** menu.stock.soldOutToday */
  soldOutToday: "Slut idag",
  /** menu.stock.left — "{count} kvar" */
  stockLeft: (count: number) => `${count} kvar`,
  /** menu.stock.sizeSoldOut — "{size} slut" */
  sizeSoldOut: (size: string) => `${size} slut`,
  /** menu.breakfast.served */
  breakfastServed: "Frukost serveras 10–11.",
  /** menu.itemCount.one / .other — "{count} vara/varor" */
  itemCount: (count: number) => (count === 1 ? `${count} vara` : `${count} varor`),
  /** meal.macro.carbsShort / fatShort / caffeineShort */
  carbsShort: "kolh",
  fatShort: "fett",
  caffeineShort: "koffein",
} as const;
