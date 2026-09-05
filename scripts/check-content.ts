import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CASES, DEBUFFS, TALENTS } from '../src/game/catalog';
import { STORIES } from '../src/game/stories';
const ids = new Set<string>(); let choices = 0;
function unique(id: string) { assert(!ids.has(id), `Duplicate ID: ${id}`); ids.add(id); }
for (const c of CASES) {
  unique(c.id); assert.equal(c.steps.length, 4); assert(c.budget > 0 && c.baseCost >= 0);
  for (const [i, scene] of c.steps.entries()) {
    unique(scene.id); assert.equal(scene.options.length, 3);
    for (const o of scene.options) {
      unique(o.id); choices++; assert([...o.label].length <= 24, `Long label ${o.id}`); assert(o.ap >= 0 && o.cost >= 0 && o.minutes >= 0);
      assert.equal(o.next, c.steps[i + 1]?.id ?? 'end', `Invalid next ${o.id}`);
      if (c.id === 'C020') assert(!o.effects.damage, 'Post-death handling must not create clinical damage');
      for (const h of o.effects.hazards ?? []) assert(h.norm && h.reason && h.weight > 0);
    }
  }
}
for (const s of STORIES) {
  unique(s.id); assert(s.day >= 1 && s.day <= 14); assert(s.options.length >= 2);
  if (s.after) assert(STORIES.some(p => p.id === s.after), `Unknown predecessor ${s.after}`);
  for (const o of s.options) { unique(o.id); choices++; assert([...o.label].length <= 24, `Long label ${o.id}`); assert(o.ap >= 0); for (const h of o.effects.hazards ?? []) assert(h.norm && h.reason); }
  const chain = new Set<string>(); let cursor = s;
  while (cursor.after) { assert(!chain.has(cursor.id), `Cycle: ${s.id}`); chain.add(cursor.id); cursor = STORIES.find(p => p.id === cursor.after)!; }
}
for (const x of [...TALENTS, ...DEBUFFS]) unique(x.id);
const uiFiles=['src/ui','src/world'].flatMap(dir=>readdirSync(dir).filter(name=>/\.(tsx?|json)$/.test(name)&&!name.endsWith('.test.ts')).map(name=>`${dir}/${name}`));
const playerText = [JSON.stringify(CASES), JSON.stringify(STORIES), JSON.stringify(TALENTS),JSON.stringify(DEBUFFS),...uiFiles.map(path=>readFileSync(path,'utf8')),readFileSync('src/game/endings.ts', 'utf8')].join('\n');
for (const term of ['今天你刑医了吗', '卷王', '社牛体质', '主任眼前人', '脸皮厚实', '文书侠', '欧皇附体', '临床第六感', '天生负债体质', '过目不忘', '铁人体质', '夜猫子', '手温', '科室老资格', '本页面用于', '本页面展示', '实现了', '开发中', 'TODO', '占位图']) assert(!playerText.includes(term), `Player text leak: ${term}`);
const assets=['hospital','characters-a','characters-b','ward-map','hero-walk','npc-sprites','npc-idle','patient-portraits','bedside','bed-patients','bedside-patients'];
for (const name of assets) assert(readFileSync(`public/art/${name}.webp`).length > 1000, `Missing art ${name}`);
assert.equal(CASES.length, 20); assert.equal(DEBUFFS.length, 24);
console.log(JSON.stringify({ cases: CASES.length, clinicalScenes: CASES.length * 4, authoredStories: STORIES.length, authoredChoices: choices, talents: TALENTS.length, debuffs: DEBUFFS.length, assets: assets.length, status: 'passed' }, null, 2));
