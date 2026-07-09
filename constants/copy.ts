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

export const checkoutCopy = {
  /** cart.closed.heading / .text */
  closedHeading: "Vi håller stängt nu",
  closedText: "Du kan inte slutföra beställningen förrän vi öppnar.",
  /** cart.openAt / .openToday / .openOn — "{time}" / "{when}" */
  openAt: (time: string) => `Vi öppnar kl. ${time}`,
  openToday: (time: string) => `Öppnar idag kl. ${time}`,
  openOn: (when: string) => `Öppnar ${when}`,
  /** Hardcoded Swedish on the web varukorg page (not translation keys there) */
  noteHead: "Något vi bör veta? (valfritt)",
  notePlaceholder: "T.ex. ingen rödlök, sås vid sidan",
  /** cart.payment.heading */
  paymentHeading: "Betalningsmetod",
  /** cart.payment.payAtPickup / .sub */
  payAtPickup: "Betala i kassan",
  payAtPickupSub: "Betala vid upphämtning hos foodtrucken",
  /** cart.payment.payOnline / .sub */
  payOnline: "Betala online",
  payOnlineSub: "Kort, Apple Pay och Google Pay via Stripe",
  /** cart.payment.swish / .comingSoon */
  swish: "Swish",
  comingSoon: "Kommer snart",
  /** cart.payment.onlineDrinksOnly */
  onlineDrinksOnly:
    "Onlinebetalning är tillgänglig när du beställer mat. Dryck kan betalas i kassan.",
  /** cart.info.heading / .text */
  infoHeading: "Betala i kassan när du hämtar",
  infoText: "Din order reserveras i 10 minuter. Maten börjar inte tillagas förrän du betalat.",
  /** cart.cta.reserveAmount / .payOnline — "{amount} kr" */
  ctaReserve: (amount: string) => `Reservera order — ${amount} kr`,
  ctaPayOnline: (amount: string) => `Betala ${amount} kr online`,
  /** cart.cta.cannotReserve / .loginToReserve */
  ctaCannotReserve: "Kan inte reservera",
  ctaLoginToReserve: "Logga in för att reservera",
  /** cart.closedNow / .pausedNow / .loading / .submitting / .redirecting */
  closedNow: "Stängt just nu",
  pausedNow: "Pausad just nu",
  loading: "Laddar...",
  submitting: "Beställer...",
  redirecting: "Skickar dig till betalning...",
  /** cart.accountRequired.title / .body / .cta */
  accountRequiredTitle: "Konto krävs för att reservera",
  accountRequiredBody:
    "Det tar under 30 sekunder och din varukorg sparas under tiden. Med konto ser du din orderstatus och kan spara dina mål.",
  accountRequiredCta: "Logga in / skapa konto →",
  /** cart.unavailable.heading / .text */
  unavailableHeading: "Vissa varor är inte tillgängliga",
  unavailableText: "Uppdatera din varukorg innan du kan reservera ordern.",
  /** cart.activeReservation.title / .body / .viewOrder */
  activeReservationTitle: "Du har redan en aktiv reservation",
  activeReservationBody:
    "Visa den i kassan. Vill du lägga till något mer, säg till i kassan innan du betalar.",
  activeReservationViewOrder: "Visa aktiv order →",
  /** cart.terms.prefix / .link */
  termsPrefix: "Genom att reservera en order godkänner du våra ",
  termsLink: "köpvillkor",
  /** cart.surcharge — "+{amount} kr tillägg" */
  surcharge: (amount: number) => `+${amount} kr tillägg`,
  /** cart.error.* */
  errorGeneric: "Något gick fel",
  errorStripeStartFailed: "Kunde inte starta onlinebetalningen. Försök igen.",
  errorJustClosed: "Vi har precis stängt eller pausat. Försök igen senare.",
  errorOutOfStockNamed: (name: string) =>
    `Tyvärr, ${name} hann precis ta slut. Ta bort den från varukorgen eller välj en annan rätt.`,
  errorOutOfStockGeneric:
    "Tyvärr, en vara i din varukorg hann precis ta slut. Ta bort den eller välj något annat.",
} as const;

