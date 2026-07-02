import { Pressable, StyleSheet, View } from "react-native";
import { ArrowRight, Star } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import type { ApiMealDistribution, MacroTargetDto } from "@/services/api/nutrition";
import { nutriAnpassarCopy as copy } from "@/constants/copy";
import { colors, fontFamily, radius, spacing } from "@/theme";
import type { WizardSlot } from "./optimizer";

export type { WizardSlot };

/**
 * Step 1 — slot picker. Port of the web's components/anpassar/StepSlot.tsx:
 * V1 shows three slots (Frukost/Lunch/Middag), state derived purely from the
 * Stockholm wall clock (active window → highlighted card with target macros;
 * upcoming → "Öppnar kl H"; past → still selectable, "Serveras {window}").
 * Store closed shows an informational banner but never locks browsing —
 * ordering is blocked later at the CTA (web parity).
 */

type ShownSlot = "Frukost" | "Lunch" | "Middag";
const SLOTS: ShownSlot[] = ["Frukost", "Lunch", "Middag"];

const SLOT_WINDOW: Record<WizardSlot, string> = {
  Frukost: "10–11",
  Lunch: "11–14",
  Middag: "17–20",
  Mellanmål: "14–17",
};

const SLOT_OPEN_HOURS: Record<ShownSlot, { from: number; to: number }> = {
  Frukost: { from: 10, to: 11 },
  Lunch: { from: 11, to: 14 },
  Middag: { from: 17, to: 20 },
};

type SlotState = "active" | "upcoming" | "past";

function getStockholmHour(): number {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Europe/Stockholm",
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour");
  return h ? Number(h.value) : new Date().getHours();
}

function getSlotState(slot: ShownSlot, hour: number): SlotState {
  const { from, to } = SLOT_OPEN_HOURS[slot];
  if (hour >= from && hour < to) return "active";
  if (hour < from) return "upcoming";
  return "past";
}

interface Props {
  meals: ApiMealDistribution[];
  remainingToday: MacroTargetDto | null;
  isClosed: boolean;
  onSelect: (slot: WizardSlot) => void;
}

export function StepSlot({ meals, remainingToday, isClosed, onSelect }: Props) {
  const swHour = getStockholmHour();
  const totalProtein = meals.reduce((sum, m) => sum + m.proteinG, 0);

  const targetFor = (slot: WizardSlot) => meals.find((m) => m.label === slot);

  const getUpcomingSubText = (slot: ShownSlot) => {
    const { from } = SLOT_OPEN_HOURS[slot];
    return swHour >= from ? copy.slotChooseMealType : copy.slotOpensAt(from);
  };

  return (
    <View>
      {/* Hero */}
      <View style={styles.hero}>
        <ThemedText style={styles.heroTitle}>{copy.slotHeroTitle}</ThemedText>
        <ThemedText style={styles.heroSubtitle}>{copy.slotHeroSubtitle}</ThemedText>
      </View>

      {/* Remaining-today info (web: shown when < 600 kcal left) */}
      {remainingToday && remainingToday.calories < 600 && (
        <RemainingInfoCard remaining={remainingToday} />
      )}

      {/* Closed banner */}
      {isClosed && (
        <View style={styles.infoCard}>
          <ThemedText style={styles.infoCardTitle}>{copy.slotClosedTitle}</ThemedText>
          <ThemedText style={styles.infoCardBody}>{copy.slotClosedBody}</ThemedText>
        </View>
      )}

      {/* Slot list */}
      <View style={styles.slotList}>
        {SLOTS.map((slot) => {
          const state = getSlotState(slot, swHour);
          if (state === "active") {
            return (
              <ActiveMealCard key={slot} slot={slot} target={targetFor(slot)} onSelect={onSelect} />
            );
          }
          return (
            <UpcomingMealCard
              key={slot}
              slot={slot}
              subText={
                state === "upcoming" ? getUpcomingSubText(slot) : copy.slotServed(SLOT_WINDOW[slot])
              }
              onSelect={onSelect}
            />
          );
        })}
      </View>

      {/* Goal footer */}
      {totalProtein > 0 && (
        <View style={styles.goalFooter}>
          <View style={styles.goalDot} />
          <ThemedText style={styles.goalText}>{copy.slotBasedOnGoal}</ThemedText>
          <ThemedText style={styles.goalValue}>{copy.slotProteinPerDay(totalProtein)}</ThemedText>
        </View>
      )}
    </View>
  );
}

function RemainingInfoCard({ remaining }: { remaining: MacroTargetDto }) {
  const GREEN = "#22c55e";
  let title: string;
  let sub: string;
  let color: string;

  if (remaining.calories <= 0 && remaining.proteinG <= 0) {
    title = copy.remainingGoalReachedTitle;
    sub = copy.remainingGoalReachedSub;
    color = GREEN;
  } else if (remaining.calories < 300 && remaining.proteinG > 0) {
    title = copy.remainingLowEnergyTitle;
    sub = copy.remainingLowEnergySub;
    color = colors.accent;
  } else {
    title = copy.remainingLeftToday(remaining.calories, remaining.proteinG);
    sub = copy.remainingLightMeal;
    color = "rgba(255,255,255,0.5)";
  }

  return (
    <View style={styles.infoCard}>
      <ThemedText style={[styles.infoCardTitle, { color }]}>{title}</ThemedText>
      <ThemedText style={styles.infoCardBody}>{sub}</ThemedText>
    </View>
  );
}

