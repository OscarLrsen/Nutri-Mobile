import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { authCopy } from "@/constants/copy";
import { colors, fontFamily, spacing } from "@/theme";

interface AuthTextFieldProps extends TextInputProps {
  label: string;
  /** Leading icon inside the field (web AuthField's `icon`). */
  icon?: ReactNode;
  /** Field-level validation error, rendered below (web AuthField's `error`). */
  error?: string;
  /** Renders the show/hide-password eye and toggles secureTextEntry. */
  isPassword?: boolean;
  /** Renders "(valfritt)" after the label (web AuthField's `optional`). */
  optional?: boolean;
  /** Trailing element on the label row (web: the "Glömt lösenord?" link). */
  trailing?: ReactNode;
}

/**
 * Native port of the web's AuthFormUI AuthField: label row (+ optional
 * trailing link), icon-prefixed input, show/hide-password toggle, and an
 * error line. Visual details are preliminary (Fable design source missing) —
 * structure and behavior follow the web component.
 */
export function AuthTextField({
  label,
  icon,
  error,
  isPassword = false,
  optional = false,
  trailing,
  style,
  ...inputProps
}: AuthTextFieldProps) {
  const [showPw, setShowPw] = useState(false);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <ThemedText style={styles.label}>
          {label}
          {optional ? <ThemedText style={styles.optional}> {authCopy.optional}</ThemedText> : null}
        </ThemedText>
        {trailing}
      </View>
      <View style={[styles.inputWrap, !!error && styles.inputWrapError]}>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <TextInput
          {...inputProps}
          style={[styles.input, style]}
          secureTextEntry={isPassword && !showPw}
          placeholderTextColor="rgba(255,255,255,0.28)"
        />
        {isPassword && (
          <Pressable
            onPress={() => setShowPw((v) => !v)}
            style={styles.eyeButton}
            accessibilityRole="button"
            accessibilityLabel={showPw ? authCopy.hidePassword : authCopy.showPassword}
          >
            {showPw ? (
              <EyeOff size={16} color="rgba(255,255,255,0.4)" strokeWidth={1.6} />
            ) : (
              <Eye size={16} color="rgba(255,255,255,0.4)" strokeWidth={1.6} />
            )}
          </Pressable>
        )}
      </View>
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: {
    fontSize: 12.5,
    fontFamily: fontFamily.bodySemibold,
    color: "rgba(255,255,255,0.72)",
  },
  optional: { fontSize: 11.5, fontFamily: fontFamily.body, color: "rgba(255,255,255,0.4)" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingHorizontal: spacing[3],
  },
  inputWrapError: { borderColor: "rgba(248,113,113,0.5)" },
  icon: { marginRight: spacing[2] },
  input: {
    flex: 1,
    height: 48,
    fontSize: 15,
    fontFamily: fontFamily.body,
    color: colors.textPrimary,
  },
  eyeButton: { padding: 6 },
  error: { fontSize: 12, color: "#F87171" },
});
