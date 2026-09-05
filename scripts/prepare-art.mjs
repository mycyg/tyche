// Mechanical PNG-to-WebP conversion only; character framing stays in CSS.
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const sharp = require(process.env.TYCHE_SHARP_PATH || "sharp");
const [background, sheetA, sheetB] = process.argv.slice(2);
if (!background || !sheetA || !sheetB)
  throw new Error("Provide the three original PNG paths.");
await mkdir("public/art", { recursive: true });
for (const [source, name] of [
  [background, "hospital"],
  [sheetA, "characters-a"],
  [sheetB, "characters-b"],
]) {
  await sharp(source)
    .webp({ quality: 88, effort: 6 })
    .toFile(`public/art/${name}.webp`);
}
