import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.small.test.ts",
      "packages/*/src/**/*.medium.test.ts",
      "services/*/src/**/*.small.test.ts",
      "services/*/src/**/*.medium.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
      },
      exclude: ["**/dist/**", "**/node_modules/**", "**/*.d.ts"],
    },
    reporters: ["verbose"],
    pool: "forks",
  },
});
