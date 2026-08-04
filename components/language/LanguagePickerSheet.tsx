import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Check, X } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { SUPPORTED_LANGUAGES, useLanguage, useTranslation, type AppLanguage } from "@/i18n";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Bottom sheet for picking the app language. The single language-selection
 * UI in the app — Mina sidor, LoggedOutHome and the auth screens all open
 * this same sheet (directly or via LanguageButton).
 *
 * Language names are ALWAYS the languages' own native labels from
 * SUPPORTED_LANGUAGES (Svenska / English / Dansk) — never translated.
 * Selection applies instantly via LanguageProvider.setLanguage (which also
 * persists locally); there is no backend sync in this phase, so no spinner.
 */
export function LanguagePickerSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  const choose = async (code: AppLanguage) => {
    try {
      await setLanguage(code);
    } catch {
      // Persistence failure must never trap the user in the sheet — the
      // in-memory language has already switched.
    }
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("language.close")}
        />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>{t("language.selectLanguage")}</ThemedText>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t("language.close")}
            >
              <X size={13} color={colors.accent} strokeWidth={1.7} />
            </Pressable>
          </View>

          <View style={styles.list}>
            {SUPPORTED_LANGUAGES.map((lang, i) => {
              const selected = lang.code === language;
              return (
                <Pressable
                  key={lang.code}
                  onPress={() => choose(lang.code)}
                  style={[styles.row, i < SUPPORTED_LANGUAGES.length - 1 && styles.rowBorder]}
                  accessibilityRole="radio"
                  accessibilityLabel={lang.nativeLabel}
                  accessibilityState={{ selected, checked: selected }}
                >
                  <ThemedText style={[styles.rowText, selected && styles.rowTextSelected]}>
                    {lang.nativeLabel}
                  </ThemedText>
                  {selected && <Check size={16} color={colors.accent} strokeWidth={2.2} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "rgba(20,20,22,0.98)",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
    paddingBottom: spacing[8],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  title: {
    fontSize: 17,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(232,101,10,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  list: { paddingHorizontal: 18, paddingTop: spacing[2] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingVertical: spacing[4],
    minHeight: 48,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  rowText: {
    fontSize: 15,
    fontFamily: fontFamily.bodyMedium,
    letterSpacing: -0.1,
    color: colors.textPrimary,
  },
  rowTextSelected: { color: colors.accent },
});