function ActiveMealCard({
  slot,
  target,
  onSelect,
}: {
  slot: WizardSlot;
  target: ApiMealDistribution | undefined;
  onSelect: (slot: WizardSlot) => void;
}) {
  const label = copy.slotNames[slot] ?? slot;
  return (
    <Pressable
      onPress={() => onSelect(slot)}
      style={({ pressed }) => [
        styles.slotCard,
        styles.slotCardActive,
        pressed && { borderColor: "rgba(232,101,10,0.85)" },
      ]}
      accessibilityRole="button"
      accessibilityLabel={copy.chooseSlotAria(label)}
    >
      <View style={styles.slotCardRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.slotTitleRow}>
            <ThemedText style={styles.slotTitle}>{label}</ThemedText>
            <View style={styles.windowPill}>
              <ThemedText style={styles.windowPillText}>{SLOT_WINDOW[slot]}</ThemedText>
            </View>
          </View>
          {target && (
            <View style={styles.slotMacroRow}>
              <ThemedText style={styles.slotKcal}>{target.calories} kcal</ThemedText>
              <View style={styles.macroDot} />
              <ThemedText style={styles.slotProtein}>{target.proteinG}g protein</ThemedText>
            </View>
          )}
          <View style={styles.adaptedRow}>
            <Star size={11} color={colors.accent} strokeWidth={1.2} fill="rgba(232,101,10,0.15)" />
            <ThemedText style={styles.adaptedText}>{copy.slotAdapted}</ThemedText>
          </View>
        </View>
        <View style={styles.arrowCircleActive}>
          <ArrowRight size={14} color={colors.textPrimary} strokeWidth={2.25} />
        </View>
      </View>
    </Pressable>
  );
}

function UpcomingMealCard({
  slot,
  subText,
  onSelect,
}: {
  slot: WizardSlot;
  subText: string;
  onSelect: (slot: WizardSlot) => void;
}) {
  const label = copy.slotNames[slot] ?? slot;
  return (
    <Pressable
      onPress={() => onSelect(slot)}
      style={({ pressed }) => [
        styles.slotCard,
        styles.slotCardUpcoming,
        pressed && { borderColor: "rgba(232,101,10,0.48)" },
      ]}
      accessibilityRole="button"
      accessibilityLabel={copy.chooseSlotAria(label)}
    >
      <View style={styles.slotCardRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.slotTitleRow}>
            <ThemedText style={[styles.slotTitle, { color: "rgba(255,255,255,0.72)" }]}>
              {label}
            </ThemedText>
            <View style={styles.windowPill}>
              <ThemedText style={[styles.windowPillText, { color: "rgba(255,255,255,0.38)" }]}>
                {SLOT_WINDOW[slot]}
              </ThemedText>
            </View>
          </View>
          <ThemedText style={styles.upcomingSub}>{subText}</ThemedText>
        </View>
        <View style={styles.arrowCircleUpcoming}>
          <ArrowRight size={13} color="rgba(232,101,10,0.70)" strokeWidth={2.25} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: spacing[5], paddingTop: spacing[5], paddingBottom: spacing[5] },
  heroTitle: {
    fontSize: 26,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.8,
    color: colors.textPrimary,
    marginBottom: spacing[2],
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 320,
    color: "rgba(255,255,255,0.42)",
  },
  infoCard: {
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  infoCardTitle: {
    fontSize: 13,
    fontFamily: fontFamily.bodySemibold,
    color: "rgba(255,255,255,0.55)",
    marginBottom: 3,
    lineHeight: 18,
  },
  infoCardBody: { fontSize: 11.5, lineHeight: 16, color: "rgba(255,255,255,0.35)" },
  slotList: { paddingHorizontal: spacing[4], paddingTop: spacing[1], gap: 10 },
  slotCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: 13,
    overflow: "hidden",
  },
  slotCardActive: { borderColor: "rgba(232,101,10,0.55)" },
  slotCardUpcoming: { borderColor: "rgba(232,101,10,0.22)" },
  slotCardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing[4],
  },
  slotTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginBottom: 6 },
  slotTitle: {
    fontSize: 17,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  windowPill: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  windowPillText: {
    fontSize: 10,
    fontFamily: fontFamily.mono,
    letterSpacing: 0.3,
    color: "rgba(255,255,255,0.5)",
  },
  slotMacroRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 6 },
  slotKcal: {
    fontSize: 13,
    fontFamily: fontFamily.mono,
    letterSpacing: -0.2,
    color: "rgba(255,255,255,0.6)",
  },
  macroDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  slotProtein: {
    fontSize: 13,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.2,
    color: colors.accent,
  },
  adaptedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  adaptedText: { fontSize: 11.5, lineHeight: 16, color: "rgba(255,255,255,0.4)" },
  upcomingSub: { fontSize: 11, fontFamily: fontFamily.mono, color: "rgba(232,101,10,0.65)" },
  arrowCircleActive: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowCircleUpcoming: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(232,101,10,0.10)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  goalFooter: {
    marginTop: spacing[5],
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[8],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  goalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  goalText: { fontSize: 12, color: "rgba(255,255,255,0.5)" },
  goalValue: {
    fontSize: 12,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: -0.2,
    color: colors.accent,
  },
});
