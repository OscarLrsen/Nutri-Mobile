/**
 * THE ONE ANSWER to "what does a customer meet first?".
 *
 * ── THE PRODUCT ORDER ────────────────────────────────────────────────
 *
 *   signup → confirm mail → login
 *     1. ONBOARDING          the first-run intro (IntroCarousel)
 *     2. WELCOME DISCOUNT    the 20% welcome-coupon modal
 *     3. FILL PROFILE        "Vill du ange din kostprofil nu?"
 *     → normal flow
 *
 * These are THREE separate UX steps owned by three separate components,
 * and the names are close enough that they have already been conflated
 * once. They are not interchangeable:
 *
 *   ONBOARDING       features/onboarding/FirstRunOnboardingGate.tsx
 *   WELCOME DISCOUNT features/coupons/WelcomeCouponModal.tsx
 *   FILL PROFILE     features/profile/ProfileScreen.tsx (showOnboardingModal)
 *
 * ── WHY A SHARED DERIVATION ──────────────────────────────────────────
 *
 * Each of those three used to decide on its own, from its own signal, in
 * its own async timeline. Nothing compared them, so whichever resolved
 * first won — and the slowest signal (the backend nutrition profile) is
 * the one that belongs LAST, while the fastest (a local AsyncStorage
 * flag) belongs first. A new customer therefore met step 3 immediately
 * after login: a redirect to Konto fired the moment the backend reported
 * a profile gap, jumping ahead of both the intro and the discount.
 *
 * Priority cannot be an emergent property of three race conditions. It
 * is stated here, once, and every step asks this function whether it is
 * its turn. A later step can never win before an earlier one is settled.
 *
 * ── UNKNOWN IS NOT A VERDICT ─────────────────────────────────────────
 *
 * Every input is three-valued (null = not known yet), and any unknown
 * that sits BEFORE the step in question yields "loading" — show nothing.
 * This is the same mistake profileCompletion.ts exists to prevent: a
 * `null` that means "still loading" must never be read as "false". A
 * slow network must not flash step 3 at someone who has not seen step 1.
 *
 * Failures are resolved by the callers into a real boolean before they
 * get here (a storage read that fails counts as seen; a coupons request
 * that fails counts as handled), so an outage moves the customer FORWARD
 * rather than trapping them behind a step that can never resolve. This
 * module never sees "error" for those two — only for the profile gate,
 * where it is deliberately not an answer.
 */

export type FirstLoginStep =
  /** Nothing is known yet — every step renders NOTHING. */
  | "loading"
  /** 1. The first-run intro owns the screen. */
  | "onboarding"
  /** 2. The 20% welcome-coupon modal may show. */
  | "welcome-discount"
  /** 3. "Vill du ange din kostprofil nu?" may show. */
  | "profile-prompt"
  /** Past the first-login sequence — normal app. */
  | "ready";

/** The four-valued backend answer about the stored nutrition profile. */
export type ProfileGateStatus = "loading" | "ready" | "profile-gap" | "error";

export type FirstLoginInput = {
  /** A valid session exists. Without one, none of these steps exist. */
  signedIn: boolean;
  /**
   * The CURRENT USER has completed the first-run intro.
   * null = not known yet.
   *
   * ACCOUNT-scoped, like the two steps after it. It was device-scoped
   * once (`nutri_intro_seen_v1`, no user id) on the theory that the intro
   * explains the APP rather than the account — and that cost a real
   * defect: an account was deleted and recreated with the same email, the
   * phone still held the deleted account's flag, and the brand-new
   * customer was skipped past step 1 straight into the welcome discount.
   * A flag about the PHONE cannot answer a question about the PERSON.
   * introSeenRule.ts handles the legacy flag without either replaying the
   * intro for established customers or leaking it to new accounts.
   */
  introSeen: boolean | null;
  /**
   * The welcome discount has been dealt with for THIS user — claimed,
   * saved, dismissed, or already owned from an earlier install.
   * null = the flag/coupon answer is not in yet.
   */
  welcomeHandled: boolean | null;
  /** The backend's own answer about the nutrition profile. */
  profileGate: ProfileGateStatus;
};

export type FirstLoginDecision = { step: FirstLoginStep };

export function deriveFirstLoginStep(input: FirstLoginInput): FirstLoginDecision {
  // No session → the auth gate owns the screen; none of this exists.
  if (!input.signedIn) return { step: "loading" };

  // ── 1. ONBOARDING ──────────────────────────────────────────────────
  // Read before anything else, because it is the cheapest signal and
  // the intro is a full-screen cover. Showing a modal on top of it is
  // exactly what "order" means here — RN Modals stack ABOVE the
  // intro's View, so z-order alone would not have saved us.
  if (input.introSeen === null) return { step: "loading" };
  if (input.introSeen === false) return { step: "onboarding" };

  // ── 2. WELCOME DISCOUNT ────────────────────────────────────────────
  // Only once the intro is genuinely done. Note what is NOT here: the
  // profile gate. The discount deliberately comes BEFORE the profile
  // prompt, so making it wait for a complete profile would invert the
  // product order — which is precisely the bug this replaces.
  if (input.welcomeHandled === null) return { step: "loading" };
  if (input.welcomeHandled === false) return { step: "welcome-discount" };

  // ── 3. FILL PROFILE ────────────────────────────────────────────────
  // Last, and only on a REAL profile gap. "loading" and "error" are not
  // gaps: a network failure must never pull someone into a profile they
  // have already filled in.
  if (input.profileGate === "loading" || input.profileGate === "error") {
    return { step: "loading" };
  }
  if (input.profileGate === "profile-gap") return { step: "profile-prompt" };

  return { step: "ready" };
}
