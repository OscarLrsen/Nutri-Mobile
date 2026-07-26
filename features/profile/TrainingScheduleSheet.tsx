import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Activity, Dumbbell, Minus, Star, X } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import type { WeeklyScheduleDto } from "@/services/api/weeklySchedule";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, spacing } from "@/theme";
import { sortScheduleMonFirst } from "./profileOptions";

/**
 * Training schedule sheet — port of the web profile's TRAINING SCHEDULE
 * SHEET + TrainingScheduleEditor: 7-day grid where tapping a day cycles
 * Rest → Cardio → Training → HeavyTraining, a legend, and a single global
 * training-time selector applied to all training days (derived as the
 * most-common time across training days). Saving is owned by the parent
 * (schedule PUT + trainingSessions sync into the profile).
 */

const DAY_TYPE_CYCLE = ["Rest", "Cardio", "Training", "HeavyTraining"] as const;

const DAY_COLORS: Record<string, { border: string; bg: string; marker: string; text: string }> = {
  Cardio: {
    border: "rgba(79,168,232,0.45)",
    bg: "rgba(79,168,232,0.10)",
    marker: "#6FB6EC",
    text: "#6FB6EC",
  },
  Training: {
    border: "rgba(232,106,0,0.55)",
    bg: "rgba(232,106,0,0.12)",
    marker: "#FFB070",
    text: "#FFB070",
  },
  HeavyTraining: {
    border: "rgba(255,80,40,0.7)",
    bg: "rgba(255,80,40,0.16)",
    marker: "#FF5028",
    text: "#FF6A4A",
  },
  Rest: {
    border: "rgba(255,255,255,0.08)",
    bg: "#17171A",
    marker: "rgba(255,255,255,0.36)",
    text: "rgba(255,255,255,0.4)",
  },
};

function DayIcon({ dayType, color }: { dayType: string; color: string }) {
  switch (dayType) {
    case "Cardio":
      return <Activity size={10} color={color} strokeWidth={1.6} />;
    case "Training":
      return <Dumbbell size={10} color={color} strokeWidth={1.6} />;
    case "HeavyTraining":
      return <Star size={9} color={color} fill={color} />;
    default:
      return <Minus size={9} color={color} strokeWidth={1.8} />;
  }
}

