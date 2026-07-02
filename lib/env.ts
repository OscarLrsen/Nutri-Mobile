import { z } from "zod";

/**
 * Environment variables, Zod-validated at app startup so a missing/malformed
 * value fails loudly and immediately instead of surfacing as a confusing
 * network error deep in a screen.
 *
 * Expo only exposes vars prefixed EXPO_PUBLIC_ to app code (bundled at build
 * time, same mechanism as Next.js's NEXT_PUBLIC_ prefix on the web app —
 * see NUTRI_MOBILE_TECHNICAL_SPECIFICATION_V1.md §7/§22.4).
 *
 * IMPORTANT — Expo Go / physical device gotcha (documented deliberately,
 * not a guess): "localhost" in EXPO_PUBLIC_API_URL refers to the *phone*,
 * not the dev machine, when testing via Expo Go on a physical device. Use
 * your machine's LAN IP (e.g. http://192.168.x.x:5069) in that case — the
 * backend's own CORS AllowedOrigins config already anticipates this pattern
 * (see Program.cs's AllowedOrigins default, which includes a LAN IP entry).
 * iOS Simulator can reach `localhost` directly; Android Emulator needs
 * `http://10.0.2.2:5069` instead of `localhost`.
 *
 * Unlike the web app's documented localhost:5069 fallback footgun (spec
 * §14.1/§22.4), this module intentionally has NO fallback — a missing
 * EXPO_PUBLIC_API_URL throws at startup rather than silently defaulting.
 */
const envSchema = z.object({
  EXPO_PUBLIC_API_URL: z.url({ error: "EXPO_PUBLIC_API_URL must be a valid absolute URL" }),
  EXPO_PUBLIC_SUPABASE_URL: z.url({ error: "EXPO_PUBLIC_SUPABASE_URL must be a valid absolute URL" }),
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required"),
});

function loadEnv() {
  const parsed = envSchema.safeParse({
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(
      `Invalid or missing environment configuration. Copy .env.example to .env.local and fill in real values:\n${issues}`
    );
  }

  return parsed.data;
}

export const env = loadEnv();
