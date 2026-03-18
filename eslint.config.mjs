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
  ]),
  // Ban direct useEffect imports outside shared hooks.
  // Use useMountEffect, useHasMounted, or useDebouncedValue from @/shared/hooks instead.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/shared/hooks/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: ["useEffect"],
              message:
                "Prefer useMountEffect, useHasMounted, useDebouncedValue, or useRequireAuth from @/shared/hooks. Direct useEffect is not a bug — but most cases are better served by these hooks. If this effect truly needs dependencies, add an eslint-disable comment explaining why.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
