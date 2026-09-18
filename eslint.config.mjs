import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Copies de travail des chantiers menés en parallèle : ce n'est pas
    // le code du projet, et elles embarquent leurs propres dépendances.
    ".claude/**",
  ]),
  {
    rules: {
      // Le soulignement est la convention du projet pour « ce paramètre
      // existe parce que la signature l'impose, mais on ne s'en sert pas » —
      // typiquement le `_prev` d'une action de formulaire. La règle doit la
      // reconnaître, sinon elle réclame de supprimer un argument obligatoire.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
