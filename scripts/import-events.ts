import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { createHash } from 'node:crypto';

// Mechanical, lossless import. Design prose remains provenance; the runtime compiler
// below interprets costs and gates and never exposes development notes in card text.
const root = resolve(process.argv[2] ?? 'docs/design');
const out = resolve('src/content/events');
mkdirSync(out, { recursive: true });
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const sources: { path: string; sha256: string }[] = [];
function read(path: string) {
  const text = readFileSync(join(root, path), 'utf8');
  sources.push({ path, sha256: digest(text) });
  return text;
}
const cells = (line: string) => line.split('|').slice(1, -1).map(s => s.trim());
const events = readdirSync(join(root, '13_事件库')).filter(f => /^0[1-8]_/.test(f)).flatMap(file => {
  const path = `13_事件库/${file}`;
  const text = read(path);
  return text.split('\n').flatMap((line, index) => {
    if (!/^\| E-\d{3} \|/.test(line)) return [];
    const [id, title, trigger, weight, prose, options, followup] = cells(line);
    if (!followup) throw new Error(`${path}:${index + 1}: incomplete row`);
    const category = Number(file.slice(0, 2));
    const parsed = options.split(/<br\s*\/?>/).map((s, i) => {
      const [label, ...clauses] = s.replace(/^[①②③④⑤]\s*/, '').split('→');
      return { id: `${id}-${String.fromCharCode(97 + i)}`, label: label.trim(), consequence: clauses.join('→').trim() };
    });
    // Scope is stated on the row so the runtime never infers it from consequence
    // text. A bed number written into the prose always names one bound patient.
    const consequences = parsed.map(o => o.consequence).join('');
    // E-144 and E-195 spread one consequence over three named beds; the run
    // charges that to the transfer or the dataset, not to a single patient.
    const scope = ['E-144', 'E-195'].includes(id) ? 'project'
      : /(?:床\s*\d+|\d+\s*床)/.test(prose) && !['E-200', 'E-202'].includes(id) ? 'patient'
      : ['E-052', 'E-053', 'E-054'].includes(id) || category === 1 || /（[^）]*(?:床|病人|患者)/.test(consequences) ? 'patient'
      : [5, 6, 7].includes(category) ? 'project' : 'personal';
    return [{ id, title, trigger, weight: weight === '—' ? 0 : Number(weight), text: prose,
      options: parsed, followup, category, scope, source: { path, line: index + 1, sha256: digest(line) } }];
  });
});
if (events.length !== 212 || events.some((e, i) => e.id !== `E-${String(i + 1).padStart(3, '0')}`)) throw new Error('Expected consecutive E-001…E-212');
const butterflies = readdirSync(join(root, '16_暗黑事件链')).filter(f => /^BTF/.test(f)).map(file => {
  const path = `16_暗黑事件链/${file}`;
  const text = read(path);
  const id = `BTF-${file.slice(3, 6)}`;
  const sections = [...text.matchAll(/^## (N\d{2}) · (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
  const nodes = sections.map(m => {
    const body = m[3];
    const paragraphs = body.split('\n\n').map(s => s.trim()).filter(Boolean);
    return { id: `${id}:${m[1]}`, localId: m[1], title: m[2], entrance: paragraphs.find(p => p.startsWith('入口')) ?? '',
      text: paragraphs.filter(p => !p.startsWith('入口') && !p.startsWith('|'))[0] ?? '',
      rules: body,
      options: body.split('\n').filter(l => /^\| N\d{2}[a-e] \|/.test(l)).map(line => {
        const [oid, requires, label, cost, outcome] = cells(line);
        return { id: `${id}:${oid}`, localId: oid, requires, label, cost, outcome,
          targets: [...outcome.matchAll(/(?:BTF-\d{3}:)?(?:N\d{2}|R\d{2})|XJ-\d{2}/g)].map(x => x[0].includes(':') || x[0].startsWith('XJ') ? x[0] : `${id}:${x[0]}`) };
      }), source: { path, sha256: digest(body) } };
  });
  const resolutions = [...text.matchAll(/^### (R\d{2}) · (.+)\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)].map(m => ({
    id: `${id}:${m[1]}`, title: m[2], text: m[3].split('\n\n').filter(p => !p.trim().startsWith('导出')).join('\n\n').trim(), exports: m[3].split('\n\n').find(p => p.startsWith('导出')) ?? '', source: { path, sha256: digest(m[3]) },
  }));
  return { id, title: text.split('\n')[0].replace(/^# /, ''), nodes, resolutions,
    resolutionRule: text.match(/^## 收口\n([\s\S]*?)(?=^###)/m)?.[1].trim() ?? '',
    source: { path, sha256: digest(text) } };
});
const index = read('16_暗黑事件链/00_索引与演出规则.md');
const merges = [...index.matchAll(/^### (XJ-\d{2}) · (.+)\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)].map(m => ({
  id: m[1], title: m[2], entrance: m[3].split('\n\n').find(p => p.startsWith('入口')) ?? '',
  text: m[3].split('\n\n').filter(p => p.trim() && !p.startsWith('入口') && !p.startsWith('|'))[0]?.trim() ?? '',
  options: m[3].split('\n').filter(l => /^\| XJ\d{2}[a-d] \|/.test(l)).map(l => { const [id, requires, label, cost, outcome] = cells(l); return { id, requires, label, cost, outcome }; }),
  source: { path: '16_暗黑事件链/00_索引与演出规则.md', sha256: digest(m[3]) },
}));
const endingsText = read('06_结局与鉴定庭.md');
const endings = endingsText.split('\n').filter(l => /^\| X\d{2} \|/.test(l)).map(l => {
  const [id, category, title, trigger, priority] = cells(l);
  return { id, category, title, trigger, priority: /^\d+$/.test(priority) ? +priority : priority,
    source: { path: '06_结局与鉴定庭.md', sha256: digest(l) } };
});
const routesText = read('03_主线与支线.md');
const routes = [...routesText.matchAll(/^### (2\.\d+) (.+)\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)].map(m => ({ id: m[1], title: m[2], rules: m[3].trim() }));
read('15_蝴蝶效应与因果链.md'); read('05_事件库.md'); read('02_天赋与debuff.md'); read('13_事件库/00_说明与字段.md');
writeFileSync(join(out, 'authored.json'), JSON.stringify({ schema: 1, events, butterflies, merges, endings, routes, sources }, null, 2) + '\n');
console.log(`Imported ${events.length} events, ${butterflies.reduce((s,b) => s + b.nodes.length, 0)} nodes, ${merges.length} merges, ${endings.length} endings from ${sources.length} hashed sources.`);
