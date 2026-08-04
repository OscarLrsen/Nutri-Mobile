import type { TFunction } from "i18next";

import type { WeeklyScheduleDto } from "@/services/api/weeklySchedule";

/**
 * Option lists + enum mappings, ported from the web's app/profil/page.tsx.
 * Values are backend enum strings — never rename. Labels/descriptions live
 * in the i18n resources under profileOptions.* keyed by these stable values;
 * components render them via t(`profileOptions...${value}...`).
 */

export const ACTIVITY_TYPE_OPTIONS = [
  { value: "Sedentary" },
  { value: "Mixed" },
  { value: "Active" },
] as const;

export const STEPS_OPTIONS = [
  { value: "Under5K" },
  { value: "FiveK7500" },
  { value: "SevenFiveHundred10K" },
  { value: "TenK12500" },
  { value: "Over12500" },
] as const;

export const TRAINING_OPTIONS = [
  { value: "Zero" },
  { value: "OneTwoPerWeek" },
  { value: "ThreeFourPerWeek" },
  { value: "FiveSixPerWeek" },
  { value: "SevenPlusPerWeek" },
] as const;

export const PRIMARY_GOAL_OPTIONS = [
  { value: "FatLoss" },
  { value: "Maintain" },
  { value: "MuscleGain" },
] as const;

/** Pace values per goal. `hasNote` marks options with an extra note line
 * (profileOptions.goalPace.<value>.note). */
export const GOAL_PACE_OPTIONS: Record<
  string,
  { value: "Slow" | "Moderate" | "Aggressive" | "Careful" | "Normal"; hasNote?: boolean }[]
> = {
  FatLoss: [{ value: "Slow" }, { value: "Moderate" }, { value: "Aggressive", hasNote: true }],
  MuscleGain: [{ value: "Careful" }, { value: "Normal" }],
};

/** Body-fat levels per gender. `label` is a percent figure (not translated);
 * the description is profileOptions.bodyFatDesc.<level>. */
export const BODY_FAT_OPTIONS: Record<
  "Male" | "Female",
  { value: 1 | 2 | 3 | 4 | 5 | 6; label: string }[]
> = {
  Male: [
    { value: 1, label: "~9%" },
    { value: 2, label: "~12%" },
    { value: 3, label: "~17%" },
    { value: 4, label: "~22%" },
    { value: 5, label: "~27%" },
    { value: 6, label: "~32%" },
  ],
  Female: [
    { value: 1, label: "~18%" },
    { value: 2, label: "~23%" },
    { value: 3, label: "~28%" },
    { value: 4, label: "~33%" },
    { value: 5, label: "~38%" },
    { value: 6, label: "~43%" },
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

/** Web lib/orderLabels.formatCategorySnapshot — reformats the backend's
 * "Custom – {N} st {Container}" snapshot so N isn't mistaken for ordered
 * quantity; regular categories map to translated labels. Backend category
 * strings are never sent back translated — this is display-only. */
export function formatCategorySnapshot(category: string, t: TFunction): string {
  const normalized = category.trim().toLowerCase();
  const regularKey: Record<string, "frukost" | "huvudmaltider" | "mellanmal" | "dryck"> = {
    frukost: "frukost",
    "huvudmåltider": "huvudmaltider",
    huvudmaltider: "huvudmaltider",
    "mellanmål": "mellanmal",
    mellanmal: "mellanmal",
    dryck: "dryck",
  };
  const mappedKey = regularKey[normalized];
  if (mappedKey) return t(`profileOptions.categoryNames.${mappedKey}`);

  const m = category.match(/^Custom\s+[–-]\s+(\d+)\s+st\s+(.+)$/i);
  if (!m) return category;
  const count = parseInt(m[1], 10);
  if (count === 1) return t("profileOptions.customSingle");
  const name = m[2].trim();
  const containerName = /^bowls?$/i.test(name) ? t("profileOptions.bowls") : name;
  return t("profileOptions.customPacked", { count, container: containerName });
}