export const authCopy = {
  /** auth.login.* */
  loginTitle: "Välkommen tillbaka",
  loginSubtitle: "Logga in och fortsätt din Nutri-plan",
  email: "E-post",
  password: "Lösenord",
  emailPlaceholder: "namn@email.com",
  forgot: "Glömt lösenord?",
  loginCta: "Logga in",
  loginPrompt: "Har du inget konto?",
  createAccount: "Skapa konto",
  security: "Krypterad inloggning · Vi delar aldrig dina uppgifter",
  loginErrorWrong: "Felaktigt e-post eller lösenord",
  showPassword: "Visa lösenord",
  hidePassword: "Dölj lösenord",
  /** auth.validation.* */
  emailRequired: "Ange din e-post",
  emailInvalid: "Ogiltig e-postadress",
  passwordRequired: "Skriv ditt lösenord",
  /** auth.register.* */
  registerTitle: "Skapa konto",
  registerSubtitle: "Skapa din Nutri-profil och få en personlig plan",
  firstName: "Förnamn",
  lastName: "Efternamn",
  firstNamePlaceholder: "Anna",
  lastNamePlaceholder: "Lindqvist",
  optional: "(valfritt)",
  nameHelper: "Vi använder ditt namn för att göra profilen personlig.",
  continue: "Fortsätt",
  haveAccount: "Har du redan ett konto?",
  navLogin: "Logga in",
  navLogout: "Logga ut",
  firstNameRequired: "Skriv ditt förnamn för att fortsätta",
  changeEmail: "Ändra e-post",
  registerPasswordRequired: "Skriv ett lösenord",
  passwordTooShort: "Minst 6 tecken",
  /** auth.register.strength.0–4 */
  strength: ["Skriv ett lösenord", "Svagt", "Okej", "Bra", "Starkt"],
  marketingLabel: "Få launch-erbjudanden och uppdateringar från Nutri.",
  marketingHint: "Du kan avregistrera dig när som helst.",
  duplicatePrefix: "Det finns redan ett konto med denna e-postadress. ",
  duplicateLogin: "Logga in istället",
  errorRateLimit: "För många registreringsförsök. Vänta en stund och försök igen.",
  errorInvalidEmail: "Ogiltig e-postadress.",
  /** auth.reset.error.generic fallback used by web StepCredentials */
  errorGeneric: "Något gick fel. Försök igen.",
  termsPrefix: "Genom att skapa ett konto godkänner du Nutris villkor och ",
  termsPrivacy: "integritetspolicy",
  inboxHeading: "Kolla din inkorg!",
  inboxPrefix: "Vi har skickat ett verifieringsmail till ",
  inboxSuffix: ". Klicka på länken i mailet för att aktivera ditt konto.",
  checking: "Kontrollerar…",
  verified: "Jag har verifierat",
  noSession:
    "Vi hittar ingen verifierad session ännu. Kontrollera länken i mailet och försök igen.",
  noMail: "Inget mail?",
  retry: "Försök igen",
  /** hamburger.guest — web varukorg's fallback customer name */
  guest: "Gäst",
} as const;

export const orderStatusCopy = {
  /** orderStatus.* — full set for the Feature 8 order-status screen. Every
   * string traces to a web translation key (sv variant). */
  notFoundTitle: "Order hittades inte",
  notFoundCta: "Gå till menyn",
  orderNumber: "Ordernummer",
  showNumber: "Visa detta nummer i kassan",
  countdownExpired: "Reservationstiden har löpt ut",
  countdownLeft: "kvar att betala i kassan",
  stripePendingTitle: "Väntar på onlinebetalning",
  stripePendingBody: "Slutför betalningen för att köket ska få din order.",
  stripePendingReservation: "reservationen hålls",
  expiredTitle: "Order förfallen",
  expiredBody: "Reservationen gick ut innan betalning genomfördes.",
  expiredNewOrder: "Lägg ny order",
  /** orderStatus.expired.home */
  expiredHome: "Tillbaka till start",
  cancelledTitle: "Order avbruten",
  cancelledBody: "Den här beställningen är inte aktiv längre.",
  activeTitle: "Beställning mottagen",
  completedTitle: "Beställning hämtad",
  completedBody: (number: number) => `Order #${number} är avslutad.`,
  /** orderStatus.step.* */
  stepReceived: "Mottagen",
  stepPreparing: "Tillagas",
  stepPickup: "Hämtas",
  stepReadyPickup: "Klar för hämtning",
  stepPickedUp: "Hämtad",
  /** orderStatus.payStep.* — vertical stepper on the pay-at-counter state */
  payStepAwaiting: "Väntar på betalning",
  payStepPreparing: "Förbereder",
  payStepReady: "Redo",
  /** orderStatus.status.unknown */
  statusUnknown: "Okänd status",
  /** orderStatus.fetchError.short / .long */
  fetchErrorShort: "Kan inte uppdatera status.",
  fetchErrorLong: "Kan inte uppdatera status – visar senast kända status.",
  /** orderStatus.active.* */
  activeWaitLabel: "Beräknad väntetid:",
  activeReadyToPickup: "Klar att hämtas",
  activeWaitMinutes: (minutes: number) => `ca ${minutes} min`,
  activeRemaining: "kvar",
  activeReadyNow: "Klar!",
  /** orderStatus.section.* */
  sectionStatus: "Status",
  sectionOrderSummary: "Din beställning",
  sectionPickup: "Upphämtning",
  sectionOrder: "Beställning",
  sectionLogged: "Loggat",
  /** orderStatus.pickup.* */
  pickupTitle: "Visa ordernummer vid hämtning",
  pickupBody: "Presentera detta nummer när din beställning är klar.",
  /** orderStatus.proteinLoggedToday / .loggedBadge */
  proteinLoggedToday: "protein loggat idag",
  loggedBadge: "Loggat",
  /** orderStatus.orderDetails */
  orderDetails: "Orderdetaljer",
  /** orderStatus.confirmationSent — "Bekräftelse skickad till {email}" */
  confirmationSent: (email: string) => `Bekräftelse skickad till ${email}`,
  /** orderStatus.date.today — "idag {time}" */
  dateToday: (time: string) => `idag ${time}`,
  /** orderStatus.orderAgain */
  orderAgain: "Beställ igen",
  total: "Totalt",
  toMenu: "Till menyn",
  /** orderStatus.size.* */
  sizeNames: { small: "Liten", medium: "Mellan", large: "Stor" } as Record<string, string>,
} as const;

