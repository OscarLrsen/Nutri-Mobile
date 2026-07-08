import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/ui/ThemedText";
import { useAuth } from "@/services/auth/AuthProvider";
import { landingCopy as copy } from "@/constants/copy";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Heldagsmåltid — port of the web's landing FullDayMeal.tsx (dark premium
 * card: ADVANCED badge, lock badge when logged out, benefit checklist,
 * login-gated CTA). Colors are the web card's own palette (#1A1410 warm
 * dark, #2A1F14 border, #C9BFB5/#8A7F76 warm text) — deliberately not theme
 * tokens, matching the source component's inline styles.
 *
 * Deviations (documented):
 * - The web's radial orange glow is approximated with a static translucent
 *   circle (RN has no radial-gradient without extra deps).
 * - Logged-out CTA goes to /logga-in with a return path to /heldag (the web
 *   links to /registrera); logged-in CTA opens the IN-APP /heldag flow —
 *   the web's href={isLoggedIn ? "/heldag" : …} mapped onto the native
 *   route.
 */
export function FullDayMealCard() {
  const router = useRouter();
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const handleCta = () => {
    if (isLoggedIn) {
      router.push("/heldag");
    } else {
      router.push({ pathname: "/logga-in", params: { next: "/heldag" } });
    }
  };

  return (
    <View style={styles.card}>
      {/* Static stand-in for the web's radial orange glow (top right) */}
      <View style={styles.glow} pointerEvents="none" />

      {/* Badges */}
      <View style={styles.badgeRow}>
        <View style={styles.advancedBadge}>
          <ThemedText style={styles.advancedBadgeText}>{copy.fulldayAdvanced}</ThemedText>
        </View>
        {!isLoggedIn && (
          <View style={styles.lockBadge}>
            <ThemedText style={styles.lockBadgeText}>🔒 {copy.fulldayLoginRequired}</ThemedText>
          </View>
        )}
      </View>

      {/* Heading */}
      <ThemedText style={styles.heading}>{copy.fulldayHeading}</ThemedText>
      <ThemedText style={styles.subheading}>{copy.fulldaySubheading}</ThemedText>

      {/* Benefits */}
      <View style={styles.benefits}>
        {copy.fulldayBenefits.map((item) => (
          <View key={item} style={styles.benefitRow}>
            <ThemedText style={styles.benefitCheck}>✓</ThemedText>
            <ThemedText style={styles.benefitText}>{item}</ThemedText>
          </View>
        ))}
      </View>

      {/* CTA */}
      <Pressable
        onPress={handleCta}
        style={({ pressed }) => [
          isLoggedIn ? styles.ctaSolid : styles.ctaOutline,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={isLoggedIn ? copy.fulldayCtaOrder : copy.fulldayCtaLogin}
      >
        <ThemedText style={isLoggedIn ? styles.ctaSolidText : styles.ctaOutlineText}>
          {isLoggedIn ? copy.fulldayCtaOrder : copy.fulldayCtaLogin}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderRadius: 16,
    padding: spacing[5],
    backgroundColor: "#1A1410",
    borderWidth: 1,
    borderColor: "#2A1F14",
  },
  glow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "rgba(232,101,10,0.10)",
  },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginBottom: spacing[3] },
  advancedBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.accent,
  },
  advancedBadgeText: {
    fontSize: 9,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#FFFFFF",
  },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  lockBadgeText: { fontSize: 10, fontFamily: fontFamily.bodySemibold, color: "#888888" },
  heading: {
    fontSize: 20,
    fontFamily: fontFamily.bodyBold,
    textTransform: "uppercase",
    letterSpacing: -0.2,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  subheading: { fontSize: 13.5, color: "#8A7F76", marginBottom: spacing[4] },
  benefits: { gap: spacing[2], marginBottom: spacing[5] },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  benefitCheck: { fontSize: 13.5, color: colors.accent },
  benefitText: { fontSize: 13.5, color: "#C9BFB5" },
  ctaSolid: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  ctaSolidText: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: "#FFFFFF" },
  ctaOutline: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,101,10,0.15)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.3)",
  },
  ctaOutlineText: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: colors.accent },
});
