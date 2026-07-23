import { useState } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Globe } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { SUPPORTED_LANGUAGES, useLanguage, useTranslation } from "@/i18n";
import { colors, fontFamily, spacing } from "@/theme";

import { LanguagePickerSheet } from "./LanguagePickerSheet";

/**
 * Discreet globe pill showing the current language's native label; opens the
 * shared LanguagePickerSheet. Used on LoggedOutHome and the auth screens so
 * signed-out users can switch language — one trigger, one picker, no
 * per-screen reimplementations.
 */
export function LanguageButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === language);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }, style]}
        accessibilityRole="button"
        accessibilityLabel={t("language.changeLanguage")}
        accessibilityValue={{ text: current?.nativeLabel }}
        hitSlop={8}
      >
        <Globe size={13} color={colors.textSecondary} strokeWidth={1.8} />
        <ThemedText style={styles.pillText}>{current?.nativeLabel}</ThemedText>
      </Pressable>
      <LanguagePickerSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  pillText: {
    fontSize: 12,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textSecondary,
    letterSpacing: -0.1,
  },
});
