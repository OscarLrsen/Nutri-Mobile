import { apiClient, requireAuth } from "./client";

/** Weekly training schedule — ported from the web's weeklyScheduleApi
 * (spec §14.2). Drives carb cycling in /nutrition-profile/today. */
export interface WeeklyScheduleDto {
  /** 0 = Sunday … 6 = Saturday (JS / C# DayOfWeek enum convention). */
  dayOfWeek: number;
  /** "Rest" | "Cardio" | "Training" | "HeavyTraining" */
  dayType: string;
  /** "NotSet" | "Morning" | "Midday" | "Evening" */
  workoutTime: string;
}

/** GET /api/weekly-schedule — auth. */
export async function getWeeklySchedule(): Promise<WeeklyScheduleDto[]> {
  const { data } = await apiClient.get<WeeklyScheduleDto[]>("/api/weekly-schedule", requireAuth());
  return data;
}

/** PUT /api/weekly-schedule — auth, replaces the whole week. */
export async function upsertWeeklySchedule(
  schedule: WeeklyScheduleDto[]
): Promise<WeeklyScheduleDto[]> {
  const { data } = await apiClient.put<WeeklyScheduleDto[]>(
    "/api/weekly-schedule",
    schedule,
    requireAuth()
  );
  return data;
}
