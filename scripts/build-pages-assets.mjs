// scripts/build-pages-assets.mjs
import { mkdirSync, copyFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const src = "packages/widget-vanilla/dist/index.js";
const destDir = "docs/pages/assets";
const dest = `${destDir}/opencheckout-widget.js`;

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);

const size = statSync(dest).size;
const gzipped = gzipSync(readFileSync(dest));
console.log(
  `Copied ${src} → ${dest} (${size} bytes raw, ${gzipped.length} bytes gzipped)`
);
