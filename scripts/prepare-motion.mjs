import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const sharp = require(process.env.TYCHE_SHARP_PATH || 'sharp');
const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, 'handoff-assets/motion');
const manifest = JSON.parse(await fs.readFile(path.join(sourceRoot, 'sources.json'), 'utf8'));
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const canvas = (width, height) => sharp({ create: { width, height, channels: 4, background: transparent } });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const reports = [];

function bounds(data, w, h) {
  let left = w, top = h, right = 0, bottom = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
  }
  return { left, top, width: right - left, height: bottom - top };
}
async function sheet(spec) {
  const input = await fs.readFile(path.join(sourceRoot, spec.file));
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Generated source sheets deliberately use an unambiguous compositing matte.
  // This removes only that colour; hospital whites and pale blankets survive.
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = data.subarray(i, i + 3);
    if (r > 45 && b > 45 && r - g > 25 && b - g > 25) data.fill(0, i, i + 4);
  }
  const cuts = (count, vertical) => {
    const size = vertical ? info.height : info.width, other = vertical ? info.width : info.height;
    return [0, ...Array.from({ length: count - 1 }, (_, i) => {
      const ideal = Math.round((i + 1) * size / count), margin = Math.floor(size / count * .12);
      let best = ideal, least = Infinity;
      for (let at = ideal - margin; at <= ideal + margin; at++) {
        let pixels = 0;
        for (let p = 0; p < other; p++) if (data[((vertical ? at * info.width + p : p * info.width + at) * 4) + 3]) pixels++;
        const cost = pixels * 1000 + Math.abs(at - ideal);
        if (cost < least) { best = at; least = cost; }
      }
      return best;
    }), size];
  };
  const xs = cuts(spec.columns, false), ys = cuts(spec.rows, true), cells = [];
  for (let row = 0; row < spec.rows; row++) {
    cells[row] = [];
    for (let col = 0; col < spec.columns; col++) {
      const width = xs[col + 1] - xs[col], height = ys[row + 1] - ys[row], raw = Buffer.alloc(width * height * 4);
      for (let y = 0; y < height; y++) data.copy(raw, y * width * 4, ((ys[row] + y) * info.width + xs[col]) * 4, ((ys[row] + y) * info.width + xs[col + 1]) * 4);
      const box = bounds(raw, width, height);
      if (box.width < 8 || box.height < 8) throw new Error(`Empty sprite ${spec.file}:${row}:${col}`);
      const png = await sharp(raw, { raw: { width, height, channels: 4 } }).extract(box).png().toBuffer();
      let headLeft = width, headRight = 0;
      for (let y = box.top; y < box.top + box.height * .3; y++) for (let x = box.left; x < box.left + box.width; x++)
        if (raw[(y * width + x) * 4 + 3]) { headLeft = Math.min(headLeft, x); headRight = Math.max(headRight, x + 1); }
      cells[row][col] = { png, width: box.width, height: box.height, head: ((headLeft + headRight) / 2 - box.left) / box.width };
    }
  }
  reports.push({ file: spec.file, sha256: hash(input), size: [info.width, info.height], grid: [spec.columns, spec.rows] });
  return cells;
}
async function normalized(sprite, scale, width = 128, flip = false, foot = sprite.head) {
  const w = Math.max(1, Math.round(sprite.width * scale)), h = Math.max(1, Math.round(sprite.height * scale));
  let draw = sharp(sprite.png).resize(w, h, { kernel: 'nearest' });
  if (flip) draw = draw.flop();
  const image = await draw.png().toBuffer();
  const left = Math.round(width / 2 - w * (flip ? 1 - foot : foot)), top = 122 - h;
  if (left < 0 || left + w > width || top < 0) throw new Error(`Sprite exceeds anchor bounds: ${w}×${h} at ${left},${top}`);
  return canvas(width, 128).composite([{ input: image, left, top }]).png().toBuffer();
}
async function writeAtlas(file, columns, rows, width, layers) {
  const bytes = await canvas(columns * width, rows * 128).composite(layers).webp({ lossless: true }).toBuffer();
  await fs.writeFile(path.join(root, 'public/art', file), bytes);
  reports.push({ output: file, size: [columns * width, rows * 128], bytes: bytes.length, sha256: hash(bytes) });
}

