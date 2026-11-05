import js from "@eslint/js";
import globals from "globals";
import nodePlugin from "eslint-plugin-n";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

// Flat config for ESLint 9, following the same pattern as the client config.
// See also: https://github.com/eslint-community/eslint-plugin-n

export default defineConfig([
  globalIgnores(["dist", "public/api-explorer"]),
  {
    files: ["server/**/*.js"],
    extends: [
      js.configs.recommended,
      nodePlugin.configs["flat/recommended"], // Catches things like correct imports, only allow supported syntax (by looking at `engine` in package.json)
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node, // Tells ESlint that stuff like __dirname are valid globals.
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": "error", // run Prettier as an ESLint rule
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["server/**/*.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      nodePlugin.configs["flat/recommended"],
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": "error",
      "no-unused-vars": "off", // Replaced by the TypeScript aware rule below
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  prettierConfig, // disables ESLint rules that would conflict with Prettier
]);
