/**
 * Staging variant of the app config.
 *
 * WHY THIS FILE. app.json stays the single description of the app; this only
 * overlays the handful of identifiers that MUST differ when the build points
 * at the staging backend and the staging Supabase project:
 *
 *   - a different bundle id / package, so staging installs BESIDE production
 *     instead of replacing it on a tester's phone,
 *   - a different name, so the two are distinguishable on the home screen,
 *   - a different deep-link scheme, so an auth redirect can never open the
 *     wrong app,
 *   - a different Android notification channel, so a staging push cannot look
 *     like a real order update.
 *
 * Activated by APP_VARIANT=staging (set by the `staging` EAS build profile in
 * eas.json). With the variable unset — every existing local run, `preview` and
 * `production` build — this returns app.json completely unchanged.
 *
 * NOTE: the EAS projectId is deliberately NOT changed. One EAS project, one
 * credential set, separated by build profile and channel.
 */

const STAGING_SUFFIX = ".staging";

module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== "staging") return config;

  return {
    ...config,
    name: "Nutri Staging",
    scheme: "nutristaging",
    ios: {
      ...config.ios,
      bundleIdentifier: `${config.ios.bundleIdentifier}${STAGING_SUFFIX}`,
    },
    android: {
      ...config.android,
      package: `${config.android.package}${STAGING_SUFFIX}`,
    },
    plugins: config.plugins.map((plugin) =>
      Array.isArray(plugin) && plugin[0] === "expo-notifications"
        ? [plugin[0], { ...plugin[1], defaultChannel: "staging" }]
        : plugin,
    ),
  };
};
