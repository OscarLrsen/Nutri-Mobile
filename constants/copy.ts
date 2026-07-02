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