const patientWalk = [], transitions = [], originals = [], extended = [], originalPortraits = [], extendedPortraits = [];
const patientIds = [];
for (const spec of manifest.patients) {
  const cells = await sheet(spec);
  for (const person of spec.people) {
    const row = person.row, start = person.column, count = person.frames ?? 3;
    const scale = (person.height ?? 112) / Math.max(...cells.slice(0, 4).flatMap(r => r.slice(start, start + count).map(s => s.height)));
    const cycle = count === 4 ? [0, 1, 2, 3] : [0, 1, 0, 2];
    for (let direction = 0; direction < 4; direction++) for (let step = 0; step < 4; step++) {
      const sourceDirection = person.mirrorRight && direction === 2 ? 1 : direction;
      const sprite = await normalized(cells[sourceDirection][start + cycle[step]], scale, 128, person.mirrorRight && direction === 2);
      patientWalk.push({ input: sprite, left: (direction * 4 + step) * 128, top: row * 128 });
    }
    const poses = count === 4 ? [[4, start], [4, start + 1], [4, start + 2], [4, start + 3]] : [[4, start], [4, start + 1], [4, start + 2], [5, start]];
    for (let pose = 0; pose < 4; pose++) {
      const [r, c] = poses[pose], source = cells[r][c];
      const sprite = await normalized(source, pose < 2 ? 112 / source.height : scale);
      transitions.push({ input: sprite, left: pose * 128, top: row * 128 });
      if (pose === 0) (row < 20 ? originals : extended).push({ index: row < 20 ? row : row - 20, sprite });
    }
    const standing = await normalized(cells[0][start], scale);
    const portrait = await sharp(standing).extract({ left: 20, top: 2, width: 88, height: 88 }).resize(256, 256, { kernel: 'nearest' }).png().toBuffer();
    (row < 20 ? originalPortraits : extendedPortraits).push({ index: row < 20 ? row : row - 20, sprite: portrait });
    patientIds.push(row);
  }
}
await writeAtlas('patient-motion-atlas.webp', 16, 28, 128, patientWalk);
await writeAtlas('patient-transitions-atlas.webp', 4, 28, 128, transitions);
for (const [file, replacements, columns, cell, enlarge] of [
  ['bed-patients.webp', originals, 5, 128, false], ['extended-bed-patients.webp', extended, 4, 128, false],
  ['bedside-patients.webp', originals, 5, 256, true], ['extended-bedside.webp', extended, 4, 256, true],
  ['patient-portraits.webp', originalPortraits, 5, 256, false], ['extended-portraits.webp', extendedPortraits, 4, 256, false],
]) {
  if (!replacements.length) {
    await fs.copyFile(path.join(sourceRoot, 'base', file), path.join(root, 'public/art', file));
    continue;
  }
  const base = sharp(path.join(sourceRoot, 'base', file));
  const meta = await base.metadata(), layers = [];
  for (let index = 0; index < meta.width / cell * meta.height / cell; index++) {
    const left = index % columns * cell, top = Math.floor(index / columns) * cell;
    const sprite = replacements.find(r => r.index === index)?.sprite;
    const input = sprite ? enlarge ? await sharp(sprite).resize(cell, cell, { kernel: 'nearest' }).png().toBuffer() : sprite
      : await base.clone().extract({ left, top, width: cell, height: cell }).png().toBuffer();
    layers.push({ input, left, top });
  }
  await canvas(meta.width, meta.height).composite(layers).webp({ lossless: true }).toFile(path.join(root, 'public/art', file));
}

const staffWalk = [], staffActions = [];
for (const spec of manifest.staff ?? []) {
  const cells = await sheet(spec), scale = 112 / Math.max(...cells.slice(0, 4).flat().map(s => s.height));
  for (let dir = 0; dir < 4; dir++) for (let step = 0; step < 4; step++) staffWalk.push({ input: await normalized(cells[dir][step], scale), left: (dir * 4 + step) * 128, top: spec.row * 128 });
  for (let group = 0; group < 4; group++) for (let step = 0; step < 2; step++) staffActions.push({ input: await normalized(cells[group < 2 ? 4 : 5][group % 2 * 2 + step], 112 / cells[group < 2 ? 4 : 5][group % 2 * 2 + step].height, 192), left: (group * 2 + step) * 192, top: spec.row * 128 });
}
if (staffWalk.length) {
  await writeAtlas('staff-motion-atlas.webp', 16, 5, 128, staffWalk);
  await writeAtlas('staff-actions-atlas.webp', 8, 5, 192, staffActions);
}
const haul = [], care = [];
for (const spec of manifest.haul ?? []) {
  const cells = await sheet(spec), scale = 112 / Math.max(...cells.slice(0, 4).flat().map(s => s.height));
  for (let dir = 0; dir < 4; dir++) for (let step = 0; step < 4; step++) haul.push({ input: await normalized(cells[dir][step], scale, 256, false, spec.feet?.[dir]), left: (dir * 4 + step) * 256, top: spec.row * 128 });
  for (let group = 0; group < 4; group++) for (let step = 0; step < 2; step++) {
    const column = group % 2 * 2 + step;
    const sprite = cells[group < 2 ? 4 : 5][group >= 2 ? spec.actionColumns?.[column] ?? column : column];
    care.push({ input: await normalized(sprite, 112 / sprite.height, 256), left: (group * 2 + step) * 256, top: spec.row * 128 });
  }
}
if (haul.length) {
  await writeAtlas('ward-haul-atlas.webp', 16, 2, 256, haul);
  await writeAtlas('ward-care-atlas.webp', 8, 2, 256, care);
}
const companions = [];
for (const spec of manifest.companions ?? []) {
  const cells = await sheet(spec), column = spec.column ?? 0, scale = (spec.height ?? 112) / Math.max(...cells.slice(0, 4).flatMap(r => r.slice(column, column + 2)).map(s => s.height));
  for (let dir = 0; dir < 4; dir++) for (let step = 0; step < 2; step++) companions.push({ input: await normalized(cells[dir][column + step], scale), left: (dir * 2 + step) * 128, top: spec.row * 128 });
}
if (companions.length) await writeAtlas('companion-walk-atlas.webp', 8, 3, 128, companions);
await fs.mkdir(path.join(root, 'output/motion'), { recursive: true });
await fs.writeFile(path.join(root, 'output/motion/atlas-report.json'), JSON.stringify({ patientIds, reports }, null, 2) + '\n');
console.log(JSON.stringify({ patientIds, staff: manifest.staff?.length ?? 0, reports: reports.length }));
