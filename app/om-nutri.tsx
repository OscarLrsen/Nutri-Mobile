import { useRouter } from "expo-router";

import { IntroCarousel } from "@/features/onboarding/IntroCarousel";

/**
 * Replay surface for the first-run intro, opened from Profil ("Så fungerar
 * Nutri"). Replay NEVER touches the first-run flag or auth state — done/
 * skip simply navigates back to where the user came from.
 */
export default function OmNutriRoute() {
  const router = useRouter();
  return (
    <IntroCarousel
      mode="replay"
      onFinish={() => (router.canGoBack() ? router.back() : router.navigate("/(tabs)"))}
    />
  );
}