export const nutriAnpassarCopy = {
  /** nutriAnpassar.* — sv variants, key-for-key from translations.ts */
  step2: "Steg 2",
  protein: "Protein",
  targetLabel: "Mål:",
  /** nutriAnpassar.slot.{Frukost|Lunch|Middag|Mellanmål} — sv labels equal the slot ids */
  slotNames: {
    Frukost: "Frukost",
    Lunch: "Lunch",
    Middag: "Middag",
    Mellanmål: "Mellanmål",
  } as Record<string, string>,
  chooseSlotAria: (slot: string) => `Välj ${slot}`,
  slotAdapted: "Anpassad efter ditt dagsmål",
  slotChooseMealType: "Välj måltidstyp",
  slotOpensAt: (hour: number) => `Öppnar kl ${hour}`,
  slotServed: (window: string) => `Serveras ${window}`,
  slotHeroTitle: "Vi räknar åt dig.",
  slotHeroSubtitle: "Välj måltid — Nutri anpassar portionen efter ditt mål.",
  slotClosedTitle: "Foodtrucken är stängd just nu",
  slotClosedBody:
    "Du kan fortfarande titta på måltider och planera din beställning. Beställning och betalning öppnar när vi har öppet.",
  slotBasedOnGoal: "Baserat på ditt mål:",
  slotProteinPerDay: (protein: number) => `${protein}g protein/dag`,
  remainingGoalReachedTitle: "Du har nått ditt mål för idag",
  remainingGoalReachedSub:
    "Vi kan fortfarande rekommendera något lätt om du vill finjustera balansen",
  remainingLowEnergyTitle: "Du har lite energi kvar men saknar fortfarande protein",
  remainingLowEnergySub: "Nutri prioriterar en lättare måltid med högt protein",
  remainingLeftToday: (calories: number, protein: number) =>
    `Du har ${calories} kcal och ${protein}g protein kvar idag`,
  remainingLightMeal: "En lätt måltid rekommenderas",
  mealsChangeMeal: "Byt måltid",
  mealsHeroTitle: "Ditt bästa val idag",
  mealsNearGoal: "Du är nära ditt mål — en lätt måltid rekommenderas",
  /** nutriAnpassar.optionWord.* */
  optionWords: {
    Frukost: "frukostalternativ",
    Lunch: "lunchalternativ",
    Middag: "middagsalternativ",
    Mellanmål: "mellanmålsalternativ",
  } as Record<string, string>,
  mealsWhy: (optionWord: string) =>
    `Bäst matchning av dina ${optionWord} — fyller ditt proteinmål utan att spränga kcal.`,
  mealsLoading: "Anpassar måltider…",
  mealsEmptyTitle: (slot: string) => `Inga måltider tillgängliga för ${slot} just nu`,
  mealsEmptyBody: "Det finns inga rätter med ingrediensdata för det här slottet. Prova ett annat mål.",
  mealsEmptyCta: "Välj ett annat mål",
  matchClose: "Nära ditt proteinmål",
  matchGood: "Bra matchning",
  matchBest: "Bästa tillgängliga match",
  mealsBestForGoal: "Bäst för ditt mål",
  mealsHideMacrosAria: "Dölj makros",
  mealsMacros: "Makros",
  carbsShort: "kolh",
  fatShort: "fett",
  mealsMore: "fler",
  mealsInGoal: "Inom ditt mål",
  mealsBestPossible: "Bästa möjliga matchning",
  mealsAdjust: "Justera",
  mealsOrderingClosed: "Beställning stängd just nu",
  mealsAddToCart: "Lägg till i varukorgen",
  mealsReadyIn: "Redo på ~5 min",
  adjustChooseAnotherMeal: "Välj annan måltid",
  adjustLabel: "Anpassa",
  adjustMealTarget: "Mål för denna måltid:",
  adjustCalculating: "Beräknar…",
  adjustCalcError: "Kunde inte uppdatera. Försök igen.",
  adjustProteinProgress: "Protein mot målet",
  /** nutriAnpassar.slotWord.* — keyed off mealTimeTags */
  slotWordLunch: "lunchmål",
  slotWordDinner: "middagsmål",
  slotWordBreakfast: "frukostmål",
  slotWordDay: "dagsmål",
  adjustWhy: (slotWord: string) =>
    `Din justering ligger inom ditt ${slotWord} — extra protein utan att spränga kcal.`,
  adjustIngredients: "Ingredienser",
  adjustMacrosKcal: "Makros & kcal",
  adjustAdded: "Tillagt",
  adjustProteinShort: "prot",
  adjustDecrease: "Minska",
  adjustIncrease: "Öka",
  adjustMinIngredientRequired: "Minst en ingrediens krävs",
  adjustRemoveIngredient: (name: string) => `Ta bort ${name}`,
  adjustAddIngredient: "Lägg till ingrediens",
  adjustOptional: "Valfritt",
  adjustAddIngredientAria: (name: string) => `Lägg till ${name}`,
  /** nutriAnpassar.group.* */
  groupNames: {
    Protein: "Protein",
    Bas: "Bas",
    "Sås & smak": "Sås & smak",
    "Toppings & fett": "Toppings & fett",
    Grönsaker: "Grönsaker",
    Övrigt: "Övrigt",
  } as Record<string, string>,
  /** nutriAnpassar.category.* keyed by backend category value */
  categoryNames: {
    Protein: "Protein",
    Baser: "Bas",
    Kolhydrater: "Bas",
    Frukt: "Frukt",
    Såser: "Sås",
    Mejeri: "Mejeri",
    Toppings: "Topping",
    Fetter: "Fett",
    Grönsaker: "Grönsak",
  } as Record<string, string>,
  errorProfileTitle: "Din nutritionsprofil är inte klar",
  errorProfileBody:
    "Nutri anpassar behöver din profil för att beräkna rätt kalori- och proteinmål per måltid. Fyll i profilen så är du igång.",
  errorProfileCta: "Gå till din profil →",
  errorNetworkTitle: "Något gick fel",
  errorNetworkBody:
    "Kunde inte hämta din data just nu. Kontrollera din uppkoppling och försök igen.",
  errorRetry: "Försök igen",
} as const;

