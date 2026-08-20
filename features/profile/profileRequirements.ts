import { BODY_FAT_OPTIONS, GOAL_PACE_OPTIONS } from "./profileOptions";

/**
 * WHAT THE ALGORITHM ACTUALLY READS.
 *
 * Traced field by field through NutritionEngineService.Calculate (backend):
 *
 *   Gender            → BMR branch (Mifflin ±5/−161), calorie floor
 *                       (1500/1200), body-fat table, female cycle branch
 *   AgeYears          → Mifflin BMR
 *   WeightKg          → BMR, protein base, fat minimum (0.6 g/kg, min 40 g)
 *   HeightCm          → Mifflin BMR, BMI-25 protein cap
 *   BodyFatLevel      → switches BMR to Katch-McArdle and the protein base
 *                       to lean mass. Genuinely optional: the engine has a
 *                       complete Mifflin fallback.
 *   ActivityType      → 1–3 activity points
 *   StepsRange        → 0–4 activity points
 *   TrainingSessions  → 0–4 activity points
 *   PrimaryGoal       → kcal adjustment AND protein per kg (2.2/1.8/2.0)
 *   GoalPace          → kcal adjustment (−250…+350). Not applicable to Maintain.
 *   PlanFocus         → fat ×1.10 / ×0.90 and protein ×0.95 in CalculateMacros
 *   IsPostmenopausal  → gates the cycle adjustment
 *   CyclePhase        → +100 kcal in the luteal phase
 *
 * TargetWeightKg is stored and echoed back but never read by the engine, so
 * it is NOT part of this list — it is a display fact, not an input.
 *
 * REQUIRED vs OPTIONAL is decided by one question: if the customer does not
 * answer, does the engine produce a WRONG number or merely a less precise
 * one? StepsRange and TrainingSessions are nullable in the backend but null
 * scores 0 points each — indistinguishable in the output from "under 5 000
 * steps, never trains". Leaving them blank can drop the activity multiplier
 * from 1.9 to 1.2, so they are required here. Body fat is the only field
 * with an honest fallback, so it is the only optional one.
 */

export interface ProfileFormState {
  /** Null until answered. A default would silently pick a BMR branch. */
  gender: "Male" | "Female" | null;
  ageYears: string;
  weightKg: string;
  heightCm: string;
  /** Optional — the engine falls back to Mifflin-St Jeor. */
  bodyFatLevel: number | null;
  activityType: "Sedentary" | "Mixed" | "Active" | null;
  stepsRange: string | null;
  trainingSessions: string | null;
  primaryGoal: "FatLoss" | "Maintain" | "MuscleGain" | null;
  goalPace: string | null;
  planFocus: "Balance" | "Satiety" | "Performance" | "Health" | null;
  /**
   * Female only. "PreferNotToSay" is a real answer, not a blank: it maps to
   * isPostmenopausal = null (the backend's "not provided") while still
   * counting as answered, so the form never forces a disclosure.
   */
  menopause: "Postmenopausal" | "Cycling" | "PreferNotToSay" | null;
  cyclePhase: string | null;
}

/** Bounds shared by the completeness gate and the save validator, so the
 *  button state and the error message can never disagree. */
export const AGE_RANGE = { min: 10, max: 120 };
export const WEIGHT_RANGE = { min: 30, max: 400 };
export const HEIGHT_RANGE = { min: 100, max: 250 };

const inRange = (raw: string, range: { min: number; max: number }, integer: boolean) => {
  const n = integer ? parseInt(raw, 10) : parseFloat(raw);
  return !isNaN(n) && n >= range.min && n <= range.max;
};

export const hasValidAge = (f: ProfileFormState) => inRange(f.ageYears, AGE_RANGE, true);
export const hasValidWeight = (f: ProfileFormState) => inRange(f.weightKg, WEIGHT_RANGE, false);
export const hasValidHeight = (f: ProfileFormState) => inRange(f.heightCm, HEIGHT_RANGE, true);

/** Scroll anchors — one per visual block in the edit sheet. */
export type ProfileAnchorId =
  | "basics"
  | "bodyFat"
  | "activityType"
  | "steps"
  | "training"
  | "goal"
  | "pace"
  | "planFocus"
  | "menopause"
  | "cyclePhase";

