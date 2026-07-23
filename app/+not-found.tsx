import { Link, Stack } from "expo-router";
import { StyleSheet } from "react-native";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { useTranslation } from "@/i18n";
import { spacing } from "@/theme";

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Stack.Screen options={{ title: t("common.notFoundTitle") }} />
      <ThemedText variant="title" style={styles.title}>
        {t("common.pageNotFound")}
      </ThemedText>
      <Link href="/" style={styles.link}>
        <ThemedText variant="body" color="accent">
          {t("common.goToMenu")}
        </ThemedText>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    textAlign: "center",
    marginTop: spacing[10],
  },
  link: {
    marginTop: spacing[4],
    alignSelf: "center",
  },
});