export const onboardingGateCopy = {
  /** onboarding.gate.* */
  title: "Skapa din Nutri-profil",
  body: "För att gå vidare behöver du skapa din Nutri-profil först. Vill du börja nu?",
  primary: "Börja onboarding",
  secondary: "Inte nu",
} as const;

export const profileCopy = {
  /** profile.* — sv variants, key-for-key from translations.ts */
  fallbackName: "Din profil",
  identityFallback: "Din nutritionsplan anpassas efter vardag, mål och balans.",
  onboardingTitle: "Välkommen till Nutri!",
  onboardingBody:
    "Vill du ange din kostprofil nu för att låsa upp anpassade måltider och personlig näringsinformation?",
  onboardingLater: "Senare",
  bannerIncompleteTitle: "Din profil är inte klar",
  bannerIncompleteBody: "Slutför för att få personliga mål och carb cycling.",
  bannerContinue: "Fortsätt",
  sectionActivePlan: "Din aktiva plan",
  today: "Idag",
  kcalPerDay: "kcal / dag",
  manual: "Manuell",
  macroProtein: "Protein",
  macroCarbsShort: "Kolh",
  macroFat: "Fett",
  manualAdjusted: "Din plan är manuellt justerad.",
  recommendation: (calories: string) => `Nutri rekommenderar: ${calories} kcal/dag`,
  deviation: "Detta avviker från Nutris rekommendation.",
  changePlan: "Ändra plan",
  nutritionPlan: "Nutritionsplan",
  incompletePlan: "Fyll i alla obligatoriska fält för att låsa upp din nutritionsplan.",
  missingGoalPace: "Takt saknas för ditt mål",
  missingMealCount: "Ogiltig måltidskombination",
  emptyPlan: "Ange dina mål och kroppsmått för att beräkna din personliga kostplan.",
  getStarted: "Kom igång",
  nextSteps: "Nästa steg",
  planDay: "Planera din dag",
  planDaySub: "Få måltider anpassade efter dina mål",
  orderFromMenu: "Beställ från menyn",
  orderHistory: "Orderhistorik",
  myAccount: "Mitt konto",
  editBasicData: "Grunddata",
  editActivity: "Aktivitet",
  editGoal: "Mål",
  editTrainingDays: "Träningsdagar",
  gender: "Kön",
  genderMale: "Man",
  genderFemale: "Kvinna",
  age: "Ålder",
  yearsUnit: "år",
  weight: "Vikt",
  height: "Längd",
  bodyFat: "Kroppsfett",
  optional: "valfritt",
  bodyFatHelper: "Gör din beräkning mer träffsäker. Osäker? Jämför med guide eller hoppa över.",
  bodyFatGuideMale: "Visa guide för män",
  bodyFatGuideFemale: "Visa guide för kvinnor",
  dontKnowSkip: "Vet inte – hoppa över",
  activityIntro: "Välj hur aktiv din vardag är. Steg och träning hjälper Nutri finjustera planen.",
  dailyActivity: "Vardagsaktivitet",
  stepsPerDay: "Steg per dag",
  skip: "Hoppa över",
  unsureSkip: "Osäker? Hoppa över.",
  trainingSessions: "Träningspass",
  trainingHelp: "Räkna pass som varar minst ca 30 minuter.",
  primaryGoal: "Primärt mål",
  primaryGoalHelp: "Välj vad Nutri ska optimera din plan för.",
  pace: "Takt",
  maintainNote: "Underhåll håller planen nära ditt beräknade energibehov.",
  saved: "Sparat ✓",
  saving: "Sparar…",
  save: "Spara",
  cancel: "Avbryt",
  saveSchedule: "Spara schema",
  logout: "Logga ut",
  errorInvalidBasics: "Kontrollera att ålder, vikt och längd är rimliga.",
  errorSave: "Kunde inte spara. Försök igen.",
  /** profile.trainingSheet.* + schedule copy */
  trainingSheetTitle: "Träning & energi",
  trainingSheetOptional: "Valfritt",
  trainingSheetBody: "Nutri justerar kalorier och kolhydrater efter dina träningsdagar.",
  trainingSheetLoading: "Laddar…",
  weeklyOverview: "Veckoöversikt",
  trainingDaysCount: (count: number) => `${count} träningsdagar`,
  trainingScheduleHelp: "Tryck på en dag och välj typ.",
  dayTypeNames: {
    Rest: "Vila",
    Cardio: "Cardio",
    Training: "Träning",
    HeavyTraining: "Tung",
  } as Record<string, string>,
  /** profile.dayAbbr.0–6 (Sun..Sat) */
  dayAbbr: ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"],
  trainingTime: "Träningstid",
  trainingTimeHelp: "Välj när du oftast tränar. Nutri använder det för att placera energin bättre.",
  workoutTimeNames: {
    Morning: "Morgon",
    Midday: "Mitt på dagen",
    Evening: "Kväll",
    NotSet: "Varierar",
  } as Record<string, string>,
  /** profile.goalChip.* / activityChip.* */
  goalChips: {
    FatLoss: "Fettminskning",
    Maintain: "Underhåll",
    MuscleGain: "Muskelbyggnad",
  } as Record<string, string>,
  activityChips: {
    Sedentary: "Stillasittande",
    Mixed: "Aktiv vardag",
    Active: "Mycket aktiv",
  } as Record<string, string>,
} as const;

