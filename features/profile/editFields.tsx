import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Check } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Shared edit-modal fields — ports of the web profile page's EditNumField /
 * EditOptionGroup / option-row buttons (same select styling: orange border +
 * tinted background + check marker on the active option).
 */

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
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
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
