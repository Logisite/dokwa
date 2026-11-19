import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * One flat config for the whole workspace. Deliberately small: the point is a
 * command that fails on a real mistake, not a style regime nobody agreed to.
 * Formatting is Prettier's job; this checks correctness.
 */
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "board/**", "**/*.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // an interface with one required field is a shape, not a mystery
      "@typescript-eslint/no-empty-object-type": "off",
      // a stub often has to accept a parameter it does not use; the leading
      // underscore says so on purpose rather than by accident
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // node scripts, not browser code
    files: ["tools/**/*.mjs", "*.config.js"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
);
