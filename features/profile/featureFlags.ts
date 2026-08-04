/**
 * Profile-area feature flags.
 *
 * TRAINING DAYS (release P16): the whole entry is hidden until the training-
 * day experience is ready to launch. NOTHING is deleted — the weekly-
 * schedule backend, the sheet component and every saved schedule stay
 * intact, and flipping this single constant brings the entry back exactly
 * where it was.
 */
export const TRAINING_DAYS_ENABLED = false;
