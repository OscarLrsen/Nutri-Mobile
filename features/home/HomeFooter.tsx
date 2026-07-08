import { Linking, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/ui/ThemedText";
import { env } from "@/lib/env";
import { landingCopy as copy } from "@/constants/copy";
import { fontFamily, spacing } from "@/theme";

/**
 * Footer — port of the web's NutriFooter.tsx (marketing variant): centered
 * link row (Köpvillkor / Integritet / Kontakt) + © line. Köpvillkor and
 * Integritet open the WEB app's pages in the browser (the established
 * web-handoff pattern, same as the cart's terms link); Kontakt is the web
 * footer's own mailto:info@nutrifoodtruck.com.
 */

const LINKS = [
  { label: copy.footerTerms, url: `${env.EXPO_PUBLIC_WEB_URL}/kopvillkor` },
  { label: copy.footerPrivacy, url: `${env.EXPO_PUBLIC_WEB_URL}/integritet` },
  { label: copy.footerContact, url: "mailto:info@nutrifoodtruck.com" },
] as const;

export function HomeFooter() {
  return (
    <View style={styles.footer} accessibilityLabel="Sidfot">
      <View style={styles.linkRow}>
        {LINKS.map(({ label, url }) => (
          <Pressable
            key={label}
            onPress={() => Linking.openURL(url).catch(() => {})}
            accessibilityRole="link"
            accessibilityLabel={label}
            hitSlop={6}
          >
            <ThemedText style={styles.link}>{label}</ThemedText>
          </Pressable>
        ))}
      </View>
      <ThemedText style={styles.copyright}>{copy.footerCopyright}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingTop: spacing[5],
    paddingBottom: spacing[8],
    paddingHorizontal: spacing[5],
  },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: 14,
    rowGap: 4,
    marginBottom: 7,
  },
  link: { fontSize: 11, fontFamily: fontFamily.bodyMedium, color: "rgba(255,255,255,0.3)" },
  copyright: { fontSize: 11, color: "rgba(255,255,255,0.16)" },
});
