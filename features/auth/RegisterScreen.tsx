import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ArrowLeft, Check, Info, Lock, Mail, User } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { ThemedText } from "@/components/ui/ThemedText";
import { AuthTextField } from "@/components/auth/AuthTextField";
import { supabase } from "@/services/auth/supabase";
import { useAuth } from "@/services/auth/AuthProvider";
import { env } from "@/lib/env";
import { authCopy as copy } from "@/constants/copy";
import { colors, fontFamily, spacing } from "@/theme";

/**
 * Registration — port of the web's StepCredentials.tsx, step-for-step:
 *
 * Step 1: first name (required) + last name (optional) + email, local
 * validation only. Step 2: password (min 6) + strength meter (same 4-part
 * scoring) + optional marketing consent + supabase.auth.signUp with the
 * exact same user_metadata payload (first/last/full name + marketing
 * consent fields). Duplicate-email handling is identical: an explicit
 * "already registered" error OR the documented identities===[] silent-
 * success signal both show the duplicate message with a login link. If
 * signUp returns a session (email confirm disabled) the user is logged in
 * immediately; otherwise the "Kolla din inkorg!" screen polls getSession()
 * every 4s and offers the "Jag har verifierat" button (web parity).
 *
 * Adaptations: emailRedirectTo points at the WEB app's /auth/callback
 * (mobile has no deep links yet — the verification link opens the browser,
 * where the web callback sets the session server-side; the phone's Supabase
 * client picks the confirmed account up via the polling above only after
 * login... in practice the confirm link logs the user in ON THE WEB, and in
 * the app they proceed via "Jag har verifierat" → session poll, exactly as
 * on the web when the link is opened in another tab). The web's
 * sessionStorage "nutri_welcome" flag is web-only and not ported.
 */
