import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Reading sessionStorage / starting media streams in an effect is a
      // legitimate pattern in this app; downgrade Next 16's new strict rule.
      "react-hooks/set-state-in-effect": "warn",
      // We use data URLs (captured photos) and external Supabase URLs that
      // don't benefit from next/image; allow plain <img>.
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
