import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Check, X } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import {
  previewNutritionResult,
  type ApiNutritionResult,
  type UpsertNutritionProfileDto,
} from "@/services/api/nutrition";
import { formatNumber, useLanguage, useTranslation } from "@/i18n";
import { colors, fontFamily, spacing } from "@/theme";
import {
  ACTIVITY_TYPE_OPTIONS,
  BODY_FAT_OPTIONS,
  GOAL_PACE_OPTIONS,
  PRIMARY_GOAL_OPTIONS,
  STEPS_OPTIONS,
  TRAINING_OPTIONS,
} from "./profileOptions";
import {
  EditNumField,
  FieldLabel,
  HelperText,
  OptionCard,
  PillPair,
  SelectRow,
} from "./editFields";

export type EditSection = "grunddata" | "aktivitet" | "mal";

export interface ProfileFormState {
  gender: "Male" | "Female";
  ageYears: string;
  weightKg: string;
  heightCm: string;
  bodyFatLevel: number | null;
  activityType: "Sedentary" | "Mixed" | "Active";
  stepsRange: string | null;
  trainingSessions: string | null;
  primaryGoal: "FatLoss" | "Maintain" | "MuscleGain";
  goalPace: string | null;
}

/**
 * Edit modal — port of the web profile page's section modals (grunddata /
 * aktivitet / mål) plus the "new-profile" variant (np === null → only the
 * grunddata basics, the approved V1 path to a complete profile). Same
 * behavior: gender switch clears an invalid body-fat level, Maintain clears
 * the pace, and a 400ms-debounced POST /nutrition-profile/preview gives
 * live target feedback (the web shows it in the plan card behind the
 * backdrop; RN modals are opaque, so the same preview renders as a compact
 * line above the save button instead — documented adaptation).
 */
