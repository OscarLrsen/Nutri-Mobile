import { Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Check } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Shared edit-modal fields — ports of the web profile page's EditNumField /
 * EditOptionGroup / option-row buttons (same select styling: orange border +
 * tinted background + check marker on the active option).
 *
 * KEYBOARD DISMISSAL. The iOS numeric pad has NO return key, so a numeric
 * field needs a "Klar" of its own or the keyboard can only be closed by
 * luck. Android gets returnKeyType="done" + dismissal on submit, which its
 * keyboard does show, and is left alone.
 */

/**
 * The "Klar" bar that sits above the keyboard.
 *
 * ── WHY THIS IS A PLAIN VIEW AND NOT AN InputAccessoryView ───────────
 *
 * It WAS an InputAccessoryView, and on the profile sheet it never appeared
 * — the reported "det finns ingen tydlig Klar". That component attaches to
 * the first responder of the app's ROOT window, and the profile sheet lives
 * inside a React Native `Modal`, which iOS presents in a window of its own.
 * The bar was registered in the wrong window, so nothing was ever shown
 * above the numeric pad. (MacroAdjustScreen uses an InputAccessoryView too
 * and it works there — because it is a full screen, not a modal. That
 * contrast is the whole diagnosis, and it is why that screen is untouched.)
 *
 * The caller renders this at the bottom of the sheet, below the scroll area,
 * while a numeric field has focus. The KeyboardAvoidingView already lifts
 * the card to rest on the keyboard, so the sheet's own bottom edge is the
 * strip directly above it — the same place the accessory view was supposed
 * to occupy, reached by ordinary layout that cannot be in the wrong window.
 */
export function NumericDoneBar({ visible }: { visible: boolean }) {
  const { t } = useTranslation();

  // iOS only: this exists because the numeric pad there has no return key.
  if (Platform.OS !== "ios" || !visible) return null;

  return (
    <View style={styles.accessoryBar}>
      <Pressable
        onPress={() => Keyboard.dismiss()}
        accessibilityRole="button"
        accessibilityLabel={t("common.done")}
        hitSlop={8}
        style={({ pressed }) => [styles.accessoryDone, pressed && { opacity: 0.7 }]}
      >
        <ThemedText style={styles.accessoryDoneText}>{t("common.done")}</ThemedText>
      </Pressable>
    </View>
  );
}

export function FieldLabel({
  children,
  optionalText,
}: {
  children: string;
  optionalText?: string;
}) {
  return (
    <ThemedText style={styles.fieldLabel}>
      {children}
      {optionalText ? <ThemedText style={styles.optional}> ({optionalText})</ThemedText> : null}
    </ThemedText>
  );
}

export function HelperText({ children }: { children: string }) {
  return <ThemedText style={styles.helper}>{children}</ThemedText>;
}

export function EditNumField({
  label,
  unit,
  value,
  onChange,
  placeholder,
  onFocus,
  onDone,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** The field took focus. Lets the caller tell "moved to the next number in
   *  this block" apart from "finished with the block". */
  onFocus?: () => void;
  /** The customer left the field — Done, "Klar", or a tap elsewhere. Whether
   *  that actually advances the form is the caller's decision, not this
   *  component's. */
  onDone?: () => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={(v) => onChange(v.replace(/[^\d.,]/g, "").replace(",", "."))}
          placeholder={placeholder}
          placeholderTextColor="#4E4A46"
          keyboardType="numeric"
          returnKeyType="done"
          onFocus={onFocus}
          // Both routes out of the field end here: the keyboard closing
          // blurs the input, and so does tapping the next one.
          onBlur={onDone}
          onSubmitEditing={() => Keyboard.dismiss()}
          style={styles.input}
        />
        <ThemedText style={styles.unit}>{unit}</ThemedText>
      </View>
    </View>
  );
}

/** Option row with title + optional description + optional note (goal/pace style). */
export function OptionCard({
  label,
  description,
  note,
  active,
  onPress,
}: {
  label: string;
  description?: string;
  note?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.optionCard, active && styles.optionCardActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <ThemedText style={[styles.optionLabel, active && { color: colors.accent }]}>
        {label}
      </ThemedText>
      {description ? (
        <ThemedText
          style={[styles.optionDesc, active && { color: "rgba(232,101,10,0.7)" }]}
        >
          {description}
        </ThemedText>
      ) : null}
      {note ? (
        <ThemedText
          style={[styles.optionNote, active && { color: "rgba(232,101,10,0.62)" }]}
        >
          {note}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

/** Compact select row with a right-aligned check marker (steps/training/bodyfat). */
export function SelectRow({
  label,
  rightText,
  active,
  onPress,
}: {
  label: string;
  rightText?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.selectRow, active && styles.optionCardActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <ThemedText
        style={[styles.selectRowLabel, active && { color: colors.accent, fontFamily: fontFamily.bodySemibold }]}
      >
        {label}
      </ThemedText>
      <View style={styles.selectRowRight}>
        {rightText ? (
          <ThemedText style={[styles.selectRowDesc, active && { color: "rgba(232,101,10,0.85)" }]}>
            {rightText}
          </ThemedText>
        ) : null}
        {active && (
          <View style={styles.checkCircle}>
            <Check size={9} color={colors.textPrimary} strokeWidth={2.5} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** Two-column pill selector (gender). */
export function PillPair({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.pillRow}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.pill, active && styles.optionCardActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
          >
            <ThemedText
              style={[styles.pillLabel, active && { color: colors.accent }]}
            >
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: { gap: 6 },
  accessoryBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "#1C1C1E",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  // A real touch target rather than the width of the word.
  accessoryDone: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  accessoryDoneText: {
    fontSize: 15,
    fontFamily: fontFamily.bodySemibold,
    color: colors.accent,
  },
  fieldLabel: { fontSize: 14, fontFamily: fontFamily.bodyMedium, color: "#8A8480" },
  optional: { fontSize: 12, fontFamily: fontFamily.body, color: "#4E4A46" },
  helper: { fontSize: 12, lineHeight: 16, color: "rgba(255,255,255,0.4)" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: spacing[4],
  },
  input: {
    flex: 1,
    height: 46,
    fontSize: 14,
    fontFamily: fontFamily.body,
    color: "#F2EEE8",
    padding: 0,
  },
  unit: { fontSize: 14, color: "#4E4A46" },
  optionCard: {
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#17171A",
    borderRadius: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: 3,
  },
  optionCardActive: {
    borderColor: colors.accent,
    backgroundColor: "rgba(232,101,10,0.10)",
  },
  optionLabel: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: "#F2EEE8", letterSpacing: -0.2 },
  optionDesc: { fontSize: 12, lineHeight: 16, color: "rgba(255,255,255,0.45)" },
  optionNote: { marginTop: 2, fontSize: 11.5, lineHeight: 15, color: "rgba(255,255,255,0.42)" },
  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: 11,
  },
  selectRowLabel: { flex: 1, fontSize: 14, color: "#8A8480" },
  selectRowRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  selectRowDesc: { fontSize: 12, color: "#4E4A46" },
  checkCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  pillRow: { flexDirection: "row", gap: spacing[3] },
  pill: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pillLabel: { fontSize: 14, fontFamily: fontFamily.bodyMedium, color: "#8A8480" },
});
