import { readFile, stat, writeFile } from 'node:fs/promises';

const root = new URL('../endings/', import.meta.url);
const groups = ['manifest-X01-X14.json', 'manifest-X15-X28.json', 'manifest-X29-X41.json'];
const entries = (await Promise.all(groups.map(async (name) =>
  JSON.parse(await readFile(new URL(name, root), 'utf8')),
))).flat().sort((a, b) => a.id.localeCompare(b.id));
const expected = Array.from({ length: 41 }, (_, i) => `X${String(i + 1).padStart(2, '0')}`);
if (entries.map((entry) => entry.id).join() !== expected.join()) {
  throw new Error('Expected exactly one image for every ending X01–X41');
}
for (const entry of entries) {
  for (const key of ['title', 'brief', 'prompt', 'model', 'license']) {
    if (!entry[key]) throw new Error(`${entry.id}: missing ${key}`);
  }
  for (const [key, extension] of [['image', 'webp'], ['source', 'png']]) {
    if (entry[key] !== `${entry.id}.${extension}`) throw new Error(`${entry.id}: unexpected ${key}`);
    if (!(await stat(new URL(entry[key], root))).size) throw new Error(`${entry.id}: empty ${key}`);
  }
  if (!(entry.dimensions?.width > 0 && entry.dimensions?.height > 0)) {
    throw new Error(`${entry.id}: missing dimensions`);
  }
}
await writeFile(new URL('manifest.json', root), `${JSON.stringify(entries, null, 2)}\n`);
const rows = entries.map((entry) =>
  `| ${entry.id} | ${entry.title} | ${entry.brief} | [WebP](${entry.image}) · [PNG](${entry.source}) |`,
);
await writeFile(new URL('README.md', root), [
  '# Tyche 结局图片',
  '',
  'X01–X41 共 41 张独立横幅图。WebP 用于游戏，PNG 为原图。图内不含标题和正文；主结局与附件分别按 ID 关联。',
  '',
  '由内置 image_gen 生成，按项目 MIT 许可开放。完整提示词、实际尺寸和场景说明见 [manifest.json](manifest.json)。',
  '',
  '| ID | 标题 | 场景 | 文件 |',
  '| --- | --- | --- | --- |',
  ...rows,
  '',
].join('\n'));
console.log(`Indexed ${entries.length} ending illustrations; PNG and WebP files present.`);