export function EditSectionModal({
  section,
  isNewProfile,
  form,
  onChange,
  saving,
  saveDone,
  saveError,
  onSave,
  onCancel,
}: {
  section: EditSection;
  /** New-profile variant: basics only, no body fat (web parity). */
  isNewProfile: boolean;
  form: ProfileFormState;
  onChange: (patch: Partial<ProfileFormState>) => void;
  saving: boolean;
  saveDone: boolean;
  saveError: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();

  const title =
    section === "grunddata"
      ? t("profile.editBasicData")
      : section === "aktivitet"
        ? t("profile.editActivity")
        : t("profile.editGoal");

  // 400ms-debounced live preview (web parity; planFocus is preserved by the
  // caller's buildDto, so the preview here omits it exactly like a fresh
  // profile would — close enough for the feedback line, and the SAVE uses
  // the caller's full DTO).
  const [preview, setPreview] = useState<ApiNutritionResult | null>(null);
  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const dto: UpsertNutritionProfileDto = {
          gender: form.gender,
          ageYears: parseInt(form.ageYears) || 0,
          weightKg: parseFloat(form.weightKg) || 0,
          heightCm: parseInt(form.heightCm) || 0,
          bodyFatLevel: form.bodyFatLevel,
          targetWeightKg: null,
          activityType: form.activityType,
          stepsRange: form.stepsRange,
          trainingSessions: form.trainingSessions,
          primaryGoal: form.primaryGoal,
          goalPace: form.primaryGoal === "Maintain" ? null : form.goalPace,
          mealCountMain: 3,
          mealCountSnacks: 1,
        };
        setPreview(await previewNutritionResult(dto));
      } catch {
        // keep previous preview (web parity)
      }
    }, 400);
    return () => clearTimeout(id);
  }, [form]);

  const bfOptions = BODY_FAT_OPTIONS[form.gender] ?? BODY_FAT_OPTIONS.Male;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <ThemedText style={styles.sheetTitle}>
                {isNewProfile ? t("profile.editBasicData") : title}
              </ThemedText>
              <Pressable onPress={onCancel} style={styles.closeButton} accessibilityRole="button">
                <X size={15} color={colors.accent} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
            >
              {(section === "grunddata" || isNewProfile) && (
                <View style={{ gap: spacing[4] }}>
                  <View style={{ gap: 6 }}>
                    <FieldLabel>{t("profile.gender")}</FieldLabel>
                    <PillPair
                      options={[
                        { value: "Male", label: t("profile.genderMale") },
                        { value: "Female", label: t("profile.genderFemale") },
                      ]}
                      value={form.gender}
                      onChange={(g) => {
                        const gender = g as "Male" | "Female";
                        // Gender switch clears an invalid body-fat level (web parity).
                        const validInNew = (BODY_FAT_OPTIONS[gender] ?? []).some(
                          (o) => o.value === form.bodyFatLevel
                        );
                        onChange({
                          gender,
                          bodyFatLevel: isNewProfile ? null : validInNew ? form.bodyFatLevel : null,
                        });
                      }}
                    />
                  </View>
                  <EditNumField
                    label={t("profile.age")}
                    unit={t("profile.yearsUnit")}
                    value={form.ageYears}
                    onChange={(v) => onChange({ ageYears: v })}
                    placeholder="25"
                  />
                  <EditNumField
                    label={t("profile.weight")}
                    unit="kg"
                    value={form.weightKg}
                    onChange={(v) => onChange({ weightKg: v })}
                    placeholder="75"
                  />
                  <EditNumField
                    label={t("profile.height")}
                    unit="cm"
                    value={form.heightCm}
                    onChange={(v) => onChange({ heightCm: v })}
                    placeholder="175"
                  />

                  {!isNewProfile && (
                    <View style={{ gap: 6 }}>
                      <FieldLabel optionalText={t("profile.optional")}>{t("profile.bodyFat")}</FieldLabel>
                      <HelperText>{t("profile.bodyFatHelper")}</HelperText>
                      <View style={styles.chipRow}>
                        <Pressable
                          onPress={() =>
                            Linking.openURL(
                              "https://www.ruled.me/visually-estimate-body-fat-percentage/"
                            )
                          }
                          style={styles.linkChip}
                          accessibilityRole="link"
                        >
                          <ThemedText style={styles.linkChipText}>
                            {form.gender === "Male"
                              ? t("profile.bodyFatGuideMale")
                              : t("profile.bodyFatGuideFemale")}
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => onChange({ bodyFatLevel: null })}
                          style={styles.linkChip}
                          accessibilityRole="button"
                        >
                          <ThemedText style={styles.linkChipText}>{t("profile.dontKnowSkip")}</ThemedText>
                        </Pressable>
                      </View>
                      <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
                        {bfOptions.map((opt) => (
                          <SelectRow
                            key={opt.value}
                            label={opt.label}
                            rightText={t(`profileOptions.bodyFatDesc.${opt.value}`)}
                            active={form.bodyFatLevel === opt.value}
                            onPress={() => onChange({ bodyFatLevel: opt.value })}
                          />
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {section === "aktivitet" && !isNewProfile && (
                <View style={{ gap: spacing[5] }}>
                  <HelperText>{t("profile.activityIntro")}</HelperText>

                  <View style={{ gap: 6 }}>
                    <FieldLabel>{t("profile.dailyActivity")}</FieldLabel>
                    <View style={{ gap: spacing[2] }}>
                      {ACTIVITY_TYPE_OPTIONS.map((o) => (
                        <OptionCard
                          key={o.value}
                          label={t(`profileOptions.activityType.${o.value}.label`)}
                          description={t(`profileOptions.activityType.${o.value}.description`)}
                          active={form.activityType === o.value}
                          onPress={() => onChange({ activityType: o.value })}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={{ gap: 6 }}>
                    <View style={styles.labelRow}>
                      <FieldLabel optionalText={t("profile.optional")}>{t("profile.stepsPerDay")}</FieldLabel>
                      <Pressable
                        onPress={() => onChange({ stepsRange: null })}
                        disabled={form.stepsRange == null}
                        accessibilityRole="button"
                      >
                        <ThemedText
                          style={[styles.skipLink, form.stepsRange == null && { opacity: 0.4 }]}
                        >
                          {t("profile.skip")}
                        </ThemedText>
                      </Pressable>
                    </View>
                    <HelperText>{t("profile.unsureSkip")}</HelperText>
                    <View style={{ gap: spacing[2], marginTop: 4 }}>
                      {STEPS_OPTIONS.map((o) => (
                        <SelectRow
                          key={o.value}
                          label={t(`profileOptions.steps.${o.value}`)}
                          active={form.stepsRange === o.value}
                          onPress={() => onChange({ stepsRange: o.value })}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={{ gap: 6 }}>
                    <View style={styles.labelRow}>
                      <FieldLabel optionalText={t("profile.optional")}>{t("profile.trainingSessions")}</FieldLabel>
                      <Pressable
                        onPress={() => onChange({ trainingSessions: null })}
                        disabled={form.trainingSessions == null}
                        accessibilityRole="button"
                      >
                        <ThemedText
                          style={[styles.skipLink, form.trainingSessions == null && { opacity: 0.4 }]}
                        >
                          {t("profile.skip")}
                        </ThemedText>
                      </Pressable>
                    </View>
                    <HelperText>{t("profile.trainingHelp")}</HelperText>
                    <View style={{ gap: spacing[2], marginTop: 4 }}>
                      {TRAINING_OPTIONS.map((o) => (
                        <SelectRow
                          key={o.value}
                          label={t(`profileOptions.training.${o.value}`)}
                          active={form.trainingSessions === o.value}
                          onPress={() => onChange({ trainingSessions: o.value })}
                        />
                      ))}
                    </View>
                  </View>
                </View>
              )}

              {section === "mal" && !isNewProfile && (
                <View style={{ gap: spacing[5] }}>
                  <View style={{ gap: 6 }}>
                    <FieldLabel>{t("profile.primaryGoal")}</FieldLabel>
                    <HelperText>{t("profile.primaryGoalHelp")}</HelperText>
                    <View style={{ gap: spacing[2], marginTop: 4 }}>
                      {PRIMARY_GOAL_OPTIONS.map((g) => (
                        <OptionCard
                          key={g.value}
                          label={t(`profileOptions.goal.${g.value}.label`)}
                          description={t(`profileOptions.goal.${g.value}.description`)}
                          active={form.primaryGoal === g.value}
                          onPress={() => {
                            const v = g.value as ProfileFormState["primaryGoal"];
                            // Maintain has no pace; switching goals clears an
                            // invalid pace (web parity).
                            const valid = GOAL_PACE_OPTIONS[v] ?? [];
                            onChange({
                              primaryGoal: v,
                              goalPace:
                                v === "Maintain"
                                  ? null
                                  : valid.find((p) => p.value === form.goalPace)
                                    ? form.goalPace
                                    : null,
                            });
                          }}
                        />
                      ))}
                    </View>
                  </View>

                  {form.primaryGoal !== "Maintain" ? (
                    <View style={{ gap: 6 }}>
                      <FieldLabel>{t("profile.pace")}</FieldLabel>
                      <View style={{ gap: spacing[2], marginTop: 4 }}>
                        {(GOAL_PACE_OPTIONS[form.primaryGoal] ?? []).map((p) => (
                          <OptionCard
                            key={p.value}
                            label={t(`profileOptions.goalPace.${p.value}.label`)}
                            description={t(`profileOptions.goalPace.${p.value}.description`)}
                            note={
                              p.hasNote
                                ? t(`profileOptions.goalPace.${p.value}.note`, { defaultValue: "" })
                                : undefined
                            }
                            active={form.goalPace === p.value}
                            onPress={() => onChange({ goalPace: p.value })}
                          />
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.maintainNote}>
                      <View style={styles.maintainDot} />
                      <ThemedText style={styles.maintainNoteText}>{t("profile.maintainNote")}</ThemedText>
                    </View>
                  )}
                </View>
              )}

              {/* Live preview line (adaptation of the web's behind-modal plan card) */}
              {preview && preview.calorieTarget > 0 ? (
                <ThemedText style={styles.previewLine}>
                  {formatNumber(preview.calorieTarget, language)} {t("profile.kcalPerDay")} ·{" "}
                  {t("profile.macroProtein")} {preview.proteinG}g
                </ThemedText>
              ) : null}

              {saveError ? <ThemedText style={styles.errorText}>{saveError}</ThemedText> : null}

              <Pressable
                onPress={onSave}
                disabled={saving || saveDone}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && !saving && { backgroundColor: colors.accentHover },
                  (saving || saveDone) && { opacity: 0.75 },
                ]}
                accessibilityRole="button"
              >
                <Check size={15} color={colors.textPrimary} strokeWidth={2.5} />
                <ThemedText style={styles.saveButtonText}>
                  {saveDone ? t("profile.saved") : saving ? t("profile.saving") : t("profile.save")}
                </ThemedText>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center" },
  sheetWrap: { flex: 1, justifyContent: "center", paddingHorizontal: spacing[4] },
  sheet: {
    maxHeight: "90%",
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 20,
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[3],
  },
  sheetTitle: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: "#F2EEE8" },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetContent: { paddingHorizontal: spacing[5], paddingBottom: spacing[5] },
  labelRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  skipLink: { fontSize: 12, color: "rgba(255,255,255,0.5)" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2], marginTop: 4 },
  linkChip: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
  },
  linkChipText: { fontSize: 12, fontFamily: fontFamily.bodyMedium, color: "rgba(255,255,255,0.72)" },
  maintainNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  maintainDot: {
    marginTop: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  maintainNoteText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: "rgba(255,255,255,0.62)" },
  previewLine: {
    marginTop: spacing[4],
    textAlign: "center",
    fontSize: 12,
    fontFamily: fontFamily.mono,
    color: "rgba(255,255,255,0.45)",
  },
  errorText: { marginTop: spacing[3], fontSize: 13, color: "#f87171" },
  saveButton: {
    marginTop: spacing[4],
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  saveButtonText: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
});
