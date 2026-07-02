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
  /** menu.added */
  added: "Tillagd",
} as const;

export const cartCopy = {
  /** cart.title */
  title: "Varukorg",
  /** cart.count.meal.one / .other — "{count} rätt(er)" */
  countMeal: (count: number) => (count === 1 ? `${count} rätt` : `${count} rätter`),
  /** cart.count.drink.one / .other — "{count} dryck(er)" */
  countDrink: (count: number) => (count === 1 ? `${count} dryck` : `${count} drycker`),
  /** cart.item.custom */
  itemCustom: "Anpassad",
  /** cart.item.remove */
  itemRemove: "Ta bort",
  /** cart.qty.decrease / cart.qty.increase */
  qtyDecrease: "Minska antal",
  qtyIncrease: "Öka antal",
  /** cart.summaryHead */
  summaryHead: "Sammanfattning",
  /** cart.summary.subtotal / .pickup / .free / .total */
  summarySubtotal: "Delsumma",
  summaryPickup: "Upphämtning",
  summaryFree: "Gratis",
  summaryTotal: "Totalt",
  /** cart.empty.heading / .text / .cta / .subline */
  emptyHeading: "Din varukorg är tom",
  emptyText: "Lägg till en måltid från menyn för att komma igång.",
  emptyCta: "Se menyn",
  emptySubline: "Bygg din order och betala när du är redo.",
  /** cart.stock.outHeading / .outText */
  stockOutHeading: "Slut i lager",
  stockOutText: "0 kvar i lager",
} as const;

export const mealDetailCopy = {
  /** common.loading */
  loading: "Laddar",
  /** meal.notFound */
  notFound: "Måltid hittades inte",
  /** meal.backToMenu */
  backToMenu: "Tillbaka till menyn",
  /** meal.closedNote */
  closedNote:
    "Vi håller stängt just nu. Du kan lägga varan i kundvagnen och beställa när vi öppnar.",
  /** meal.nutrition */
  nutrition: "Näringsvärde",
  /** meal.chooseSize */
  chooseSize: "Välj storlek",
  /** meal.ingredients */
  ingredients: "Ingredienser",
  /** meal.allergyNote */
  allergyNote: "Har du en allergi? Prata med personalen.",
  /** meal.stock.soldOut */
  soldOut: "Slut",
  /** meal.size.medium / meal.size.large (small is customer-hidden) */
  sizeNames: { medium: "Mellan", large: "Stor" } as Record<string, string>,
  /** meal.sizeSoldOutChoose — "{size} slut — välj annan storlek" */
  sizeSoldOutChoose: (size: string) => `${size} slut — välj annan storlek`,
  /** meal.addWithStock — "Lägg till · {count} kvar" */
  addWithStock: (count: number) => `Lägg till · ${count} kvar`,
  /** menu.add / meal.macro.* */
  add: "Lägg till",
  macroProtein: "Protein",
  macroCarbs: "Kolhydrater",
  macroFat: "Fett",
  /** Hardcoded Swedish on the web /meny card (not translation keys there) */
  allergensLabel: "Allergener",
  noAllergens: "Inga registrerade allergener",
} as const;
