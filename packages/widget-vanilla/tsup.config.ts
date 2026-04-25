import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: false,
  minify: true,
  treeshake: true,
  external: ["preact"],
  noExternal: ["es-hangul"],
});
