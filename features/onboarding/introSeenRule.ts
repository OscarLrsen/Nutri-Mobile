import type { ProfileGateStatus } from "./firstLoginFlow";

/**
 * "Has THIS user seen the intro?" — including what to do about the
 * legacy device-wide flag left over from before intro state was
 * account-scoped.
 *
 * ── THE TRAP THIS AVOIDS ─────────────────────────────────────────────
 *
 * The obvious migration is to copy `nutri_intro_seen_v1` into the new
 * per-user key on first launch. That reintroduces the exact bug being
 * fixed: the phone that held the deleted account's flag would hand it
 * straight to the recreated account, and the new customer would skip
 * onboarding again. A device-wide claim says something about the PHONE,
 * never about the person now signed in on it.
 *
 * Nor can the flag simply be ignored, though — every established customer
 * upgrading the app would be dragged back through an intro they finished
 * long ago.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────
 *
 * The legacy claim is honoured only when SERVER state independently says
 * this account is established. The backend's nutrition-profile answer is
 * that evidence, and it is per account, so it cannot leak between users:
 *
 *   ready       a real stored profile exists → established → honour it,
 *               and pin the answer per-user so this is decided once
 *   profile-gap genuinely new → onboarding REQUIRED regardless of the
 *               legacy flag. This is the case that was broken.
 *   loading     no verdict; show nothing rather than guess
 *   error       no verdict either — but a network failure must not drag
 *               established customers through the intro, so the legacy
 *               flag is honoured for DISPLAY only and nothing is pinned.
 *               The next launch decides properly.
 *
 * The gate is consulted ONLY when there is a legacy claim to adjudicate.
 * A phone with no legacy flag (a fresh install) needs no server round
 * trip: no flag, no claim, show the intro.
 */
export type IntroSeenInput = {
  /** The per-user v2 flag. null = not read yet. */
  storedSeen: boolean | null;
  /** The legacy device-wide v1 flag. null = not read yet. */
  legacySeen: boolean | null;
  /** The backend's answer about THIS account's nutrition profile. */
  profileGate: ProfileGateStatus;
};

export type IntroSeenDecision = {
  /** null = not known yet; show nothing and decide nothing. */
  seen: boolean | null;
  /**
   * Write the per-user flag now. True only when server state proved this
   * account established — never merely because the phone had a flag.
   */
  persist: boolean;
};

export function deriveIntroSeen(input: IntroSeenInput): IntroSeenDecision {
  // Nothing read yet — no verdict.
  if (input.storedSeen === null || input.legacySeen === null) {
    return { seen: null, persist: false };
  }

  // This user's own flag is the authority once it exists.
  if (input.storedSeen) return { seen: true, persist: false };

  // No legacy claim about this phone → nothing to adjudicate, and no
  // reason to wait for the backend.
  if (!input.legacySeen) return { seen: false, persist: false };

  // A legacy claim exists. Only server state may cash it in.
  switch (input.profileGate) {
    case "ready":
      // Established account: safe to consider onboarding handled, and
      // pin it so the gate is never consulted for this user again.
      return { seen: true, persist: true };
    case "profile-gap":
      // Genuinely new account on a phone that has seen the intro under
      // SOMEONE ELSE'S login. The intro is required. Nothing is pinned —
      // completing it is what writes the flag.
      return { seen: false, persist: false };
    case "error":
      // Not a verdict, but refusing the claim here would replay the intro
      // for every established customer whenever the network hiccups on
      // the first launch after upgrading. Honour it for display only.
      return { seen: true, persist: false };
    case "loading":
    default:
      return { seen: null, persist: false };
  }
}
