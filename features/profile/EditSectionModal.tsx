import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Check, X } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { SwipeDownSheet } from "@/components/ui/SwipeDownSheet";
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
  CYCLE_PHASE_OPTIONS,
  GOAL_PACE_OPTIONS,
  MENOPAUSE_OPTIONS,
  PLAN_FOCUS_OPTIONS,
  PRIMARY_GOAL_OPTIONS,
  STEPS_OPTIONS,
  TRAINING_OPTIONS,
} from "./profileOptions";
import {
  missingRequiredSteps,
  nextIncompleteAnchor,
  type ProfileAnchorId,
  type ProfileFormState,
} from "./profileRequirements";
import {
  EditNumField,
  FieldLabel,
  HelperText,
  NumericDoneBar,
  OptionCard,
  PillPair,
  SelectRow,
} from "./editFields";

export type { ProfileFormState } from "./profileRequirements";

/**
 * "profil" (release P13) is the COMBINED page — grunddata + aktivitet + mål
 * in one scroll with section headings and one save, replacing the four
 * small sub-modals. "vikt" (release P14) is the weight quick-edit: the one
 * number, validated and saved through the exact same full-profile upsert.
 */
export type EditSection = "grunddata" | "aktivitet" | "mal" | "profil" | "vikt";

/**
 * Edit modal — port of the web profile page's section modals. Behaviour
 * carried over from the web: gender switch clears an invalid body-fat level,
 * Maintain clears the pace, and a 400ms-debounced POST
 * /nutrition-profile/preview gives live target feedback (the web shows it in
 * the plan card behind the backdrop; RN modals are opaque, so the same
 * preview renders as a compact line above the save button instead —
 * documented adaptation).
 *
 * A NEW PROFILE NOW SEES THE SAME FORM AS AN EXISTING ONE. It previously
 * showed gender/age/weight/height only, and the save filled the rest from
 * EMPTY_FORM's defaults: Maintain, Mixed, no steps, no training. That
 * passes the backend's completeness check, so onboarding finished "klar"
 * with an activity score of 2 — multiplier 1.200, "Stillasittande" — for a
 * customer who might train five times a week, and nothing on screen ever
 * said so. One form, one set of fields, no second-class first run.
 *
 * PROGRESSION: answering a choice scrolls to the next REQUIRED block that is
 * still empty. Only tap-choices advance — scrolling the sheet out from under
 * someone who is typing a number would be hostile, and the numeric fields
 * have their own "Klar" bar.
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
  /** First run: same fields, different title. */
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
        : section === "profil"
          ? t("profile.editProfile")
          : section === "vikt"
            ? t("profile.weightRow")
            : t("profile.editGoal");

  const combined = section === "profil";
  /** Every algorithm field on one page — the combined page and the first run. */
  const showAll = combined || isNewProfile;

  // The in-app body-fat guide (replaces the old external link — see the
  // chip below).
  const [guideOpen, setGuideOpen] = useState(false);

  // ── Auto-progression ────────────────────────────────────────────────
  // Each block reports its y-offset inside the ScrollView; a completed
  // choice scrolls to the next required gap.
  const scrollRef = useRef<ScrollView>(null);
  const anchorY = useRef<Partial<Record<ProfileAnchorId, number>>>({});

  const registerAnchor = (id: ProfileAnchorId) => (e: LayoutChangeEvent) => {
    anchorY.current[id] = e.nativeEvent.layout.y;
  };

  /**
   * Apply a choice, then move to the next unanswered required block.
   * `patch` is applied to a local copy first so the target is computed from
   * the state the customer is about to see, not the one they just left.
   */
  const choose = (from: ProfileAnchorId, patch: Partial<ProfileFormState>) => {
    onChange(patch);
    if (!showAll) return;
    const next = nextIncompleteAnchor({ ...form, ...patch }, from);
    const y = next ? anchorY.current[next] : undefined;
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing[4]), animated: true });
  };

  // 400ms-debounced live preview (web parity). Sends the same values the
  // save will send, so the number under the button is the number the
  // customer gets.
  const [preview, setPreview] = useState<ApiNutritionResult | null>(null);
  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const dto: UpsertNutritionProfileDto = {
          gender: form.gender ?? "Male",
          ageYears: parseInt(form.ageYears) || 0,
          weightKg: parseFloat(form.weightKg) || 0,
          heightCm: parseInt(form.heightCm) || 0,
          bodyFatLevel: form.bodyFatLevel,
          targetWeightKg: null,
          activityType: form.activityType ?? "Mixed",
          stepsRange: form.stepsRange,
          trainingSessions: form.trainingSessions,
          primaryGoal: form.primaryGoal ?? "Maintain",
          goalPace: form.primaryGoal === "Maintain" ? null : form.goalPace,
          mealCountMain: 3,
          mealCountSnacks: 1,
          planFocus: form.planFocus ?? "Balance",
          isPostmenopausal: menopauseToApi(form.menopause),
          cyclePhase: form.menopause === "Cycling" ? form.cyclePhase : null,
        };
        setPreview(await previewNutritionResult(dto));
      } catch {
        // keep previous preview (web parity)
      }
    }, 400);
    return () => clearTimeout(id);
  }, [form]);

  const bfOptions = BODY_FAT_OPTIONS[form.gender ?? "Male"];
  const missing = missingRequiredSteps(form);
  // The gate only guards pages that actually RENDER the missing fields.
  // The weight quick-edit shows one number; blocking it on a gap the
  // customer cannot see from there would be a dead end.
  const gateSave = showAll && missing.length > 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          {/* Drag-to-dismiss. `enabled={!saving}` is the mid-save guard:
              a profile upsert in flight cannot be swiped away, so the save
              always finishes against a mounted sheet. Cancel semantics are
              unchanged — a dismissed sheet runs the same onCancel the X
              button does, so nothing is saved by dragging. */}
          <SwipeDownSheet
            style={styles.sheet}
            enabled={!saving && !saveDone}
            onDismiss={onCancel}
          >
            <View style={styles.sheetHeader}>
              <ThemedText style={styles.sheetTitle}>
                {isNewProfile ? t("profile.editBasicData") : title}
              </ThemedText>
              <Pressable onPress={onCancel} style={styles.closeButton} accessibilityRole="button">
                <X size={15} color={colors.accent} />
              </Pressable>
            </View>

            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
            >
              {section === "vikt" && !isNewProfile && (
                <View style={{ gap: spacing[4] }}>
                  <HelperText>{t("profile.weightEditHelp")}</HelperText>
                  <EditNumField
                    label={t("profile.weight")}
                    unit="kg"
                    value={form.weightKg}
                    onChange={(v) => onChange({ weightKg: v })}
                    placeholder="75"
                  />
                </View>
              )}

              {showAll && <SectionHeading text={t("profile.sectionBasics")} first />}

              {(section === "grunddata" || showAll) && (
                <View style={{ gap: spacing[4] }} onLayout={registerAnchor("basics")}>
                  <View style={{ gap: 6 }}>
                    <FieldLabel>{t("profile.gender")}</FieldLabel>
                    <PillPair
                      options={[
                        { value: "Male", label: t("profile.genderMale") },
                        { value: "Female", label: t("profile.genderFemale") },
                      ]}
                      value={form.gender ?? ""}
                      onChange={(g) => {
                        const gender = g as "Male" | "Female";
                        // Gender switch clears an invalid body-fat level, and
                        // the female-only answers when switching to male —
                        // the engine ignores them there, so keeping them
                        // would only preserve stale data.
                        const validBf = BODY_FAT_OPTIONS[gender].some(
                          (o) => o.value === form.bodyFatLevel
                        );
                        choose("basics", {
                          gender,
                          bodyFatLevel: validBf ? form.bodyFatLevel : null,
                          menopause: gender === "Female" ? form.menopause : null,
                          cyclePhase: gender === "Female" ? form.cyclePhase : null,
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
                </View>
              )}

              {showAll && (
                <View style={{ gap: 6, marginTop: spacing[5] }} onLayout={registerAnchor("bodyFat")}>
                  <FieldLabel optionalText={t("profile.optional")}>
                    {t("profile.bodyFat")}
                  </FieldLabel>
                  <HelperText>{t("profile.bodyFatHelper")}</HelperText>
                  <View style={styles.chipRow}>
                    {/* WAS: Linking.openURL to ruled.me — the same third-
                        party page for both genders, so "Visa guide för
                        män" never showed a men's guide, and an
                        openURL rejection failed silently with no catch,
                        which is what made it look dead. The guide is now
                        in-app and gender-specific, built from the
                        percentages the app already has in
                        BODY_FAT_OPTIONS. No browser, no dead end.
                        The "Vet inte – hoppa över" chip next to it was
                        removed: the field is already marked optional, so
                        it only offered a second way to do nothing. */}
                    <Pressable
                      onPress={() => setGuideOpen(true)}
                      style={styles.linkChip}
                      accessibilityRole="button"
                    >
                      <ThemedText style={styles.linkChipText}>
                        {form.gender === "Female"
                          ? t("profile.bodyFatGuideFemale")
                          : t("profile.bodyFatGuideMale")}
                      </ThemedText>
                    </Pressable>
                  </View>
                  <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
                    {bfOptions.map((opt) => (
                      <SelectRow
                        key={opt.value}
                        label={opt.label}
                        rightText={t(`profileOptions.bodyFatDesc.${opt.value}`)}
                        active={form.bodyFatLevel === opt.value}
                        onPress={() => choose("bodyFat", { bodyFatLevel: opt.value })}
                      />
                    ))}
                  </View>
                </View>
              )}

              {showAll && <SectionHeading text={t("profile.sectionActivity")} />}

              {(section === "aktivitet" || showAll) && (
                <View style={{ gap: spacing[5] }}>
                  <HelperText>{t("profile.activityIntro")}</HelperText>

                  <View style={{ gap: 6 }} onLayout={registerAnchor("activityType")}>
                    <FieldLabel>{t("profile.dailyActivity")}</FieldLabel>
                    <View style={{ gap: spacing[2] }}>
                      {ACTIVITY_TYPE_OPTIONS.map((o) => (
                        <OptionCard
                          key={o.value}
                          label={t(`profileOptions.activityType.${o.value}.label`)}
                          description={t(`profileOptions.activityType.${o.value}.description`)}
                          active={form.activityType === o.value}
                          onPress={() => choose("activityType", { activityType: o.value })}
                        />
                      ))}
                    </View>
                  </View>

                  {/* Steps and training were "(valfritt)" with a "Hoppa
                      över" link. They are not optional in any meaningful
                      sense: null scores 0 activity points, exactly like
                      "under 5 000 steg" and "tränar aldrig", and together
                      they are worth 8 of the score that picks the TDEE
                      multiplier. Skipping them silently produced a
                      sedentary plan, so the skip is gone. */}
                  <View style={{ gap: 6 }} onLayout={registerAnchor("steps")}>
                    <FieldLabel>{t("profile.stepsPerDay")}</FieldLabel>
                    <HelperText>{t("profile.stepsHelp")}</HelperText>
                    <View style={{ gap: spacing[2], marginTop: 4 }}>
                      {STEPS_OPTIONS.map((o) => (
                        <SelectRow
                          key={o.value}
                          label={t(`profileOptions.steps.${o.value}`)}
                          active={form.stepsRange === o.value}
                          onPress={() => choose("steps", { stepsRange: o.value })}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={{ gap: 6 }} onLayout={registerAnchor("training")}>
                    <FieldLabel>{t("profile.trainingSessions")}</FieldLabel>
                    <HelperText>{t("profile.trainingHelp")}</HelperText>
                    <View style={{ gap: spacing[2], marginTop: 4 }}>
                      {TRAINING_OPTIONS.map((o) => (
                        <SelectRow
                          key={o.value}
                          label={t(`profileOptions.training.${o.value}`)}
                          active={form.trainingSessions === o.value}
                          onPress={() => choose("training", { trainingSessions: o.value })}
                        />
                      ))}
                    </View>
                  </View>
                </View>
              )}

              {showAll && <SectionHeading text={t("profile.sectionGoal")} />}

              {(section === "mal" || showAll) && (
                <View style={{ gap: spacing[5] }}>
                  <View style={{ gap: 6 }} onLayout={registerAnchor("goal")}>
                    {/* Release P15: no duplicated "Mål" label — the modal
                        title already says it, so the helper line carries
                        the explanation and the options speak for
                        themselves. */}
                    <HelperText>{t("profile.primaryGoalHelp")}</HelperText>
                    <View style={{ gap: spacing[2], marginTop: 4 }}>
                      {PRIMARY_GOAL_OPTIONS.map((g) => (
                        <OptionCard
                          key={g.value}
                          label={t(`profileOptions.goal.${g.value}.label`)}
                          description={t(`profileOptions.goal.${g.value}.description`)}
                          active={form.primaryGoal === g.value}
                          onPress={() => {
                            const v = g.value as NonNullable<ProfileFormState["primaryGoal"]>;
                            // Maintain has no pace; switching goals clears an
                            // invalid pace (web parity).
                            const valid = GOAL_PACE_OPTIONS[v] ?? [];
                            choose("goal", {
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

                  {form.primaryGoal !== null && form.primaryGoal !== "Maintain" ? (
                    <View style={{ gap: 6 }} onLayout={registerAnchor("pace")}>
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
                            onPress={() => choose("pace", { goalPace: p.value })}
                          />
                        ))}
                      </View>
                    </View>
                  ) : form.primaryGoal === "Maintain" ? (
                    <View style={styles.maintainNote}>
                      <View style={styles.maintainDot} />
                      <ThemedText style={styles.maintainNoteText}>{t("profile.maintainNote")}</ThemedText>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Plan focus — reads straight into CalculateMacros (fat ×1.10
                  / ×0.90, protein ×0.95). It had no UI at all: the app sent
                  whatever the web had stored, so an app-only customer was
                  permanently on Balance without ever being asked. */}
              {showAll && (
                <>
                  <SectionHeading text={t("profile.sectionPlanFocus")} />
                  <View style={{ gap: 6 }} onLayout={registerAnchor("planFocus")}>
                    <HelperText>{t("profile.planFocusHelp")}</HelperText>
                    <View style={{ gap: spacing[2], marginTop: 4 }}>
                      {PLAN_FOCUS_OPTIONS.map((o) => (
                        <OptionCard
                          key={o.value}
                          label={t(`profileOptions.planFocus.${o.value}.label`)}
                          description={t(`profileOptions.planFocus.${o.value}.description`)}
                          active={form.planFocus === o.value}
                          onPress={() => choose("planFocus", { planFocus: o.value })}
                        />
                      ))}
                    </View>
                  </View>
                </>
              )}

              {/* Female-only cycle inputs — also previously unreachable in
                  the app, and worse: the save omitted them entirely, so
                  editing anything here WIPED a cycle phase set on the web
                  and quietly moved the target by 100 kcal. */}
              {showAll && form.gender === "Female" && (
                <>
                  <SectionHeading text={t("profile.sectionCycle")} />
                  <View style={{ gap: spacing[5] }}>
                    <View style={{ gap: 6 }} onLayout={registerAnchor("menopause")}>
                      <FieldLabel>{t("profile.menopauseLabel")}</FieldLabel>
                      <HelperText>{t("profile.menopauseHelp")}</HelperText>
                      <View style={{ gap: spacing[2], marginTop: 4 }}>
                        {MENOPAUSE_OPTIONS.map((o) => (
                          <OptionCard
                            key={o.value}
                            label={t(`profileOptions.menopause.${o.value}.label`)}
                            description={t(`profileOptions.menopause.${o.value}.description`)}
                            active={form.menopause === o.value}
                            onPress={() =>
                              choose("menopause", {
                                menopause: o.value,
                                // The phase only applies to an active cycle.
                                cyclePhase: o.value === "Cycling" ? form.cyclePhase : null,
                              })
                            }
                          />
                        ))}
                      </View>
                    </View>

                    {form.menopause === "Cycling" && (
                      <View style={{ gap: 6 }} onLayout={registerAnchor("cyclePhase")}>
                        <FieldLabel>{t("profile.cyclePhaseLabel")}</FieldLabel>
                        <HelperText>{t("profile.cyclePhaseHelp")}</HelperText>
                        <View style={{ gap: spacing[2], marginTop: 4 }}>
                          {CYCLE_PHASE_OPTIONS.map((o) => (
                            <SelectRow
                              key={o.value}
                              label={t(`profileOptions.cyclePhase.${o.value}.label`)}
                              rightText={t(`profileOptions.cyclePhase.${o.value}.days`, {
                                defaultValue: "",
                              })}
                              active={form.cyclePhase === o.value}
                              onPress={() => choose("cyclePhase", { cyclePhase: o.value })}
                            />
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* Live preview line (adaptation of the web's behind-modal plan card) */}
              {preview && preview.calorieTarget > 0 ? (
                <ThemedText style={styles.previewLine}>
                  {formatNumber(preview.calorieTarget, language)} {t("profile.kcalPerDay")} ·{" "}
                  {t("profile.macroProtein")} {preview.proteinG}g
                </ThemedText>
              ) : null}

              {/* What is still missing, named. The old flow let the save
                  through and filled the gaps with defaults. */}
              {gateSave ? (
                <View style={styles.missingBox}>
                  <ThemedText style={styles.missingIntro}>{t("profile.missingIntro")}</ThemedText>
                  {missing.map((id) => (
                    <ThemedText key={id} style={styles.missingItem}>
                      · {t(`profile.missingStep.${id}`)}
                    </ThemedText>
                  ))}
                </View>
              ) : null}

              {saveError ? <ThemedText style={styles.errorText}>{saveError}</ThemedText> : null}

              <Pressable
                onPress={onSave}
                disabled={saving || saveDone || gateSave}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && !saving && !gateSave && { backgroundColor: colors.accentHover },
                  (saving || saveDone || gateSave) && { opacity: 0.75 },
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving || saveDone || gateSave }}
              >
                <Check size={15} color={colors.textPrimary} strokeWidth={2.5} />
                <ThemedText style={styles.saveButtonText}>
                  {saveDone ? t("profile.saved") : saving ? t("profile.saving") : t("profile.save")}
                </ThemedText>
              </Pressable>
            </ScrollView>
          </SwipeDownSheet>
        </KeyboardAvoidingView>
        {/* iOS "Klar" bar above the numeric pad (P8). */}
        <NumericDoneBar />
      </View>

      {/* Gender-specific body-fat guide. Stacked inside this Modal rather
          than as a second top-level Modal: iOS will not present one over an
          already-open Modal, which would be a second dead end. */}
      {guideOpen && (
        <View style={styles.guideBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setGuideOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          />
          <View style={styles.guideCard} pointerEvents="box-none">
            <View style={styles.sheetHeader}>
              <ThemedText style={styles.sheetTitle}>
                {form.gender === "Female"
                  ? t("profile.bodyFatGuideFemale")
                  : t("profile.bodyFatGuideMale")}
              </ThemedText>
              <Pressable
                onPress={() => setGuideOpen(false)}
                style={styles.closeButton}
                accessibilityRole="button"
              >
                <X size={15} color={colors.accent} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.guideContent}>
              <HelperText>{t("profile.bodyFatGuideIntro")}</HelperText>
              {bfOptions.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    // Picking straight from the guide is the point: read the
                    // range, tap it, the guide closes with the value set.
                    onChange({ bodyFatLevel: opt.value });
                    setGuideOpen(false);
                  }}
                  style={styles.guideRow}
                  accessibilityRole="button"
                >
                  <ThemedText style={styles.guideRowLabel}>{opt.label}</ThemedText>
                  <ThemedText style={styles.guideRowDesc}>
                    {t(`profileOptions.bodyFatDesc.${opt.value}`)}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </Modal>
  );
}

/** Form tri-state → the backend's nullable bool. "PreferNotToSay" and
 *  "never asked" both send null; the difference matters to the form, not to
 *  the engine (which applies no adjustment either way). */
export function menopauseToApi(v: ProfileFormState["menopause"]): boolean | null {
  if (v === "Postmenopausal") return true;
  if (v === "Cycling") return false;
  return null;
}

/** Backend nullable bool → form tri-state. A stored null on a female
 *  profile is shown as unanswered, so the question gets asked once. */
export function menopauseFromApi(
  isPostmenopausal: boolean | null,
  gender: string
): ProfileFormState["menopause"] {
  if (gender !== "Female") return null;
  if (isPostmenopausal === true) return "Postmenopausal";
  if (isPostmenopausal === false) return "Cycling";
  return null;
}

/** Calm section divider for the combined profile page (P13). */
function SectionHeading({ text, first = false }: { text: string; first?: boolean }) {
  return (
    <View style={[styles.sectionHeading, first && styles.sectionHeadingFirst]}>
      <ThemedText style={styles.sectionHeadingText}>{text.toUpperCase()}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center" },
  sectionHeading: {
    marginTop: spacing[6],
    marginBottom: spacing[3],
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingTop: spacing[4],
  },
  sectionHeadingFirst: {
    marginTop: 0,
    borderTopWidth: 0,
    paddingTop: 0,
  },
  sectionHeadingText: {
    fontSize: 11,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.35)",
  },
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
  // In-app body-fat guide, stacked above the edit sheet.
  guideBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  guideCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: spacing[5],
    maxHeight: "80%",
  },
  guideContent: { paddingHorizontal: spacing[5], paddingBottom: spacing[4], gap: spacing[2] },
  guideRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  guideRowLabel: { fontSize: 15, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  guideRowDesc: { fontSize: 13, fontFamily: fontFamily.body, color: "rgba(255,255,255,0.66)" },
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
  missingBox: {
    marginTop: spacing[4],
    gap: 3,
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.25)",
    backgroundColor: "rgba(232,101,10,0.07)",
    borderRadius: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  missingIntro: { fontSize: 12.5, fontFamily: fontFamily.bodySemibold, color: colors.accent },
  missingItem: { fontSize: 12, lineHeight: 17, color: "rgba(255,255,255,0.62)" },
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
