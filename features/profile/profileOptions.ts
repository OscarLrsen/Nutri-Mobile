import type { WeeklyScheduleDto } from "@/services/api/weeklySchedule";

/**
 * Option lists + enum mappings, ported from the web's app/profil/page.tsx.
 * Values are backend enum strings — never rename. Labels/descriptions are
 * the exact sv strings from translations.ts (profile.* keys, noted per
 * list). Mobile is sv-only, so the strings are baked in here just like the
 * web page's own hardcoded fallbacks.
 */

/** profile.activityType.*.label/.description */
export const ACTIVITY_TYPE_OPTIONS = [
  { value: "Sedentary", label: "Stillasittande", description: "Kontorsarbete, lite rörelse" },
  { value: "Mixed", label: "Blandat", description: "Promenader, måttlig rörelse" },
  { value: "Active", label: "Aktiv", description: "Fysiskt arbete eller mycket rörelse" },
] as const;

/** profile.steps.*.label */
export const STEPS_OPTIONS = [
  { value: "Under5K", label: "Under 5 000 steg/dag" },
  { value: "FiveK7500", label: "5 000 – 7 500 steg/dag" },
  { value: "SevenFiveHundred10K", label: "7 500 – 10 000 steg/dag" },
  { value: "TenK12500", label: "10 000 – 12 500 steg/dag" },
  { value: "Over12500", label: "Över 12 500 steg/dag" },
] as const;

/** profile.training.*.label */
export const TRAINING_OPTIONS = [
  { value: "Zero", label: "Ingen träning" },
  { value: "OneTwoPerWeek", label: "1–2 pass / vecka" },
  { value: "ThreeFourPerWeek", label: "3–4 pass / vecka" },
  { value: "FiveSixPerWeek", label: "5–6 pass / vecka" },
  { value: "SevenPlusPerWeek", label: "7+ pass / vecka" },
] as const;

/** profile.goal.*.label/.description */
export const PRIMARY_GOAL_OPTIONS = [
  { value: "FatLoss", label: "Fettförbränning", description: "Minska kroppsfett med kontrollerat underskott" },
  { value: "Maintain", label: "Underhåll", description: "Behåll vikt och energi över tid" },
  { value: "MuscleGain", label: "Muskelbyggnad", description: "Öka muskelmassa med kontrollerat överskott" },
] as const;

/** profile.goalPace.* */
export const GOAL_PACE_OPTIONS: Record<
  string,
  { value: string; label: string; description: string; note?: string }[]
> = {
  FatLoss: [
    { value: "Slow", label: "Lugnt", description: "−250 kcal/dag (~0.3 kg/vecka)" },
    { value: "Moderate", label: "Måttligt", description: "−500 kcal/dag (~0.5 kg/vecka)" },
    {
      value: "Aggressive",
      label: "Aggressivt",
      description: "−750 kcal/dag (~0.75 kg/vecka)",
      note: "Snabbare resultat, men kräver bättre följsamhet.",
    },
  ],
  MuscleGain: [
    { value: "Careful", label: "Försiktigt", description: "+200 kcal/dag (minimal fettökning)" },
    { value: "Normal", label: "Normalt", description: "+350 kcal/dag (optimal byggnad)" },
  ],
};

/** Body-fat levels per gender — labels hardcoded on web, descriptions
 * profile.bodyFat.desc.1–6. */
export const BODY_FAT_OPTIONS: Record<
  "Male" | "Female",
  { value: number; label: string; desc: string }[]
> = {
  Male: [
    { value: 1, label: "~9%", desc: "Väldigt lean" },
    { value: 2, label: "~12%", desc: "Lean" },
    { value: 3, label: "~17%", desc: "Genomsnitt" },
    { value: 4, label: "~22%", desc: "Lite mer" },
    { value: 5, label: "~27%", desc: "Mer" },
    { value: 6, label: "~32%", desc: "Högt" },
  ],
  Female: [
    { value: 1, label: "~18%", desc: "Väldigt lean" },
    { value: 2, label: "~23%", desc: "Lean" },
    { value: 3, label: "~28%", desc: "Genomsnitt" },
    { value: 4, label: "~33%", desc: "Lite mer" },
    { value: 5, label: "~38%", desc: "Mer" },
    { value: 6, label: "~43%", desc: "Högt" },
  ],
};

/** Web: derives the trainingSessions enum from the saved weekly schedule so
 * the profile stays in sync after a schedule save. */
export function deriveTrainingSessionsFromWeeklySchedule(
  schedule: { dayType: string }[]
): (typeof TRAINING_OPTIONS)[number]["value"] {
  const selectedTrainingDays = schedule.filter(
    (day) => day.dayType === "Training" || day.dayType === "HeavyTraining"
  ).length;
  if (selectedTrainingDays === 0) return "Zero";
  if (selectedTrainingDays <= 2) return "OneTwoPerWeek";
  if (selectedTrainingDays <= 4) return "ThreeFourPerWeek";
  if (selectedTrainingDays <= 6) return "FiveSixPerWeek";
  return "SevenPlusPerWeek";
}

/** Mon-first display order for the schedule grid (web parity). */
export function sortScheduleMonFirst(schedule: WeeklyScheduleDto[]): WeeklyScheduleDto[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return [...schedule].sort((a, b) => order.indexOf(a.dayOfWeek) - order.indexOf(b.dayOfWeek));
}

/** Web justera-makros mapBodyFat — level → body-fat fraction, per gender.
 * Mirrors NutritionEngineService. */
export function mapBodyFat(level: number | null, gender: string): number | null {
  if (level === null) return null;
  if (gender === "Male") {
    const m: Record<number, number> = { 1: 0.09, 2: 0.125, 3: 0.17, 4: 0.22, 5: 0.27, 6: 0.32 };
    return m[level] ?? null;
  }
  const m: Record<number, number> = { 1: 0.18, 2: 0.23, 3: 0.28, 4: 0.33, 5: 0.38, 6: 0.43 };
  return m[level] ?? null;
}

/** Web lib/orderLabels.formatCategorySnapshot (sv-only port) — reformats the
 * backend's "Custom – {N} st {Container}" snapshot so N isn't mistaken for
 * ordered quantity; passes regular categories through (normalized). */
export function formatCategorySnapshot(category: string): string {
  const normalized = category.trim().toLowerCase();
  const regular: Record<string, string> = {
    frukost: "Frukost",
    "huvudmåltider": "Huvudmåltider",
    huvudmaltider: "Huvudmåltider",
    "mellanmål": "Mellanmål",
    mellanmal: "Mellanmål",
    dryck: "Dryck",
  };
  const mapped = regular[normalized];
  if (mapped) return mapped;

  const m = category.match(/^Custom\s+[–-]\s+(\d+)\s+st\s+(.+)$/i);
  if (!m) return category;
  const count = parseInt(m[1], 10);
  if (count === 1) return "Anpassad";
  const name = m[2].trim();
  const containerName = /^bowls?$/i.test(name) ? "skålar" : name;
  return `Anpassad · packas i ${count} ${containerName}`;
}
