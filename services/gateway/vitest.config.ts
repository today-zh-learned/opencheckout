import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.small.test.ts", "src/**/*.medium.test.ts", "src/**/*.large.test.ts"],
    reporters: ["verbose"],
  },
});
