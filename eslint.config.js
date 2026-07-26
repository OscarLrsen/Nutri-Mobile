const expoConfig = require("eslint-config-expo/flat");
const { defineConfig } = require("eslint/config");

module.exports = defineConfig([
  expoConfig,
  {
    // scripts/** are Node CI tools (not app source) and use the Node runtime
    // env; linting them under the app's RN/browser config would misfire.
    ignores: ["dist/**", ".expo/**", "node_modules/**", "scripts/**"],
  },
]);
