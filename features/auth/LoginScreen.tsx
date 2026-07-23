import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ArrowLeft, Lock, Mail, Shield } from "lucide-react-native";

import { LanguageButton } from "@/components/language/LanguageButton";
import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { AuthTextField } from "@/components/auth/AuthTextField";
import { supabase } from "@/services/auth/supabase";
import { useAuth } from "@/services/auth/AuthProvider";
import { env } from "@/lib/env";
import { useTranslation } from "@/i18n";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Login — port of the web (auth)/logga-in/page.tsx: same field validation
 * (email regex + required messages), same supabase.auth.signInWithPassword
 * call, same single "Felaktigt e-post eller lösenord" error for any auth
 * failure, same links (create account, forgot password) and security line.
 *
 * Adaptations (documented, not guessed):
 * - `next` param mirrors the web's ?next= return-to flow; without it we
 *   router.back() (mobile has a navigation stack; the web defaults to "/").
 *   Only in-app paths are accepted — same open-redirect guard idea as the
 *   web's getSafeNext, trivially satisfied since Href values are app routes.
 * - "Håll mig inloggad" is not ported: the web toggles localStorage vs
 *   sessionStorage, a browser-tab concept with no RN equivalent — the
 *   session always persists in SecureStore.
 * - "Glömt lösenord?" opens the web app's /glomt-losenord in the browser
 *   (the reset flow lives on the web; mobile has no reset route yet).
 */
export function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  const goNext = () => {
    if (next && next.startsWith("/")) {
      router.replace(next as Href);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  // Auth guard — an already-authenticated user shouldn't see the login form
  // (web parity: redirect away). Deliberately not run while a login submit
  // is in flight; goNext() in handleLogin owns that navigation.
  useEffect(() => {
    if (authLoading || !user || loading) return;
    goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const handleLogin = async () => {
    setError("");

    const trimmedEmail = email.trim();
    const nextErrors: typeof fieldErrors = {};
    if (!trimmedEmail) nextErrors.email = t("auth.emailRequired");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) nextErrors.email = t("auth.emailInvalid");
    if (!password) nextErrors.password = t("auth.passwordRequired");
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(t("auth.loginErrorWrong"));
      setLoading(false);
      return;
    }

    goNext();
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.topRow}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel={t("common.back")}
            >
              <ArrowLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
            </Pressable>
            <LanguageButton />
          </View>

          {/* Brand */}
          <ThemedText style={styles.wordmark}>NUTRI</ThemedText>

          {/* Heading */}
          <ThemedText style={styles.title}>{t("auth.loginTitle")}</ThemedText>
          <ThemedText style={styles.subtitle}>{t("auth.loginSubtitle")}</ThemedText>

          <View style={styles.fields}>
            <AuthTextField
              label={t("auth.email")}
              icon={<Mail size={16} color="rgba(255,255,255,0.4)" strokeWidth={1.6} />}
              error={fieldErrors.email}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
              }}
              placeholder={t("auth.emailPlaceholder")}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
            <AuthTextField
              label={t("auth.password")}
              icon={<Lock size={16} color="rgba(255,255,255,0.4)" strokeWidth={1.6} />}
              error={fieldErrors.password}
              isPassword
              trailing={
                <Pressable
                  onPress={() => Linking.openURL(`${env.EXPO_PUBLIC_WEB_URL}/glomt-losenord`)}
                  accessibilityRole="link"
                >
                  <ThemedText style={styles.forgotLink}>{t("auth.forgot")}</ThemedText>
                </Pressable>
              }
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
              }}
              placeholder="••••••••"
              autoCapitalize="none"
              autoComplete="current-password"
            />
          </View>

          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            style={({ pressed }) => [
              styles.cta,
              pressed && !loading && { backgroundColor: colors.accentHover },
              loading && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("auth.loginCta")}
          >
            <ThemedText style={styles.ctaText}>
              {loading ? `${t("auth.loginCta")}…` : t("auth.loginCta")}
            </ThemedText>
          </Pressable>

          <View style={styles.promptRow}>
            <ThemedText style={styles.promptText}>{t("auth.loginPrompt")}</ThemedText>
            <Pressable
              onPress={() =>
                router.push(next ? { pathname: "/registrera", params: { next } } : "/registrera")
              }
              accessibilityRole="link"
            >
              <ThemedText style={styles.promptLink}>{t("auth.createAccount")}</ThemedText>
            </Pressable>
          </View>

          <View style={styles.securityRow}>
            <Shield size={11} color={colors.accent} strokeWidth={1.6} />
            <ThemedText style={styles.securityText}>{t("auth.security")}</ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: spacing[5], paddingTop: spacing[3], gap: spacing[4] },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    fontSize: 18,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: 3,
    color: colors.textPrimary,
  },
  title: {
    fontSize: 32,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -1.2,
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: -spacing[3],
    maxWidth: 320,
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(255,255,255,0.58)",
  },
  fields: { gap: spacing[4] },
  forgotLink: { fontSize: 12.5, fontFamily: fontFamily.bodySemibold, color: colors.accent },
  error: { fontSize: 13, color: "#F87171" },
  cta: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { fontSize: 15, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  promptRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing[1] },
  promptText: { fontSize: 13.5, color: "rgba(255,255,255,0.6)" },
  promptLink: { fontSize: 13.5, fontFamily: fontFamily.bodyBold, color: colors.accent },
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: spacing[1],
  },
  securityText: { fontSize: 11.5, color: "rgba(255,255,255,0.4)" },
});
