import type { Href } from "expo-router";

/**
 * The ONE destination for "finish your Nutri profile" (patch 15).
 *
 * Before this, three screens each opened the WEB app instead
 * (`Linking.openURL(WEB_URL + "/onboarding")` in Nutri Anpassar and
 * Heldag, `/profil` in Anpassar's error state), which threw the customer
 * out of the app mid-flow. Onboarding is completed in the app.
 *
 * Why the account tab: ProfileScreen is the in-app onboarding entry
 * (approved V1 adaptation — "grunddata" is edited in-app). It resumes at
 * the first missing step on its own: it shows the onboarding modal while
 * `is_onboarding_complete !== true`, keeps the "Din profil är inte klar"
 * banner with its Fortsätt action, and lists exactly which fields the
 * backend still misses. Nothing is reset — every value already saved is
 * loaded into the form.
 *
 * Keep this the single source of truth: if the app ever gains a dedicated
 * onboarding route, changing it here moves every entry point at once.
 */
export const NUTRITION_ONBOARDING_ROUTE = "/(tabs)/konto" as Href;