export const orderHistoryCopy = {
  /** orderHistory.* — subset used by the profile's inline history */
  title: "Orderhistorik",
  show: "Visa",
  emptyInline: "Du har inga tidigare ordrar.",
  qtyUnit: "st",
  total: "Totalt",
  reorder: "Beställ igen",
  reorderError: "Kunde inte lägga till i varukorg.",
  fetchError: "Kunde inte hämta orderhistorik.",
  /** orderHistory.status.* */
  statusNames: {
    Pending: "Väntar",
    Confirmed: "Bekräftad",
    Preparing: "Förbereds",
    Ready: "Klar",
    HandedOut: "Hämtad",
    Delivered: "Hämtad",
    Cancelled: "Avbruten",
  } as Record<string, string>,
} as const;

export const macroAdjustCopy = {
  /** macroAdjust.* */
  title: "Ändra plan",
  statusMatch: "Planen matchar ditt mål",
  statusNeeds: "Planen behöver justeras",
  calorieGoal: "Kalorimål",
  decreaseCalories: "Minska kalorier",
  increaseCalories: "Öka kalorier",
  recommendation: "Nutris rekommendation:",
  recalcFor: "Räkna om makros för",
  macroDistribution: "Makrofördelning",
  macroProtein: "Protein",
  macroCarbs: "Kolhydrater",
  macroFat: "Fett",
  macroSum: "Makros summerar till",
  resetting: "Återställer…",
  reset: "Återställ Nutris rekommendationer",
  saving: "Sparar…",
  saved: "✓ Sparat",
  saveChanges: "Spara ändringar",
  adjustMacros: (diff: string) => `Justera makros (${diff} kcal)`,
  noChanges: "Inga ändringar",
  decreaseNamed: (name: string) => `Minska ${name}`,
  increaseNamed: (name: string) => `Öka ${name}`,
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

export const couponCopy = {
  /** Mobile-first feature — no web translation keys to mirror yet. */
  /** Welcome modal (shown once after login when no welcome coupon exists) */
  welcomeTitle: "En välkomstgåva från Nutri",
  welcomeBody:
    "Som ny medlem får du 20 % rabatt på din första order. Kupongen gäller i 30 dagar och dras av när du beställer.",
  welcomeUseNow: "Använd nu",
  welcomeSaveForLater: "Lägg till i mina kuponger",
  welcomeClaimError: "Kunde inte hämta din kupong. Du kan hämta den senare under Mina kuponger.",
  welcomeDismiss: "Stäng",
  /** List screen */
  listTitle: "Mina kuponger",
  listEmpty: "Du har inga kuponger ännu.",
  listFetchError: "Kunde inte hämta dina kuponger.",
  retry: "Försök igen",
  claimCardTitle: "Din välkomstkupong väntar",
  claimCardBody: "20 % rabatt på din första order — gäller i 30 dagar från att du hämtar den.",
  claimCardCta: "Hämta kupong",
  claimCardError: "Kunde inte hämta kupongen. Försök igen.",
  loginRequired: "Logga in för att se dina kuponger.",
  loginCta: "Logga in",
  /** Status badges (backend CouponStatus values) */
  statusNames: {
    Active: "Aktiv",
    Used: "Använd",
    Expired: "Utgången",
  } as Record<string, string>,
  /** Card/detail fields */
  percentOff: (pct: number) => `${pct} % rabatt`,
  validUntil: (date: string) => `Giltig t.o.m. ${date}`,
  usedAt: (date: string) => `Använd ${date}`,
  expiredAt: (date: string) => `Gick ut ${date}`,
  detailTitle: "Kupong",
  detailNotFound: "Kupongen hittades inte.",
  detailHowItWorks:
    "Rabatten dras av på hela ordern när du beställer. Priset räknas alltid om av kassan — det du ser i varukorgen är en förhandsvisning.",
  use: "Använd",
  selected: "Vald — visas i varukorgen",
  removeSelection: "Ta bort val",
  /** Cart section */
  cartSectionHead: "Kupong",
  cartChoose: "Använd en kupong",
  cartChooseSub: (count: number) =>
    count === 1 ? "1 kupong tillgänglig" : `${count} kuponger tillgängliga`,
  cartRemove: "Ta bort",
  cartDiscountRow: (code: string, pct: number) => `Rabatt ${code} (−${pct} %)`,
  /** Shown when the backend rejects the coupon at order time — appended
   * after the backend's own message (e.g. "Kupongen är redan använd."). */
  rejectedSuffix: "Kupongen har tagits bort från din order. Försök igen.",
  /** Order views */
  orderDiscountRow: (pct: number | undefined) => (pct ? `Rabatt (−${pct} %)` : "Rabatt"),
  orderSubtotal: "Delsumma",
} as const;

export const landingCopy = {
  /** landing.fullday.* — sv strings from Nutri-Frontend's translations.ts;
   * the web renders heading/badge uppercase via CSS, mobile via style. */
  fulldayAdvanced: "Advanced",
  fulldayLoginRequired: "Kräver inloggning",
  fulldayHeading: "Heldagsmåltid",
  fulldaySubheading: "För dig som vill ta det seriöst.",
  fulldayBenefits: [
    "Frukost, lunch & middag i ett",
    "Beräknat efter dina dagliga mål",
    "Egna matlådor ger bonuspoäng",
  ],
  fulldayCtaOrder: "Beställ heldagsmåltid",
  fulldayCtaLogin: "Logga in och beställ",
  /** landing.about.* */
  aboutHeading1: "Hela råvaror.",
  aboutHeading2: "Beräknat för dig.",
  aboutBody:
    "Nutri serverar premium-måltider med tydliga kalorier, protein och portioner — lagade för dig som vill äta bra utan att gissa.",
  /** landing.findus.* + landing.status.* */
  findusLabel: "Hitta oss",
  findusMap: "Karta →",
  findusTempClosed: "Tillfälligt stängt",
  statusNames: {
    open: "Öppet",
    paused: "Pausad",
    closed: "Stängt",
    loading: "Laddar",
  } as Record<string, string>,
  /** footer.* + NutriFooter's hardcoded © line */
  footerTerms: "Köpvillkor",
  footerPrivacy: "Integritet",
  footerContact: "Kontakt",
  footerCopyright: "© 2026 NUTRI Foodtruck AB",
} as const;

export const heldagCopy = {
  /** heldag.* — sv strings verbatim from Nutri-Frontend's translations.ts */
  loadingPackage: "Bygger ditt paket…",
  badge: "Dagens paket",
  heroTitle1: "Resten av dagen",
  heroTitle2: "anpassad efter dig.",
  heroBodyPrefix: "Lunch + mellanmål + middag, anpassat efter din profil —",
  heroBodyStrong: "färdigt att lägga i varukorgen.",
  heroNote:
    "Beräkningen utgår från din Nutri-profil och dagens mål. Tidigare måltider räknas inte automatiskt av här.",
  availabilityAfterPrefix: "Tillgängligt igen",
  availabilityAfterTime: "imorgon kl 11",
  availabilityBeforePrefix: "Kan beställas",
  availabilityBeforeTime: "idag kl 11–15",
  availabilitySuffix: "Lunch, mellanmål och middag i ett paket.",
  summaryDay: "Din dag",
  summaryOverview: "översikt",
  summaryPackage: "Hela paketet",
  summaryReady: (ready: number, total: number) => `${ready} av ${total} klara`,
  summaryKcalTotal: "kcal totalt",
  summaryProtein: "Protein",
  summaryMeals: "Måltider",
  summaryPrice: "Pris",
  slotSectionTitle: "Måltider i paketet",
  unitCount: "st",
  ctaOrder: "Beställ resten av dagen",
  ctaAfter: "Tillgängligt igen imorgon kl 11",
  ctaBefore: "Tillgängligt idag kl 11–15",
  ctaNotReady: "Alla tre måltider måste vara klara.",
  packageKitchenName: "Resten av dagen",
  slotServeAnytime: "när du vill",
  slotTarget: "Mål",
  slotMissing: "Inga måltider tillgängliga för denna slot just nu.",
  slotIncluded: "Ingår i paketet",
  slotClose: "Stäng",
  slotChange: "Byt måltid",
  slotChoose: "Välj annan måltid",
  slotNoOptions: "Inga alternativ tillgängliga.",
  macroCarbsShort: "kolh",
  macroFatShort: "fett",
  errorProfileTitle: "Din nutritionsprofil är inte klar",
  errorProfileBody:
    "Dagens paket behöver din profil för att beräkna rätt kalori- och proteinmål per måltid.",
  errorProfileCta: "Gå till din profil →",
  errorNetwork: "Något gick fel. Försök igen om en stund.",
  errorNoContainer: "Ingen lämplig matlåda hittades.",
  errorCalculateMeal: "Kunde inte beräkna måltiden.",
} as const;

export const rewardsCopy = {
  /** Mobile-first feature — no web translation keys to mirror yet. */
  /** Screen + header entry */
  screenTitle: "Veckans Belöning",
  headerAvailable: "🎁 Veckans Belöning",
  headerComeBack: "Kom tillbaka nästa vecka",
  /** Points summary card */
  pointsLabel: "Nutri-poäng",
  pointsUnit: "poäng",
  activeRewardsLabel: (count: number) =>
    count === 1 ? "1 aktiv belöning" : `${count} aktiva belöningar`,
  /** Weekly reward section */
  weeklySectionHead: "VECKANS BELÖNING",
  spinCta: "Snurra",
  spinning: "Snurrar …",
  spinSubtitle: "En snurr i veckan — belöningen läggs direkt på ditt konto.",
  comeBackTitle: "Kom tillbaka nästa vecka för en ny spin.",
  nextSpinLabel: "Nästa spin",
  daysLeft: (days: number) => (days === 1 ? "1 dag kvar" : `${days} dagar kvar`),
  countdown: (d: number, h: number, m: number) =>
    d > 0 ? `${d} d ${h} tim` : h > 0 ? `${h} tim ${m} min` : `${m} min`,
  wheelUnavailable: "Belöningshjulet är inte tillgängligt just nu. Försök igen senare.",
  alreadySpun: "Du har redan snurrat denna vecka.",
  spinError: "Kunde inte snurra hjulet. Kontrollera din anslutning och försök igen.",
  /** Win modal */
  modalWinPoints: (amount: string) => `Du vann ${amount} Nutri-poäng`,
  modalWinCoupon: (pct: string) => `Du vann ${pct} % rabatt`,
  modalNoWin: "Ingen vinst denna vecka",
  modalNoWinBody: "Bättre lycka nästa vecka — hjulet väntar på dig igen om 7 dagar.",
  modalCouponBody: "Kupongen ligger under Mina kuponger och dras av när du beställer.",
  modalPointsBody: "Poängen är redan tillagda på ditt konto.",
  modalClose: "Stäng",
  modalShowRewards: "Visa mina belöningar",
  /** Launch nudge bottom sheet */
  nudgeTitle: "🎁 Din veckobelöning väntar!",
  nudgeBody: "En snurr i veckan — den här veckans har du kvar.",
  nudgeSpin: "Snurra nu",
  nudgeLater: "Kanske senare",
  /** My rewards section */
  mineSectionHead: "MINA BELÖNINGAR",
  mineEmpty: "Inga belöningar ännu — snurra hjulet för att vinna din första.",
  mineFetchError: "Kunde inte hämta dina belöningar.",
  statusNames: {
    Unused: "Oanvänd",
    Redeemed: "Använd",
    Expired: "Utgången",
  } as Record<string, string>,
  validUntil: (date: string) => `Giltig t.o.m. ${date}`,
  redeemedAt: (date: string) => `Använd ${date}`,
  expiredAt: (date: string) => `Gick ut ${date}`,
  wonAt: (date: string) => `Vunnen ${date}`,
  openCoupon: "Öppna kupong",
  /** History section */
  historySectionHead: "HISTORIK",
  historyEmpty: "Ingen historik ännu.",
  historyFetchError: "Kunde inte hämta historiken.",
  historyNoWin: "Ingen vinst",
  /** Auth gate */
  loginRequired: "Logga in för att se veckans belöning.",
  loginCta: "Logga in",
  retry: "Försök igen",
  fetchError: "Kunde inte ladda belöningar. Kontrollera din anslutning.",
} as const;

export const pointsCopy = {
  /** Mobile-first feature — no web translation keys to mirror yet. */
  screenTitle: "Nutri-poäng",
  balanceLabel: "Ditt saldo",
  balanceUnit: "poäng",
  historyHead: "TRANSAKTIONER",
  historyEmpty: "Inga poängtransaktioner ännu — poäng tjänas på ordrar och i Veckans Belöning.",
  fetchError: "Kunde inte hämta dina poäng.",
  retry: "Försök igen",
  loginRequired: "Logga in för att se dina Nutri-poäng.",
  loginCta: "Logga in",
  /** Reason → display label. Unknown (future) reasons fall back to the raw
   * enum name so new earn methods appear without an app update. */
  reasonNames: {
    OrderEarned: "Order",
    WeeklyRewardEarned: "Veckans belöning",
  } as Record<string, string>,
  reasonIcons: {
    OrderEarned: "🛍️",
    WeeklyRewardEarned: "🎁",
  } as Record<string, string>,
} as const;
