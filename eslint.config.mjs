// ESLint flat config — intentionally strict: this repo treats lint as a quality gate
// (no `any`, no unsafe operations, no inline functions in JSX). CI fails on warnings.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import storybook from "eslint-plugin-storybook";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "storybook-static/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "public/mockServiceWorker.js",
  ]),
  ...storybook.configs["flat/recommended"],
  {
    // Type-aware rules only where application code lives; config files
    // (.storybook, next.config) stay on the default ruleset.
    files: ["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      react,
    },
    rules: {
      // The domain of this app (balances owned by an external HCM) punishes loose
      // typing hard — a mistyped payload becomes a silent wrong balance on screen.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      // Handlers are extracted (useCallback or module scope); inline closures in JSX
      // defeat memoized children and scatter logic through the markup.
      "react/jsx-no-bind": [
        "error",
        { allowArrowFunctions: false, allowFunctions: false, allowBind: false },
      ],
      "prefer-const": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // Test files stub collaborators aggressively; relax only what testing requires.
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.stories.tsx",
      "e2e/**/*.ts",
      "vitest.setup.ts",
    ],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      // Storybook's instrumented test utils degrade to any at the boundary.
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "react/jsx-no-bind": "off",
    },
  },
]);

export default eslintConfig;