export function RegisterScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { user, loading: authLoading } = useAuth();

  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptsMarketing, setAcceptsMarketing] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string;
    email?: string;
    password?: string;
  }>({});
  const [loading, setLoading] = useState(false);
  const [isDuplicateEmail, setIsDuplicateEmail] = useState(false);
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  const goNext = () => {
    if (next && next.startsWith("/")) {
      router.replace(next as Href);
    } else {
      // Web parity: a fresh verified signup lands on the menu.
      router.replace("/(tabs)/meny");
    }
  };

  // Auth guard (web parity) — skip while our own signup flow is running,
  // since handleStep2/goNext owns navigation in that case.
  useEffect(() => {
    if (authLoading || !user || loading || sent) return;
    goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  // Same 4-part strength scoring as the web.
  const strength = (() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();
  const strengthLabel = copy.strength[strength];
  const strengthColor = ["rgba(255,255,255,0.18)", "#FF8A3A", "#FFB05A", "#9CD66F", "#9CD66F"][
    strength
  ];

  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();

  // Step 1: local validation only — no Supabase call (web parity).
  const handleStep1 = () => {
    const trimmedEmail = email.trim();
    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    const nextErrors: typeof fieldErrors = {};
    if (!trimmedFirst) nextErrors.firstName = copy.firstNameRequired;
    if (!trimmedEmail) nextErrors.email = copy.emailRequired;
    else if (!emailLooksValid) nextErrors.email = copy.emailInvalid;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setFormStep(2);
  };

  // Step 2: actual Supabase signup (web parity, including metadata payload).
  const handleStep2 = async () => {
    setError("");
    setIsDuplicateEmail(false);

    const nextErrors: typeof fieldErrors = {};
    if (!password) nextErrors.password = copy.registerPasswordRequired;
    else if (password.length < 6) nextErrors.password = copy.passwordTooShort;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);

    const emailRedirectTo = `${env.EXPO_PUBLIC_WEB_URL}/auth/callback?next=/profil`;
    const fullName = trimmedLast ? `${trimmedFirst} ${trimmedLast}` : trimmedFirst;
    const marketingMeta = acceptsMarketing
      ? {
          accepts_marketing_emails: true,
          marketing_consent_source: "signup" as const,
          marketing_consent_at: new Date().toISOString(),
        }
      : { accepts_marketing_emails: false };

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          first_name: trimmedFirst,
          last_name: trimmedLast || null,
          full_name: fullName,
          ...marketingMeta,
        },
      },
    });

    if (signUpError) {
      const errMsg = signUpError.message.toLowerCase();
      if (errMsg.includes("already registered") || errMsg.includes("already exists")) {
        setIsDuplicateEmail(true);
      } else if (
        errMsg.includes("rate limit") ||
        errMsg.includes("email rate") ||
        errMsg.includes("too many") ||
        signUpError.status === 429
      ) {
        setError(copy.errorRateLimit);
      } else if (errMsg.includes("invalid email")) {
        setError(copy.errorInvalidEmail);
      } else {
        setError(signUpError.message || copy.errorGeneric);
      }
      setLoading(false);
      return;
    }

    // Session returned = "confirm email" disabled — already logged in.
    if (signUpData?.session) {
      goNext();
      return;
    }

    // Documented Supabase signal: silent success with identities === [] means
    // the address already belongs to an account (web parity).
    if ((signUpData?.user?.identities?.length ?? 1) === 0) {
      setIsDuplicateEmail(true);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  // Poll for a session while waiting for email verification (web parity:
  // 4s interval, cleaned up on unmount/navigation).
  useEffect(() => {
    if (!sent) return;
    let active = true;
    const interval = setInterval(async () => {
      const { data } = await supabase.auth.getSession();
      if (active && data.session) {
        clearInterval(interval);
        goNext();
      }
    }, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent]);

  const handleCheckVerification = async () => {
    setChecking(true);
    setSessionError(false);
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      goNext();
    } else {
      setSessionError(true);
      setChecking(false);
    }
  };

  /* ── "Check your inbox" state ── */
  if (sent) {
    return (
      <Screen edges={["top", "bottom"]}>
        <View style={styles.inboxWrap}>
          <View style={styles.inboxIcon}>
            <Mail size={28} color={colors.accent} strokeWidth={1.6} />
          </View>
          <ThemedText style={styles.inboxHeading}>{copy.inboxHeading}</ThemedText>
          <ThemedText style={styles.inboxText}>
            {copy.inboxPrefix}
            <ThemedText style={styles.inboxEmail}>{email}</ThemedText>
            {copy.inboxSuffix}
          </ThemedText>
          <Pressable
            onPress={handleCheckVerification}
            disabled={checking}
            style={({ pressed }) => [
              styles.cta,
              styles.inboxCta,
              pressed && !checking && { backgroundColor: colors.accentHover },
              checking && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.ctaText}>
              {checking ? copy.checking : copy.verified}
            </ThemedText>
          </Pressable>
          {sessionError ? (
            <ThemedText style={styles.inboxHint}>{copy.noSession}</ThemedText>
          ) : null}
          <View style={styles.promptRow}>
            <ThemedText style={styles.promptText}>{copy.noMail}</ThemedText>
            <Pressable onPress={() => setSent(false)} accessibilityRole="button">
              <ThemedText style={styles.promptLink}>{copy.retry}</ThemedText>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  const loginRow = (
    <View style={styles.promptRow}>
      <ThemedText style={styles.promptText}>{copy.haveAccount}</ThemedText>
      <Pressable
        onPress={() =>
          router.replace(next ? { pathname: "/logga-in", params: { next } } : "/logga-in")
        }
        accessibilityRole="link"
      >
        <ThemedText style={styles.promptLink}>{copy.navLogin}</ThemedText>
      </Pressable>
    </View>
  );

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={() =>
              formStep === 2
                ? setFormStep(1)
                : router.canGoBack()
                  ? router.back()
                  : router.replace("/(tabs)")
            }
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Tillbaka"
          >
            <ArrowLeft size={16} color={colors.textPrimary} strokeWidth={2.25} />
          </Pressable>

          <ThemedText style={styles.wordmark}>NUTRI</ThemedText>
          <ThemedText style={styles.title}>{copy.registerTitle}</ThemedText>

          {formStep === 1 ? (
            /* ── Step 1: identity (name + email) ── */
            <>
              <ThemedText style={styles.subtitle}>{copy.registerSubtitle}</ThemedText>

              <View style={styles.fields}>
                <AuthTextField
                  label={copy.firstName}
                  icon={<User size={16} color="rgba(255,255,255,0.4)" strokeWidth={1.6} />}
                  error={fieldErrors.firstName}
                  value={firstName}
                  onChangeText={(v) => {
                    setFirstName(v);
                    if (fieldErrors.firstName)
                      setFieldErrors((p) => ({ ...p, firstName: undefined }));
                  }}
                  placeholder={copy.firstNamePlaceholder}
                  autoComplete="given-name"
                  maxLength={60}
                />
                <AuthTextField
                  label={copy.lastName}
                  optional
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder={copy.lastNamePlaceholder}
                  autoComplete="family-name"
                  maxLength={60}
                />
                <View style={styles.helperRow}>
                  <Info size={11} color="rgba(255,255,255,0.42)" strokeWidth={1.6} />
                  <ThemedText style={styles.helperText}>{copy.nameHelper}</ThemedText>
                </View>
                <AuthTextField
                  label={copy.email}
                  icon={<Mail size={16} color="rgba(255,255,255,0.4)" strokeWidth={1.6} />}
                  error={fieldErrors.email}
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                  }}
                  placeholder={copy.emailPlaceholder}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                />
              </View>

              <Pressable
                onPress={handleStep1}
                style={({ pressed }) => [
                  styles.cta,
                  pressed && { backgroundColor: colors.accentHover },
                ]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.ctaText}>{copy.continue}</ThemedText>
              </Pressable>

              {loginRow}
            </>
          ) : (
            /* ── Step 2: password + submit ── */
            <>
              {/* Email summary row */}
              <View style={styles.emailSummary}>
                <ThemedText style={styles.emailSummaryText} numberOfLines={1}>
                  {email.trim()}
                </ThemedText>
                <Pressable
                  onPress={() => {
                    setFormStep(1);
                    setError("");
                    setIsDuplicateEmail(false);
                    setFieldErrors({});
                  }}
                  accessibilityRole="button"
                >
                  <ThemedText style={styles.promptLink}>{copy.changeEmail}</ThemedText>
                </Pressable>
              </View>

              <View style={styles.fields}>
                <AuthTextField
                  label={copy.password}
                  icon={<Lock size={16} color="rgba(255,255,255,0.4)" strokeWidth={1.6} />}
                  error={fieldErrors.password}
                  isPassword
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (fieldErrors.password)
                      setFieldErrors((p) => ({ ...p, password: undefined }));
                  }}
                  placeholder={copy.passwordTooShort}
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
                {/* Strength meter */}
                <View style={styles.strengthRow}>
                  <View style={styles.strengthBars}>
                    {[0, 1, 2, 3].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.strengthBar,
                          { backgroundColor: i < strength ? strengthColor : "rgba(255,255,255,0.06)" },
                        ]}
                      />
                    ))}
                  </View>
                  <ThemedText
                    style={[
                      styles.strengthLabel,
                      {
                        color:
                          strength >= 3
                            ? "#9CD66F"
                            : strength >= 1
                              ? "#FFB05A"
                              : "rgba(255,255,255,0.4)",
                      },
                    ]}
                  >
                    {strengthLabel}
                  </ThemedText>
                </View>
              </View>

              {/* Marketing consent — never pre-checked, never required */}
              <Pressable
                onPress={() => setAcceptsMarketing((v) => !v)}
                style={styles.consentRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acceptsMarketing }}
              >
                <View style={[styles.checkbox, acceptsMarketing && styles.checkboxChecked]}>
                  {acceptsMarketing ? (
                    <Check size={12} color={colors.textPrimary} strokeWidth={2.5} />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.consentLabel}>{copy.marketingLabel}</ThemedText>
                  <ThemedText style={styles.consentHint}>{copy.marketingHint}</ThemedText>
                </View>
              </Pressable>

              {isDuplicateEmail ? (
                <ThemedText style={styles.error}>
                  {copy.duplicatePrefix}
                  <ThemedText
                    style={[styles.error, styles.errorLink]}
                    onPress={() =>
                      router.replace(next ? { pathname: "/logga-in", params: { next } } : "/logga-in")
                    }
                  >
                    {copy.duplicateLogin}
                  </ThemedText>
                  .
                </ThemedText>
              ) : error ? (
                <ThemedText style={styles.error}>{error}</ThemedText>
              ) : null}

              <Pressable
                onPress={handleStep2}
                disabled={loading}
                style={({ pressed }) => [
                  styles.cta,
                  pressed && !loading && { backgroundColor: colors.accentHover },
                  loading && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.ctaText}>
                  {loading ? `${copy.registerTitle}…` : copy.registerTitle}
                </ThemedText>
              </Pressable>

              <ThemedText style={styles.terms}>
                {copy.termsPrefix}
                {copy.termsPrivacy}.
              </ThemedText>

              {loginRow}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: spacing[5], paddingTop: spacing[3], gap: spacing[4] },
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
    fontSize: 26,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.9,
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: -spacing[3],
    maxWidth: 320,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255,255,255,0.58)",
  },
  fields: { gap: spacing[3] },
  helperRow: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 2 },
  helperText: { flex: 1, fontSize: 11.5, lineHeight: 15, color: "rgba(255,255,255,0.42)" },
  emailSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  emailSummaryText: { flex: 1, fontSize: 13, color: "rgba(255,255,255,0.72)" },
  strengthRow: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginTop: -6 },
  strengthBars: { flex: 1, flexDirection: "row", gap: 3 },
  strengthBar: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { fontSize: 10.5, fontFamily: fontFamily.bodySemibold },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[2] },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "#16161A",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  consentLabel: {
    fontSize: 12.5,
    fontFamily: fontFamily.bodyMedium,
    lineHeight: 17,
    color: "rgba(255,255,255,0.72)",
  },
  consentHint: { marginTop: 2, fontSize: 11, lineHeight: 14, color: "rgba(255,255,255,0.4)" },
  error: { fontSize: 13, lineHeight: 18, color: "#F87171" },
  errorLink: { textDecorationLine: "underline", fontFamily: fontFamily.bodySemibold },
  cta: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { fontSize: 15, fontFamily: fontFamily.bodyBold, color: colors.textPrimary },
  terms: {
    textAlign: "center",
    fontSize: 11.5,
    lineHeight: 17,
    color: "rgba(255,255,255,0.45)",
    paddingHorizontal: spacing[2],
  },
  promptRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing[1] },
  promptText: { fontSize: 13, color: "rgba(255,255,255,0.6)" },
  promptLink: { fontSize: 13, fontFamily: fontFamily.bodyBold, color: colors.accent },
  /* Inbox state */
  inboxWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
    gap: spacing[4],
  },
  inboxIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(232,101,10,0.12)",
    borderWidth: 1,
    borderColor: "rgba(232,101,10,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  inboxHeading: {
    fontSize: 22,
    fontFamily: fontFamily.bodyBold,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  inboxText: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 21,
    color: "rgba(255,255,255,0.62)",
  },
  inboxEmail: { fontSize: 14, fontFamily: fontFamily.bodySemibold, color: colors.textPrimary },
  inboxCta: { alignSelf: "stretch" },
  inboxHint: {
    textAlign: "center",
    fontSize: 12.5,
    lineHeight: 18,
    color: "rgba(255,255,255,0.5)",
    maxWidth: 300,
  },
});
