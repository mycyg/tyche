import type { Effects, HazardInput, Skill } from '../../game/types';
import type { ClinicalGraph, ClinicalNode, GraphOption, GraphSource, GraphCondition } from './types';

const ids = (s: string) => [...s.matchAll(/\b[a-z][a-z0-9_]*(?:=[a-z][a-z0-9_]*)?\b/g)].map(m => m[0]).filter(x => !['flag','causal','explicit','explicit_norm','SAN','DC'].includes(x));
export const clean = (s: string) => s.replace(/【[^】]*(?:假设|待核|⚠)[^】]*】/g, '').replace(/`/g,'').replace(/\*\*/g,'').trim();
const num = (s = '') => Number(s.replace(/,/g,'').match(/-?\d+(?:\.\d+)?/)?.[0] ?? 0);
const cells = (s: string) => s.trim().replace(/^\||\|$/g,'').split('|').map(x => x.trim());
const f = (flag: string): GraphCondition => ({flag});
const choice = (choice: string): GraphCondition => ({choice});

export const missingTribunalRows: string[] = [];
function tribunalReason(graph: ClinicalGraph, optionId: string, value: string, fallback: string): string {
  const authored = graph.tribunal[optionId];
  if (authored) return authored;
  if (/\b[RCDF]\s*\+?\s*\d/.test(value)) missingTribunalRows.push(`${graph.id}/${optionId}`);
  return fallback;
}

export function parseHazards(value: string, reason: string): HazardInput[] {
  return [...value.matchAll(/\b([RCDF])\s*\+?\s*(\d+)([^；;]*)(?=；|;|$)/g)].map(m => ({
    type: m[1] as HazardInput['type'], weight: Number(m[2]), reason,
    norm: /explicit/.test(m[3]) ? '院内诊疗与记录制度' : '病例处置要求', causal: /causal/.test(m[3]),
  }));
}
function flagEffects(raw: string, checked: boolean): {base: string[]; success: string[]; failure: string[]} {
  const out = {base: [] as string[], success: [] as string[], failure: [] as string[]};
  for (const fragment of raw.split(/[；;,，、]|\s或\s|）或/)) {
    const token = ids(fragment)[0];
    if (!token) continue;
    const target = /失败|败/.test(fragment) ? 'failure' : /成功|成：/.test(fragment) || (checked && /^成功/.test(raw)) ? 'success' : 'base';
    out[target].push(token);
  }
  return out;
}
const skillMap: Record<string, Skill> = {问诊:'observe',察觉:'observe',安抚:'comfort',说服:'persuade',文书:'record'};

export function parseClinicalSource(raw: string, file: string): ClinicalGraph {
  const lines = raw.split('\n');
  const section = (name: RegExp) => {
    const start = lines.findIndex(l => /^## /.test(l) && name.test(l));
    let end = lines.findIndex((l,i) => i > start && /^## /.test(l)); if (end < 0) end=lines.length;
    return {lines:lines.slice(start+1,end), start:start+1};
  };
  const source = (line: number, section: string, text: string): GraphSource => ({file,line:line+1,section,raw:text});
  const meta = Object.fromEntries(section(/基本信息/).lines.filter(l => l.startsWith('|')).map(cells).filter(c => c.length===2));
  const p = section(/呈现/).lines;
  const id = raw.match(/^# (C\d+)/)?.[1] ?? '';
  const getP = (key:string) => clean(p.find(x => new RegExp(`\\*\\*(?:${key})[^*]*\\*\\*`).test(x))?.replace(/^\*\*[^*]+\*\*[：:]?/, '') ?? '');
  const graph: ClinicalGraph = {
    id,title:clean(meta['标题'] ?? raw.split('\n')[0].replace(/^# C\d+ /,'')),department:clean(meta['科室']),setting:clean(meta['场景']),
    budget:num(meta['预算'] ?? meta['DIP 病组与预算']?.match(/¥[\d,]+/)?.[0]),
    dipGroup:clean(meta['DIP 病组']??meta['DIP 病组与预算']?.replace(/[；，]?\s*¥[\d,]+.*$/,'')??''),
    source:source(0,'病例全文',raw), presentation:{complaint:getP('主诉'),history:p.filter(l=>l.startsWith('- ')).map(l=>clean(l.slice(2))),vitals:getP('生命体征|入院生命体征'),appearance:getP('外观|床旁物品|现场')},
    variants:[],nodes:[],reports:[],outcomes:[],tribunal:{},flagConsumers:{},environment:[],normalizationNotes:[],
  };
  const t = section(/鉴定书会怎么写/);
  t.lines.filter(l=>/^\| s/.test(l)).forEach(l=>{const c=cells(l);graph.tribunal[c[0]]=clean(c[1]);});
  const stepSection = section(/步骤图/);
  let node: ClinicalNode | undefined; let header: string[]=[]; let variantTable='';
  for (let i=0;i<stepSection.lines.length;i++) {
    const line=stepSection.lines[i]; const absolute=stepSection.start+i;
    const title=line.match(/^### (s\w+) (.+)/);
    if(title){
      node={id:title[1],title:clean(title[2].replace(/（叙事档[：:].*/,'').replace(/（仅.*$/,'')),text:title[2].match(/（叙事档[：:](.*)）/)?.[1]??'',source:source(absolute,title[1],line),kind:'single',min:1,max:1,exit:'outcomes',options:[]};
      graph.nodes.push(node);header=[];variantTable='';continue;
    }
    if(!node)continue;
    node.source.raw+='\n'+line;
    if(/^场景[：:]/.test(line)) {node.text+=(node.text?'\n':'')+clean(line.replace(/^场景[：:]\s*/,''));continue;}
    if(/^节点规则/.test(line)) {
      if(line.includes('multi')){node.kind='multi';node.min=num(line.match(/最少\s*(\d+)/)?.[1])||1;node.max=num(line.match(/最多\s*(\d+)/)?.[1])||2;}
      if(line.includes('auto')){node.kind='auto';node.min=0;node.max=0;}
      node.exit=line.match(/(?:自动进入|继续」进入)\s*「?(s\w+|结局判定)/)?.[1]?.replace('结局判定','outcomes')??'outcomes';
      continue;
    }
    if(/^变体「/.test(line))variantTable=line.match(/^变体「([^」]+)/)?.[1]??'';
    if(/^默认（/.test(line))variantTable='default';
    if(line.startsWith('|')) {
      const c=cells(line);
      if(c[0]==='选项 ID'){header=c;continue;}
      if(!/^s\w+/.test(c[0])||!header.length)continue;
      const d=Object.fromEntries(header.map((h,n)=>[h,c[n]??'']));
      const checkRaw=d['检定']; const checkMatch=checkRaw.match(/(问诊|察觉|安抚|说服|文书)\s*DC\s*(\d+)/);
      const flags=flagEffects(d['设置 flag'],!!checkMatch);
      const hazards=parseHazards(d['隐患'],tribunalReason(graph,c[0],d['隐患'],clean(d['选项文本'])));
      const effects: Effects={stamina:-num(d['体力']),flags:flags.base};
      const conditionalHazard=d['隐患'].match(/(?:未设|未设置)\s*([a-z_]+)\s*时|([a-z_]+)\s*时[：:]/);
      if(!conditionalHazard&&hazards.length)effects.hazards=hazards;
      const next=(d['下一步'].match(/^(s\w+|o_\w+|本节点|结局判定)/)?.[1]??'outcomes').replace('本节点',node.id).replace('结局判定','outcomes');
      const option:GraphOption={id:c[0],label:clean(d['选项文本']),ap:num(d['AP']),minutes:num(d['分钟']??d['时间']),cost:num(d['费用 ¥']),result:'',effects,next,source:source(absolute,node.id,line),rules:[],reports:[],system:d['类型']==='系统'};
      if(conditionalHazard){option.rules.push({when:conditionalHazard[1]?{not:f(conditionalHazard[1])}:f(conditionalHazard[2]),effects:{hazards}});}
      if(variantTable&&variantTable!=='default')option.requires={variant:variantTable};
      if(checkMatch) {
        const failureText=clean((checkRaw.match(/(?:失败|败)\s*(?:[：:→]\s*)?([\s\S]*)$/)?.[1]??'').replace(/可再选.*/,''))||'对方没有补充更多信息。';
        const failure:Effects={};const failureHazards=parseHazards(failureText,tribunalReason(graph,c[0],failureText,failureText));
        if(failureHazards.length)failure.hazards=failureHazards;
        const em=failureText.match(/情绪\s*[−-]\s*(\d+)/);if(em)failure.emotion=-Number(em[1]);
        option.check={skill:skillMap[checkMatch[1]],dc:Number(checkMatch[2]),failure,failureText};
        option.successText=clean(checkRaw.match(/成[：→]([^·；]*)(?:[·；]|$)/)?.[1]??'');
        if(flags.success.length)option.rules.push({on:'success',effects:{flags:flags.success}});
        if(flags.failure.length)option.rules.push({on:'failure',effects:{flags:flags.failure}});
        if(/再选|重选/.test(checkRaw))option.retry={max:2,dcIncrease:2,exhaustedNext:checkRaw.match(/再败进入\s*(o_\w+)/)?.[1]};
      }
      for(const [key,pattern] of Object.entries({san:/SAN\s*[−-]\s*(\d+)/,emotion:/情绪\s*[−-]\s*(\d+)/,reputation:/声望\s*[−-]\s*(\d+)/})) {
        const m=(d['设置 flag']+' '+(!checkMatch?checkRaw:'')).match(pattern);if(m)(effects as Record<string,unknown>)[key]=-Number(m[1]);
      }
      option.result=clean(d['设置 flag'].match(/（回报[：:]([^）]+)）/)?.[1]??'');
      node.options.push(option);continue;
    }
    // Action-scoped narration belongs to its result, never to the pre-choice scene.
    // All original lines remain in node.source.raw for provenance.
    if(line.trim()&&!/^(说明|医嘱|处方|转运医嘱|溶栓医嘱|叙事（|系统档|CT 对比|此步|本步骤|节点规则|s\d|默认|变体|皮试液|《|死亡病例|疑似|重大医疗)/.test(line)&&!/^台词|^查体回报/.test(line))node.text+=(node.text?'\n':'')+clean(line);
    const dialogue=line.match(/^(?:台词|查体回报|叙事|医嘱|处方|转运医嘱|溶栓医嘱)（([^）]+)）[：:](.*)/);
    if(dialogue){const targets=new Set(dialogue[1].split(/[^A-Za-z0-9_]+/).filter(Boolean));
      for(const op of node.options.filter(o=>targets.has(o.id))){
      if(/失败/.test(dialogue[1])&&op.check)op.check.failureText=clean(dialogue[2]);
      else if(/成功/.test(dialogue[1]))op.successText=clean(dialogue[2]);
      else op.result+=(op.result?'\n':'')+clean(dialogue[2]);
    }}
  }
  // Only legacy nodes lack declared contracts. Exact optional-action behavior is reviewed below.
  graph.nodes.forEach((n,i)=>{if(n.exit==='outcomes'&&i<graph.nodes.length-1)n.exit=graph.nodes[i+1].id;});
  const labs=section(/化验/);let reportTitle='';let reportLine=0;let reportHint='';
  for(let i=0;i<labs.lines.length;i++){
    const line=labs.lines[i];
    if(/^\*\*/.test(line)){reportTitle=clean(line);reportLine=labs.start+i;reportHint=line;continue;}
    const m=line.match(/^(?:- )?全文[：:](.*)/);if(!m)continue;
    const full=clean(m[1]);
    let end=i+1;while(end<labs.lines.length&&!/^\*\*/.test(labs.lines[end]))end++;
    const excerpt=labs.lines.slice(i+1,end).find(l=>/\[扫读\]/.test(l));
    const skimmed=excerpt?clean(excerpt.replace(/^.*?\[扫读\][：:\s]*/,'').replace(/^[「『]/,'').replace(/[」』]\s*$/,'')):full;
    let reportWhen:GraphCondition={always:true};const refs=ids(reportHint).filter(x=>/^s\d/.test(x));
    if(refs.length)reportWhen={any:refs.map(choice)};
    graph.reports.push({id:`${id}_r${graph.reports.length+1}`,title:reportTitle,full,skimmed,source:source(reportLine,'检查回报',reportHint+'\n'+labs.lines.slice(i,end).join('\n')),when:reportWhen});
  }
  const out=section(/结局分支/);let outHeader:string[]=[];
  for(let i=0;i<out.lines.length;i++){
    const line=out.lines[i];if(!line.startsWith('|'))continue;const c=cells(line);
    if(c[0]==='ID'){outHeader=c;continue;}if(!c[0].startsWith('o_'))continue;
    const d=Object.fromEntries(outHeader.map((h,n)=>[h,c[n]??'']));
    const malformed=id==='C020';const severity=malformed?({o_chain:0,o_respectful_dispute:0,o_lost_chain:1,o_obstruction:1}[c[0]]??0):num(d['严重度']);
    graph.outcomes.push({id:c[0],title:c[0],priority:d['优先级']?num(d['优先级']):[0,100,300,400][severity],severity,seed:(malformed?c[3]:d['种子']).startsWith('是'),condition:{always:true},text:clean(c[c.length-1]),source:source(out.start+i,'结局分支',line)});
  }
  const env=section(/环境片段/);env.lines.filter(l=>/^\| (?!时段|---)/.test(l)).forEach(l=>{const c=cells(l);graph.environment.push({time:c[0],fatigue:c[1],san:c[2],text:c[c.length-1]});});
  return graph;
}
