import { fixupPluginRules } from "@eslint/compat";
import js from "@eslint/js";
import security from "eslint-plugin-security";
export default [
  {
    ignores: [
      "node_modules/**",
      ".agents/**",
      ".claude/**",
      ".taste-skill/**",
      "evidence/**",
      "agent/**",
    ],
  },
  js.configs.recommended,
  {
    files: [
      "src/**/*.js",
      "fixture/**/*.js",
      "scripts/**/*.js",
      "tests/**/*.js",
      "public/**/*.js",
      "eslint.config.js",
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        structuredClone: "readonly",
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        fetch: "readonly",
        performance: "readonly",
        document: "readonly",
        window: "readonly",
        getComputedStyle: "readonly",
        FormData: "readonly",
        innerWidth: "readonly",
        location: "readonly",
      },
    },
    plugins: { security: fixupPluginRules(security) },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern:
            "^_|^next$|^req$|^res$|^context$|^denied$|^o$|^browser$",
        },
      ],
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-child-process": "warn",
      "security/detect-non-literal-fs-filename": "warn",
      "security/detect-unsafe-regex": "warn",
    },
  },
];