export type ProfileStepId =
  | "gender"
  | "numbers"
  | "bodyFat"
  | "activityType"
  | "steps"
  | "training"
  | "goal"
  | "pace"
  | "planFocus"
  | "menopause"
  | "cyclePhase";

/** Body fat is the one step the engine can do without, so it is the one id
 *  that never appears in a "still missing" list — and the only one without a
 *  profile.missingStep.* label. */
export type RequiredStepId = Exclude<ProfileStepId, "bodyFat">;

interface StepBase {
  anchor: ProfileAnchorId;
  /** False when the field does not apply to this profile at all. */
  applies: (f: ProfileFormState) => boolean;
  filled: (f: ProfileFormState) => boolean;
}

type ProfileStep =
  | (StepBase & { required: true; id: RequiredStepId })
  | (StepBase & { required: false; id: ProfileStepId });

const always = () => true;

/** Source order = the order the sheet renders them, which is also the order
 *  auto-progression walks. */
export const PROFILE_STEPS: ProfileStep[] = [
  {
    id: "gender",
    anchor: "basics",
    required: true,
    applies: always,
    filled: (f) => f.gender !== null,
  },
  {
    id: "numbers",
    anchor: "basics",
    required: true,
    applies: always,
    filled: (f) => hasValidAge(f) && hasValidWeight(f) && hasValidHeight(f),
  },
  {
    id: "bodyFat",
    anchor: "bodyFat",
    required: false,
    applies: (f) => f.gender !== null,
    filled: (f) =>
      f.bodyFatLevel !== null &&
      (BODY_FAT_OPTIONS[f.gender ?? "Male"] ?? []).some((o) => o.value === f.bodyFatLevel),
  },
  {
    id: "activityType",
    anchor: "activityType",
    required: true,
    applies: always,
    filled: (f) => f.activityType !== null,
  },
  {
    id: "steps",
    anchor: "steps",
    required: true,
    applies: always,
    filled: (f) => f.stepsRange !== null,
  },
  {
    id: "training",
    anchor: "training",
    required: true,
    applies: always,
    filled: (f) => f.trainingSessions !== null,
  },
  {
    id: "goal",
    anchor: "goal",
    required: true,
    applies: always,
    filled: (f) => f.primaryGoal !== null,
  },
  {
    id: "pace",
    anchor: "pace",
    required: true,
    // Maintain has no pace — the engine's adjustment is 0 either way.
    applies: (f) => f.primaryGoal !== null && f.primaryGoal !== "Maintain",
    filled: (f) =>
      f.goalPace !== null &&
      (GOAL_PACE_OPTIONS[f.primaryGoal ?? ""] ?? []).some((p) => p.value === f.goalPace),
  },
  {
    id: "planFocus",
    anchor: "planFocus",
    required: true,
    applies: always,
    filled: (f) => f.planFocus !== null,
  },
  {
    id: "menopause",
    anchor: "menopause",
    required: true,
    applies: (f) => f.gender === "Female",
    filled: (f) => f.menopause !== null,
  },
  {
    id: "cyclePhase",
    anchor: "cyclePhase",
    required: true,
    // Only asked of women with an active cycle: the engine ignores the phase
    // entirely when postmenopausal.
    applies: (f) => f.gender === "Female" && f.menopause === "Cycling",
    filled: (f) => f.cyclePhase !== null,
  },
];

/** Required algorithm inputs this form has not answered yet. Empty = the
 *  engine has everything it needs to be right. */
export function missingRequiredSteps(form: ProfileFormState): RequiredStepId[] {
  const missing: RequiredStepId[] = [];
  for (const step of PROFILE_STEPS) {
    if (step.required && step.applies(form) && !step.filled(form)) missing.push(step.id);
  }
  return missing;
}

export const isProfileComplete = (form: ProfileFormState) =>
  missingRequiredSteps(form).length === 0;

/**
 * The block auto-progression should move to after a choice. Only REQUIRED
 * steps are targets — otherwise the flow would park on the optional body-fat
 * block and refuse to move on. Returns null when nothing is left, or when
 * the next gap is in the block the customer is already looking at.
 */
export function nextIncompleteAnchor(
  form: ProfileFormState,
  currentAnchor: ProfileAnchorId
): ProfileAnchorId | null {
  const next = PROFILE_STEPS.find(
    (s) => s.required && s.applies(form) && !s.filled(form) && s.anchor !== currentAnchor
  );
  return next?.anchor ?? null;
}
