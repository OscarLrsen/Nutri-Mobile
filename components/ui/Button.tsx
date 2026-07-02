import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from "react-native";

import { colors, radius, spacing } from "@/theme";
import { ThemedText } from "./ThemedText";

type Variant = "primary" | "secondary";

interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  variant?: Variant;
  loading?: boolean;
}

/**
 * Primary/secondary button, matching Nutri-Frontend's button pattern (spec
 * §15.6): --radius-btn (10px), accent-orange fill for primary, accent-hover
 * on press (RN has no :hover, so the "press" state substitutes for the
 * web's hover-darken behavior), reduced opacity + no-op press when disabled
 * or loading.
 */
export function Button({ label, variant = "primary", loading = false, disabled, style, ...rest }: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" ? styles.primary : styles.secondary,
        pressed && !isDisabled && (variant === "primary" ? styles.primaryPressed : styles.secondaryPressed),
        isDisabled && styles.disabled,
        typeof style === "function" ? undefined : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.textPrimary : colors.accent} />
      ) : (
        <ThemedText
          variant="bodyMedium"
          color={variant === "primary" ? "textPrimary" : "accent"}
        >
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.btn,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  primary: {
    backgroundColor: colors.accent,
  },
  primaryPressed: {
    backgroundColor: colors.accentHover,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryPressed: {
    backgroundColor: colors.accentSoft,
  },
  disabled: {
    opacity: 0.5,
  },
});
