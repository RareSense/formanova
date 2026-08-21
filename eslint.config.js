import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Legacy DOM globals that TypeScript resolves silently.
      //
      // `source` is declared on Window, so a stray reference to it type checks,
      // builds, and ships, then throws ReferenceError only when that line
      // actually runs. That is exactly how a broken CAD workspace reached main:
      // tsc, the production build and 700+ tests all passed.
      //
      // Every name below is a real global that reads like an ordinary local
      // variable. Restricting them turns a runtime crash into a lint error.
      // Adding this flagged nothing in the existing tree.
      "no-restricted-globals": ["error",
        { name: "source", message: "`source` is a Window global. You almost certainly meant a local variable - declare it, or rename yours." },
        { name: "event", message: "`event` is a deprecated Window global. Use the handler's event parameter explicitly." },
        { name: "name", message: "`name` is a Window global. Use a local or a more specific name." },
        { name: "status", message: "`status` is a Window global. Use a local or a more specific name." },
        { name: "length", message: "`length` is a Window global. Use a local or a more specific name." },
        { name: "origin", message: "`origin` is a Window global. Use window.location.origin if that is what you meant." },
        { name: "top", message: "`top` is a Window global. Use a local or window.top explicitly." },
        { name: "parent", message: "`parent` is a Window global. Use a local or window.parent explicitly." },
        { name: "self", message: "`self` is a Window global. Use a local or window.self explicitly." },
        { name: "closed", message: "`closed` is a Window global. Use a local or a more specific name." },
        { name: "history", message: "`history` is a Window global. Use a local or window.history explicitly." },
      ],
    },
  },
  // PostHog: all event tracking must go through src/lib/posthog-events.ts.
  // Direct posthog-js imports in pages/components bypass the __loaded guard,
  // skip TypeScript interfaces, and are invisible to the test suite.
  // The only legitimate direct import is in posthog-events.ts itself and main.tsx.
  {
    files: ["src/pages/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}", "src/contexts/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "posthog-js",
          message: "Import from '@/lib/posthog-events' instead. Direct posthog-js usage bypasses the __loaded guard and test coverage.",
        }],
      }],
    },
  },
);