export function TrainingScheduleSheet({
  schedule,
  loading,
  saving,
  onUpdateDayType,
  onApplyWorkoutTimeToAll,
  onSave,
  onClose,
}: {
  schedule: WeeklyScheduleDto[] | null;
  loading: boolean;
  saving: boolean;
  onUpdateDayType: (dayOfWeek: number, newDayType: string) => void;
  onApplyWorkoutTimeToAll: (newWorkoutTime: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sorted = schedule ? sortScheduleMonFirst(schedule) : [];
  const trainingDays = sorted.filter(
    (d) => d.dayType === "Training" || d.dayType === "HeavyTraining"
  );

  // Global training time = most common across training days (web parity).
  const trainingTime: string = (() => {
    if (trainingDays.length === 0) return "NotSet";
    const counts = new Map<string, number>();
    for (const d of trainingDays) counts.set(d.workoutTime, (counts.get(d.workoutTime) ?? 0) + 1);
    let best = trainingDays[0].workoutTime;
    let bestN = counts.get(best) ?? 0;
    for (const [k, n] of counts) if (n > bestN) [best, bestN] = [k, n];
    return best;
  })();

  const TIME_OPTIONS = ["Morning", "Midday", "Evening", "NotSet"] as const;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[2] }}>
                <ThemedText style={styles.title}>{t("profile.trainingSheetTitle")}</ThemedText>
                <View style={styles.optionalPill}>
                  <ThemedText style={styles.optionalPillText}>
                    {t("profile.trainingSheetOptional").toUpperCase()}
                  </ThemedText>
                </View>
              </View>
              <ThemedText style={styles.subtitle}>{t("profile.trainingSheetBody")}</ThemedText>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button">
              <X size={13} color={colors.accent} strokeWidth={1.7} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {loading || !schedule ? (
              <ThemedText style={styles.loadingText}>{t("profile.trainingSheetLoading")}</ThemedText>
            ) : (
              <>
                {/* Weekly overview grid */}
                <View style={styles.sectionHeadRow}>
                  <ThemedText style={styles.sectionHead}>{t("profile.weeklyOverview")}</ThemedText>
                  <ThemedText style={styles.sectionHeadRight}>
                    {t("profile.trainingDaysCount", { count: trainingDays.length })}
                  </ThemedText>
                </View>
                <ThemedText style={styles.helpText}>{t("profile.trainingScheduleHelp")}</ThemedText>

                <View style={styles.grid}>
                  {sorted.map((day) => {
                    const c = DAY_COLORS[day.dayType] ?? DAY_COLORS.Rest;
                    const nameColor =
                      day.dayType === "Training" || day.dayType === "HeavyTraining"
                        ? colors.textPrimary
                        : "rgba(255,255,255,0.85)";
                    return (
                      <Pressable
                        key={day.dayOfWeek}
                        onPress={() => {
                          const idx = DAY_TYPE_CYCLE.findIndex((t) => t === day.dayType);
                          onUpdateDayType(
                            day.dayOfWeek,
                            DAY_TYPE_CYCLE[(idx + 1) % DAY_TYPE_CYCLE.length]
                          );
                        }}
                        style={[styles.dayCell, { borderColor: c.border, backgroundColor: c.bg }]}
                        accessibilityRole="button"
                      >
                        <ThemedText style={[styles.dayAbbr, { color: nameColor }]}>
                          {t("profile.dayAbbr", { returnObjects: true })[day.dayOfWeek].toUpperCase()}
                        </ThemedText>
                        <View style={[styles.dayMarker, { borderColor: c.border }]}>
                          <DayIcon dayType={day.dayType} color={c.marker} />
                        </View>
                        <ThemedText style={[styles.dayStatus, { color: c.text }]}>
                          {t(`profile.dayTypeNames.${day.dayType}`, {
                            defaultValue: t("profile.dayTypeNames.Rest"),
                          })}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Legend */}
                <View style={styles.legend}>
                  {[
                    { label: t("profile.dayTypeNames.Rest"), color: "rgba(255,255,255,0.22)" },
                    { label: t("profile.dayTypeNames.Cardio"), color: "#6FB6EC" },
                    { label: t("profile.dayTypeNames.Training"), color: colors.accent },
                    { label: t("profile.dayTypeNames.HeavyTraining"), color: "#FF5028" },
                  ].map((l) => (
                    <View key={l.label} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                      <ThemedText style={styles.legendText}>{l.label}</ThemedText>
                    </View>
                  ))}
                </View>

                {/* Training time */}
                <ThemedText style={[styles.sectionHead, { marginTop: spacing[4] }]}>
                  {t("profile.trainingTime")}
                </ThemedText>
                <ThemedText style={styles.helpText}>{t("profile.trainingTimeHelp")}</ThemedText>
                <View style={[styles.timeRow, trainingDays.length === 0 && { opacity: 0.5 }]}>
                  {TIME_OPTIONS.map((tv) => {
                    const active = trainingTime === tv;
                    return (
                      <Pressable
                        key={tv}
                        disabled={trainingDays.length === 0}
                        onPress={() => onApplyWorkoutTimeToAll(tv)}
                        style={[styles.timeButton, active && styles.timeButtonActive]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                      >
                        <ThemedText
                          style={[styles.timeButtonText, active && { color: colors.accent }]}
                        >
                          {t(`profile.workoutTimeNames.${tv}`)}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Skip */}
                <Pressable onPress={onClose} style={styles.skipButton} accessibilityRole="button">
                  <ThemedText style={styles.skipText}>{t("profile.skip")}</ThemedText>
                </Pressable>
              </>
            )}
          </ScrollView>

          {schedule && !loading && (
            <View style={styles.footer}>
              <Pressable
                onPress={onSave}
                disabled={saving}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && !saving && { backgroundColor: colors.accentHover },
                  saving && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.saveButtonText}>
                  {saving ? t("profile.saving") : t("profile.saveSchedule")}
                </ThemedText>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "92%",
    backgroundColor: "rgba(20,20,22,0.98)",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  title: { fontSize: 17, fontFamily: fontFamily.bodyBold, letterSpacing: -0.3, color: colors.textPrimary },
  optionalPill: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  optionalPillText: {
    fontSize: 9.5,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 0.6,
    color: "rgba(255,255,255,0.55)",
  },
  subtitle: { fontSize: 12.5, lineHeight: 17, maxWidth: 290, color: "rgba(255,255,255,0.55)" },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: spacing[4], paddingTop: 4, paddingBottom: spacing[4] },
  loadingText: { paddingVertical: spacing[6], textAlign: "center", fontSize: 14, color: "#4E4A46" },
  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 4,
  },
  sectionHead: { fontSize: 13, fontFamily: fontFamily.bodySemibold, color: "rgba(255,255,255,0.85)" },
  sectionHeadRight: { fontSize: 11.5, color: "rgba(255,255,255,0.5)" },
  helpText: { fontSize: 11, lineHeight: 15, color: "rgba(255,255,255,0.42)", marginBottom: spacing[2] },
  grid: { flexDirection: "row", gap: 5 },
  dayCell: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingTop: 7,
    paddingBottom: 6,
    paddingHorizontal: 2,
    alignItems: "center",
    gap: 3,
  },
  dayAbbr: { fontSize: 9.5, fontFamily: fontFamily.bodySemibold, letterSpacing: 0.2 },
  dayMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayStatus: { fontSize: 9, lineHeight: 10, fontFamily: fontFamily.bodySemibold },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginTop: spacing[2],
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: spacing[2],
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 10.5, fontFamily: fontFamily.bodyMedium, color: "rgba(255,255,255,0.78)" },
  timeRow: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: "#17171A",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 4,
  },
  timeButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  timeButtonActive: {
    backgroundColor: "rgba(232,106,0,0.14)",
    borderWidth: 1,
    borderColor: "rgba(232,106,0,0.45)",
  },
  timeButtonText: {
    fontSize: 11.5,
    textAlign: "center",
    fontFamily: fontFamily.bodyMedium,
    color: "rgba(255,255,255,0.7)",
  },
  skipButton: { alignSelf: "center", marginTop: spacing[4], padding: spacing[2] },
  skipText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.38)",
    textDecorationLine: "underline",
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: spacing[3],
    paddingBottom: spacing[6],
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  saveButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: { fontSize: 15, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
});
