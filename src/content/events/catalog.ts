import source from './authored.json';
import type { Effects, HazardInput, Relation, Skill } from '../../game/types';
import type { AuthoredEvent, DelayedEffect, EventBinding, EventCard, EventContext, EventModifier, EventOption, EventPhase } from './types';
import { eventPlayerText, eventPlayerOutcome, eventPlayerHint } from './copy';
import { EVENT_RESULTS, EVENT_FAILURES, EVENT_DEFERRED_RESULTS } from './narrative';
import {RULES}from '../../game/rules';
import {EVENT_DIALOGUE,eventOptionLabel}from './player-dialogue';

const phaseNames: EventPhase[] = ['交班', '查房', '门诊', '结算', '夜班', '日终'];
const relations: Record<string, Relation> = { 主任: 'chief', 护士长: 'nurse', 同年住院医: 'peer', 同事: 'peer', 家人: 'family' };
const skillNames: Record<string, Skill> = { 问诊: 'clinical', 临床: 'clinical', 察觉: 'observe', 说服: 'persuade', 文书: 'record', 安抚: 'comfort', 抗压: 'endure' };
const resourceNames: Record<string, keyof Effects> = { 体力: 'stamina', SAN: 'san', 情绪: 'emotion', 抑郁: 'depression', 声望: 'reputation', 余额: 'cash', 负债: 'debt', 绩效: 'income' };
const clean = (s: string) => s.replace(/`/g, '').replace(/−/g, '-').replace(/\s+/g, ' ').trim();
const num = (s: string) => Number(s.replace(/[,¥\s]/g, '').replace(/−/g, '-'));
const sum = (a: Effects, b: Effects): Effects => {
  const out: Effects = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const key = k as keyof Effects;
    if (typeof v === 'number') (out as Record<string, unknown>)[k] = Number(out[key] ?? 0) + v;
    else if (Array.isArray(v)) (out as Record<string, unknown>)[k] = [...(out[key] as unknown[] ?? []), ...v];
    else if (v && typeof v === 'object') (out as Record<string, unknown>)[k] = Object.fromEntries([...new Set([...Object.keys(out[key] ?? {}), ...Object.keys(v)])].map(sub => [sub, Number((out[key] as Record<string, number> | undefined)?.[sub] ?? 0) + Number((v as Record<string, number>)[sub] ?? 0)]));
    else (out as Record<string, unknown>)[k] = v;
  }
  return out;
};

/** Only explicit writes count as facts; mentions, questions and refusals never imply consent. */
function factWrites(s: string): string[] {
  const result: string[] = [];
  for (const m of s.matchAll(/写入\s*((?:`[^`]+`(?:\s*[、与]\s*)?)+)/g)) result.push(...[...m[1].matchAll(/`([^`]+)`/g)].map(x => x[1]));
  for (const m of s.matchAll(/`([^`]+)`\s*\+1/g)) result.push(m[1]);
  return [...new Set(result)];
}
function immediateEffects(raw: string): Effects {
  const text = clean(raw);
  const effects: Effects = {};
  for (const m of text.matchAll(/(体力|SAN|情绪|抑郁|声望|余额|负债|绩效)\s*([+-])\s*¥?([\d,]+)/g)) {
    const prefix = text.slice(Math.max(0, m.index! - 5), m.index!);
    if (/上限|关系/.test(prefix)) continue;
    const k = resourceNames[m[1]];
    (effects as Record<string, unknown>)[k] = Number(effects[k] ?? 0) + (m[2] === '-' ? -1 : 1) * num(m[3]);
  }
  for (const m of text.matchAll(/(主任|护士长|同年住院医|同事|家人)关系\s*([+-])\s*(\d+)/g)) {
    const k = relations[m[1]];
    effects.relations ??= {};
    effects.relations[k] = (effects.relations[k] ?? 0) + (m[2] === '-' ? -1 : 1) * +m[3];
  }
  for (const m of text.matchAll(/(体力|SAN|情绪)上限\s*([+-])\s*(\d+)/g)) {
    effects.caps ??= {};
    effects.caps[resourceNames[m[1]] as 'stamina' | 'san' | 'emotion'] = (m[2] === '-' ? -1 : 1) * +m[3];
  }
  const allCaps = text.match(/三上限各\s*([+-])\s*(\d+)/);
  if (allCaps) effects.caps = { stamina: (allCaps[1] === '-' ? -1 : 1) * +allCaps[2], san: (allCaps[1] === '-' ? -1 : 1) * +allCaps[2], emotion: (allCaps[1] === '-' ? -1 : 1) * +allCaps[2] };
  const pressure=text.match(/现金压力\s*([+-])\s*(\d+)/);
  if(pressure)effects.cashPressure=(pressure[1]==='-'?-1:1)*+pressure[2];
  for(const m of text.matchAll(/(?:^|[；，\s])([RCDF])\s*-\s*(\d+)/g)) {
    effects.hazardRelief??={};const type=m[1] as HazardInput['type'];
    effects.hazardRelief[type]=(effects.hazardRelief[type]??0)+Number(m[2]);
  }
  for (const m of text.matchAll(/(?:^|[；，\s])([RCDF])\s*\+\s*(\d+)(?:（([^）]+)）)?/g)) {
    // D+7 followed by a date/settlement is a delay, not documentation hazard.
    if (m[1] === 'D' && /^(?:\s*)(结算|起|门诊|为|日|后)/.test(text.slice(m.index! + m[0].length))) continue;
    const type = m[1] as HazardInput['type'];
    effects.hazards ??= [];
    effects.hazards.push({ type, weight: +m[2], reason: m[3] ?? ({ R: '本次处置留下的诊疗缺项', C: '本次告知或沟通缺项', D: '本次记录与实际经过不符', F: '本次收费或项目手续不符' }[type]), norm: { R: '处置应符合当前患者的实际情况', C: '告知内容和同意范围应有记录', D: '记录应与实际经过、时间一致', F: '费用、用途与审批应一致' }[type], causal: /causal/.test(m[3] ?? '') });
  }
  const flags = factWrites(raw);
  if (flags.length) effects.flags = flags;
  const clearMatch = [...raw.matchAll(/清除\s*`([^`]+)`/g)].map(m => m[1]);
  if (clearMatch.length) effects.clear = clearMatch;
  const bill = text.match(/(?:DIP 费用|追回|拒付)\s*([+-]?)\s*¥([\d,]+)/);
  if (bill) {
    if (/DIP 费用/.test(bill[0])) effects.bill = (bill[1] === '-' ? -1 : 1) * num(bill[2]);
    else effects.cash = (effects.cash ?? 0) - num(bill[2]);
  }
  return effects;
}

function compileClauses(raw: string, id: string): { effects: Effects; deferred: DelayedEffect[]; modifiers: EventModifier[]; ap: number; minutes: number } {
  let effects: Effects = {};
  const deferred: DelayedEffect[] = [], modifiers: EventModifier[] = [];
  let ap = 0, minutes = 0;
  const clauses = raw.split(/[；;]/).map(x => x.trim()).filter(Boolean);
  clauses.forEach((clause, index) => {
    const c = clean(clause), cid = `${id}:${index}`;
    const relative = c.match(/D\+(\d+)\s*(?:结算|门诊|交班|查房|夜班|日终|起|后)/);
    const fixed = c.match(/\bD(\d+)(?!\d)/);
    const nextDay = /次日|明日|明早|出院日|局终后|局终之后/.test(c);
    const repeated = c.match(/([二三四五六七十两一]|\d+)[日夜](?:内)?(?:每|.*?每)/);
    const cn: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 十: 10 };
    const daily = /每日|三日每晚/.test(c);
    if (relative || fixed || nextDay || daily) {
      const d: DelayedEffect = { id: cid, delay: relative ? +relative[1] : /局终后|局终之后/.test(c) ? 15 : 1, ...(fixed ? { day: +fixed[1] } : {}), phase: /日终|夜睡|每晚/.test(c) ? '日终' : /夜班/.test(c)&&!/(?:增加|多一个)夜班/.test(c)?'夜班':/门诊/.test(c)?'门诊':/查房/.test(c)?'查房':/AP|开局|交班/.test(c) ? '交班' : '结算', effects: immediateEffects(clause), description: readableConsequence(clause) };
      const perCase=/每(?:次|个|起|病例)|查房 AP/.test(c);
      const nextAp = !perCase&&c.match(/AP\s*([+-])\s*(\d+)/);
      if (nextAp) d.effects.apAllowance = (nextAp[1] === '-' ? -1 : 1) * +nextAp[2];
      if (/次日.*(?:请假|AP\s*=\s*0)/.test(c)) modifiers.push({ id: cid, kind: 'leave', value: 1, days: 1, description: '明日请假，病区工作由科室重新分配。' });
      if (/次日增加一个夜班/.test(c)) modifiers.push({ id: cid, kind: 'night-shift', value: +(c.match(/预算\s*(\d+)/)?.[1] ?? 200), days: 1, description: '明天要值你已经答应的夜班，交接后按排班到岗。' });
      if (repeated) d.repetitions = cn[repeated[1]] ?? +repeated[1];
      else if (daily) d.repetitions = /三日/.test(c) ? 3 : 14;
      if (/至出院/.test(c)) d.until = d.effects.bill!==undefined
        ? ['patient-discharged'] : ['家庭-出院', '家庭-放弃治疗', '家庭-丧亲'];
      const chance = c.match(/([≤≥])\s*(\d+)/);
      if (/掷 d20/.test(c) && chance) d.probability = chance[1]==='≤'?+chance[2]/20:(21-+chance[2])/20;
      if(/出院日/.test(c)){d.requires=['patient-discharged'];d.delay=0;}
      deferred.push(d);
      // Dated check/sleep/per-patient rules start on their due day. AP allowance
      // is a one-off change above, not an additional per-patient workload charge.
      const checkBonus=c.match(/检定\s*([+-]\s*\d+)/);
      const timing={...(d.day===undefined?{startsAfter:d.delay}:{startsOn:d.day}),days:d.repetitions??1};
      if(checkBonus)modifiers.push({id:cid,kind:'skill',target:Object.keys(skillNames).find(n=>c.includes(n))?skillNames[Object.keys(skillNames).find(n=>c.includes(n))!]:'all',value:num(checkBonus[1]),...timing,description:readableConsequence(c)});
      if(/睡眠/.test(c))modifiers.push({id:cid,kind:'sleep',value:Number(c.match(/×\s*([\d.]+)/)?.[1]??1),...timing,description:readableConsequence(c)});
      if(perCase)modifiers.push({id:cid,kind:'workload',...timing,description:readableConsequence(c)});
      return;
    }
    if (/今夜睡眠|睡眠恢复/.test(c)) {
      modifiers.push({ id: cid, kind: 'sleep', value: +(c.match(/×\s*([\d.]+)/)?.[1] ?? 1), days: /三夜/.test(c) ? 3 : /两夜/.test(c) ? 2 : 1, description: readableConsequence(c) }); return;
    }
    const recovery = c.match(/(体力|SAN|情绪)\s*恢复到\s*(?:上限\s*)?(\d+)(%)?/);
    if (recovery) modifiers.push({ id: cid, kind: 'recover', target: resourceNames[recovery[1]], value: +recovery[2], factor: recovery[3] ? +recovery[2] / 100 : undefined, description: readableConsequence(c) });
    if (/检定\s*[+-]|检定 DC|刑拘 DC|概率|权重|每次|每个|每起|直到|至局末/.test(c)) {
      const foundSkill = Object.keys(skillNames).find(n => c.includes(n));
      modifiers.push({ id: cid, kind: /检定|DC/.test(c) ? 'skill' : 'formula', value: c.match(/(?:检定|DC)\s*([+-]\s*\d+)/) ? num(c.match(/(?:检定|DC)\s*([+-]\s*\d+)/)![1]) : undefined, target: /刑拘/.test(c) ? 'arrestDC' : foundSkill ? skillNames[foundSkill] : 'all', factor: +(c.match(/×\s*([\d.]+)/)?.[1] ?? 1), days: /三日/.test(c) ? 3 : 14, ...(/至出院/.test(c) ? { until: ['patient-discharged'] } : {}), description: readableConsequence(c) });
      // Rule costs such as “每起 +¥100” are applied when that work actually occurs.
      if (/每次|每个|每起/.test(c)) return;
    }
    if (/请假|AP=0/.test(c)) modifiers.push({ id: cid, kind: 'leave', value: /半天/.test(c) ? 0.5 : /两日|两天/.test(c) ? 2 : /三日|三天/.test(c) ? 3 : 1, description: readableConsequence(c) });
    const dailyBill=c.match(/DIP 费用\s*([+-])\s*¥([\d,]+)／日/);
    if(dailyBill)modifiers.push({id:cid,kind:'formula',target:'patientDailyCost',value:(dailyBill[1]==='-'?-1:1)*num(dailyBill[2]),startsAfter:1,days:14,until:['patient-discharged'],description:readableConsequence(c)});
    if (/增加一个夜班|多一个夜班/.test(c)) modifiers.push({ id: cid, kind: 'night-shift', value: 1, days: 1, description: readableConsequence(c) });
    if (/待处理款|待处理物品|待处理资产/.test(c)) { modifiers.push({ id: cid, kind: 'pending-asset', value: +(c.match(/¥([\d,]+)/)?.[1].replace(/,/g, '') ?? 0), description: '这笔款项你还没接受，需要登记退回，或另行说明怎么处理。' }); return; }
    const a = c.match(/(?:^|\s)(\d+)\s*AP/);
    if (a) ap += +a[1];
    const minute = c.match(/(?:夜班|时间\s*\+?)\s*(\d+)\s*分钟/);
    if (minute) minutes += +minute[1];
    // AP + means extra work in authored rows, AP - means an explicit action cost.
    const apCost = c.match(/^AP\s*-\s*(\d+)/);
    if (apCost) ap += +apCost[1];
    effects = sum(effects, immediateEffects(clause));
    if (!a && /新增.*病例|AP\s*\+/.test(c)) modifiers.push({ id: cid, kind: 'workload', value: +(c.match(/AP\s*\+\s*(\d+)/)?.[1] ?? 3), description: readableConsequence(c) });
  });
  return { effects, deferred, modifiers, ap, minutes: minutes || ap * 12 };
}

function readableConsequence(raw: string): string {
  return raw.replace(/`/g, '').replace(/写入\s*/g, '留下记录：').replace(/清除\s*/g, '结束：')
    .replace(/引擎掷 d20，/g, '后续结果：').replace(/causal/g, '与本次伤害有关').replace(/Q 按 01 派生/g, '')
    .replace(/（按 01[^）]*）/g, '').replace(/按 01 §[\d.]+[^；，]*/g, '按账单结算').replace(/\s*flag/g, '记录').trim();
}

function optionsFor(row: typeof source.events[number]): EventOption[] {
  const result = row.options.map((o,index): EventOption => {
    const checkMatch = o.consequence.match(/检定[：:]\s*(问诊|临床|察觉|说服|文书|安抚|抗压)\s*DC\s*(\d+)/);
    const randomCheck = o.consequence.match(/掷 d20，[≤≥]\s*(\d+)/);
    const chanceTail=randomCheck?o.consequence.slice(o.consequence.indexOf(randomCheck[0])):'';
    const delayedChance=!!randomCheck&&(/考试日|出院日|局终后|局终之后|D(?:\+\d+|\d+)\s*结算/.test(o.consequence)||/次日|D\d+\s*结算/.test(chanceTail));
    const failureSplit = o.consequence.split(/失败[：:]/);
    const successSplit = failureSplit[0].split(/成功[：:]/);
    let common = successSplit[0];
    if (checkMatch) common = common.replace(/检定[：:][^；]*(?:；|$)/, '');
    let success = successSplit[1] ?? '';
    let failure = failureSplit.slice(1).join('失败：');
    if (checkMatch && !successSplit[1]) {
      // Everything before “失败” is cost paid regardless of the roll.
      success = '';
    }
    if (randomCheck && !checkMatch && !delayedChance) {
      const parts = common.split(/引擎掷 d20，[≤≥]\s*\d+\s*(?:则|不通过[：:]?)?/);
      common = parts[0]; failure = parts.slice(1).join('');
      if(randomCheck[0].includes('≥')){const branches=failure.split(/否则[：:]/);success=branches[0];failure=branches[1]??'';}
    }
    const base = compileClauses(common, `${o.id}:cost`);
    const pass = compileClauses(success, `${o.id}:pass`);
    const fail = compileClauses(failure, `${o.id}:fail`);
    // Base costs must not be copied into check failure: engine applies base then failure.
    const option: EventOption = {
      id: o.id, label: o.label, ap: base.ap + pass.ap, minutes: base.minutes + pass.minutes, cost: 0,
      result: EVENT_RESULTS[row.id]?.[index] ?? eventPlayerOutcome(o.label, success || common),
      effects: sum(base.effects, pass.effects), consequence: o.consequence,
      deferred: [...base.deferred, ...pass.deferred], modifiers: [...base.modifiers, ...pass.modifiers],
      emittedFacts: factWrites(common + success),
      hint: eventPlayerHint(o.consequence),
    };
    if (checkMatch || (randomCheck && failure && !delayedChance)) {
      const skill: Skill = checkMatch ? skillNames[checkMatch[1]] : 'observe';
      const successOnly = pass.effects;
      // Failed checks remove success-only rewards while preserving the actual paid cost.
      const correction: Effects = {};
      for (const [k, v] of Object.entries(successOnly)) if (typeof v === 'number') (correction as Record<string, unknown>)[k] = -v;
      if (successOnly.flags?.length) correction.clear = successOnly.flags;
      if (successOnly.relations) correction.relations = Object.fromEntries(Object.entries(successOnly.relations).map(([k,v]) => [k, -v])) as Effects['relations'];
      const chanceDC=randomCheck?+randomCheck[1]+Number(!randomCheck[0].includes('≥')):0;
      option.check = { skill, dc: checkMatch ? +checkMatch[2] : chanceDC, purpose: o.label,
        failure: sum(correction, fail.effects), failureText: EVENT_FAILURES[o.id] ?? eventPlayerOutcome(o.label, failure, true) };
      option.failureTotal=sum(base.effects,fail.effects);
      option.failureDeferred = fail.deferred; option.failureModifiers = fail.modifiers;
      if(!checkMatch)option.chanceCheck={successAtLeast:chanceDC};
    }
    return option;
  });
  // “失败转①” inherits the actual alternative consequences, never a new click/cost twice.
  for (const o of result) {
    const fallback = o.consequence.match(/失败[：:][\s\S]*?(?:转|同)([①②③])/);
    if (fallback && o.check) {
      const target = result['①②③'.indexOf(fallback[1])];
      o.check.failure = sum(o.check.failure, target.effects);
      o.failureTotal=sum(o.failureTotal??{},target.effects);
      o.check.failureText = EVENT_FAILURES[o.id]??target.result;
      o.failureDeferred = [...(o.failureDeferred ?? []), ...target.deferred];
      o.failureModifiers = [...(o.failureModifiers ?? []), ...target.modifiers];
    }
  }
  return result;
}

const phaseFor = (r: typeof source.events[number]): EventPhase[] => {
  const p = r.trigger.match(/阶段=(交班|查房|门诊|结算|夜班|日终)(?:／(?:交班|查房|门诊|结算|夜班|日终))*/)?.[0];
  if (p) return phaseNames.filter(n => p.includes(n));
  if (/时段=夜班/.test(r.trigger)) return ['夜班'];
  if (/D\d+ 结算|结算阶段/.test(r.trigger)) return ['结算'];
  if (/晨间交班/.test(r.trigger)) return ['交班'];
  return r.category === 8 ? phaseNames : r.category === 3 ? ['日终'] : ['结算'];
};
const scopeFor = (r: typeof source.events[number]): AuthoredEvent['scopeKind'] => {
  if(['E-052','E-053','E-054'].includes(r.id))return 'patient';
  if (r.category === 7 || r.category === 5) return 'project';
  if (r.category === 1 || /（[^）]*(?:床|病人|患者)/.test(r.options.map(o => o.consequence).join(''))) return 'patient';
  if(r.category===6)return 'project';
  return 'personal';
};

export const AUTHORED_EVENTS: AuthoredEvent[] = source.events.map(row => {
  const options = optionsFor(row);
  const follow = row.followup.split('；').filter(c => !/选[①②③]|成功|失败|使|为|抽取|候选|至写入|已触发|未触发/.test(c));
  const commonFlags = follow.flatMap(factWrites);
  const commonClear=follow.flatMap(c=>immediateEffects(c).clear??[]);
  for (const opt of options) { opt.effects.flags = [...new Set([...(opt.effects.flags ?? []), ...commonFlags])]; if(opt.failureTotal)opt.failureTotal.flags=[...new Set([...(opt.failureTotal.flags??[]),...commonFlags])];if(commonClear.length){opt.effects.clear=[...new Set([...opt.effects.clear??[],...commonClear])];if(opt.failureTotal)opt.failureTotal.clear=[...new Set([...opt.failureTotal.clear??[],...commonClear])];} }
  // Scoped followup writes referring to a chosen option or successful check.
  for (const m of row.followup.matchAll(/选([①②③]+)(?:[^；]*?成功时)?[^；]*?写入\s*`([^`]+)`/g)) {
    for (const marker of m[1]) {
      const opt = options['①②③'.indexOf(marker)];
      if (opt) opt.effects.flags = [...new Set([...(opt.effects.flags ?? []), m[2]])];
    }
  }
  if (row.id === 'E-001') for (const i of [0, 2]) {
    options[i].effects.flags = [...(options[i].effects.flags ?? []), '隐瞒-被抓'];
    options[i].check!.failure.clear = [...(options[i].check!.failure.clear ?? []), '隐瞒-被抓'];
  }
  if(row.id==='E-199'){
    options[2].check!.failure.relations={chief:-2};
    options[2].failureTotal={...options[2].failureTotal,relations:{chief:-1}};
  }
  if(row.id==='E-197')options[2].modifiers.push({id:'E-197-c:leave',kind:'leave',value:.5,description:'今日离岗半天。'});
  if(row.id==='E-198'){
    for(const o of options)o.modifiers.push({id:`${o.id}:collapse-recovery`,kind:'recover',target:'stamina',factor:.5,description:'休息后体力恢复到当前上限的一半。'});
    // The source names the upload in prose, not in an explicit flag clause.
    // Keep the failed increment and full failed settlement in agreement.
    const failed=options[0];
    failed.check!.failure.flags=[...new Set([...failed.check!.failure.flags??[],'视频上网'])];
    failed.failureTotal={...failed.failureTotal,flags:[...new Set([...failed.failureTotal?.flags??[],'视频上网'])]};
  }
  if(row.id==='E-077'){
    options[1].effects={};options[2].effects={relations:{peer:-1}};
    for(const i of [1,2])options[i].deferred=[{id:`${options[i].id}:exam-result`,delay:3,phase:'交班',probability:i===1?.5:.25,effects:{reputation:-5,relations:{chief:-1}},description:EVENT_FAILURES[options[i].id],otherwiseEffects:{},otherwiseDescription:'年度理论考试通过，基地已登记成绩。'}];
  }
  if(row.id==='E-078'){
    const failed={emotion:-15,depression:5,reputation:-5,flags:['qualification-exam-failed']};
    for(const i of [0,1]){
      const o=options[i],base:Effects=i===0?{stamina:-3}:{relations:{peer:-1}};
      o.effects=sum(base,{emotion:10});o.failureTotal=sum(base,failed);o.chanceCheck={successAtLeast:8};
      o.check={skill:'observe',dc:8,purpose:'查看考试成绩',failure:sum({emotion:-10},failed),failureText:EVENT_FAILURES[o.id]};
      o.modifiers=[];o.deferred=[];o.failureModifiers=[{id:`${o.id}:fail:supervised-prescriptions`,kind:'formula',target:'supervised-prescriptions',days:14,value:1,description:'每位门诊患者增加 1 AP，处方需要上级签字。'}];
    }
    options[2].effects={emotion:-5,san:-3};options[2].deferred=[{id:'E-078-c:exam-result',delay:1,phase:'交班',probability:.65,effects:{emotion:10},description:'成绩通过了。你保存查分截图，开始今天的工作。',otherwiseEffects:failed,otherwiseDescription:'成绩未通过，之后的门诊处方需要上级签字。'}];
  }
  if(row.id==='E-084')options[2].deferred=[{id:'E-084-c:peer-absent',delay:1,phase:'交班',probability:.25,effects:{flags:['peer-sick-leave']},description:EVENT_FAILURES['E-084-c']}];
  if(row.id==='E-120')options[1].failureModifiers=[{id:'E-120-b:fail:family-risk',kind:'formula',target:'event-weight:E-099',factor:2,days:14,description:'家里停药的情况仍未解决。'}];
  if(row.id==='E-157')options[2].effects.reputation=8;
  if(row.id==='E-159'){
    options[2].effects.flags=[...(options[2].effects.flags??[]),'DIP-自我限制'];
    options[2].modifiers=[{id:'E-159-c:outpatient-limit',kind:'workload',target:'outpatientHazardR',value:5,startsAfter:1,days:3,description:'连续三天按压缩后的方案接诊，每个门诊病例留下诊疗不足的风险。'}];
  }
  if(row.id==='E-201'){
    options[1].effects.flags=[...(options[1].effects.flags??[]),'幻听'];
    options[1].modifiers=options[1].modifiers.filter(m=>m.kind!=='formula');
    options[1].modifiers.push({id:'E-201-b:pass:night-san',kind:'workload',target:'nightSanPenalty',value:8,days:1,description:'这一夜，幻听会在每次新急诊到来时再次干扰判断。'});
  }
  if(row.id==='E-013'){
    options[0].modifiers=[];options[1].failureModifiers=[];
    options[1].effects.bill=300;
    options[1].hint='精力 2；成功后检查费用 ¥300 计入患者账单，失败未检查则不收此费。';
    options[0].effects.flags=[...(options[0].effects.flags??[]),'refusal-informed-signed'];
    options[1].failureTotal={...options[1].failureTotal,flags:[...(options[1].failureTotal?.flags??[]),'refusal-informed-signed']};
  }
  if(row.id==='E-032'||row.id==='E-109'){
    options[2].deferred=[];options[2].modifiers=[];
  }
  if(row.id==='E-111'){
    const payment=options[1].deferred.find(d=>d.day===14);
    if(payment)payment.effects={cash:-6500};
  }
  if(row.id==='E-009'){
    options[2].deferred[0].effects={ap:-1};options[2].modifiers=[];
  }
  // Dated attendance is actual work, unlike reduced morning availability.
  // Keep both successful and failed chance branches' already booked visits.
  if(row.id==='E-074'||row.id==='E-083')for(const option of options){
    for(const effect of [...option.deferred,...option.failureDeferred??[]]){
      if((effect.effects.apAllowance??0)<0){
        effect.effects.ap=effect.effects.apAllowance;
        delete effect.effects.apAllowance;
      }
    }
  }
  if(row.id==='E-025'){
    options[1].ap=1;options[1].minutes=12;options[1].modifiers=[];
  }
  if(row.id==='E-197') {
    // Remaining-patient omissions are applied to each actual unfinished case
    // by the engine, not to the clinician's personal scope or twice.
    options[2].effects.hazards=[];
  }
  if(row.id==='E-105')for(const i of [0,2])options[i].effects.flags=[...options[i].effects.flags??[],'家庭-婚事已付',...(i===2?['wedding-half-paid']:['wedding-paid'])];
  if(row.id==='E-106') {
    options[0].effects.emotion=0;
    options[0].effects.flags=[...options[0].effects.flags??[],'wedding-planned'];
    options[2].effects.flags=[...options[2].effects.flags??[],'家庭-婚事已付','wedding-gift-paid'];
    for(const o of options)o.hint='婚礼在三天后。是否到场以婚礼当天的实际经过为准；已转出的钱按本次选择结算。';
  }
  if(row.id==='E-035')for(const m of options[1].modifiers)if(m.kind==='skill'){m.kind='formula';m.target='same-patient-dispute-dc';}
  if(row.id==='E-026')options[2].modifiers=[];
  if(row.id==='E-022'||row.id==='E-034')for(const o of options)for(const m of o.modifiers)if(m.kind==='skill'){m.kind='formula';m.target='history-check';m.days=1;}
  if(row.id==='E-098')for(const o of options)for(const m of o.modifiers)if(m.kind==='skill'){m.kind='formula';m.target=`court-preparation:${m.target}`;}
  if(row.id==='E-189'||row.id==='E-192')for(const o of options)for(const m of o.modifiers)if(m.kind==='skill'&&m.target==='all'){m.kind='formula';m.target='paper-defense';}
  // EventTuning exposes roll modifiers, not DC deltas. Raising an auditor's
  // required DC must make that scoped check harder, never grant a bonus.
  if(['E-153','E-155','E-168','E-173'].includes(row.id))for(const o of options)for(const m of [...o.modifiers,...o.failureModifiers??[]])if(m.kind==='skill'&&m.target==='persuade')m.value=-(m.value??0);
  if(row.id==='E-043'){
    options[0].ap=3;options[0].minutes=36;options[0].modifiers=[];
  }
  if(row.id==='E-144'){
    // The allowance follows actual transferred arrivals. The brief-care risk
    // belongs to the later clinical choice, never to the colleague's account.
    options[0].deferred=[];
    options[2].effects.hazards=[];
    options[0].hint='明天门诊加号三人，三人到诊共增加三点行动。问诊、检查和治疗另按处置消耗行动。';
    options[2].hint='明天接手三位加号患者。到诊后可以补做评估；沿用旧病历结束接诊会留下各自的记录缺口。';
  }
  if(row.id==='E-100'){
    options[2].modifiers=[{id:'E-100-c:pass:next-fee',kind:'formula',target:'family-icu-fee',value:4000,startsAfter:1,days:1,description:'次日重症监护病房费用按四千元补交。'}];
  }
  if(row.id==='E-161'){
    // The order explicitly starts tomorrow. The daily adjustment must not also
    // refund today's incurred treatment; E-023 instead continues care today.
    for(const i of [0,2])delete options[i].effects.bill;
  }
  if(row.id==='E-171'){
    delete options[0].effects.cash;delete options[1].failureTotal!.cash;delete options[1].check!.failure.cash;
    options[0].hint='结清本患者尚未支付的实际超预算差额；此后每日新增 ¥600，至本患者出院。';
    options[1].effects.discharge=true;
    for(const d of [...options[0].deferred,...options[1].failureDeferred??[]]){d.effects={bill:600};d.until=['patient-discharged'];}
  }
  if(row.id==='E-194'){
    options[2].failureTotal={...options[2].failureTotal,flags:['paper-journal-counterfeit']};
    options[2].check!.failure.flags=['paper-journal-counterfeit'];
  }
  if(row.id==='E-196'){
    options[1].effects={relations:{chief:-1}};delete options[1].check;delete options[1].chanceCheck;delete options[1].failureTotal;
    options[1].deferred=[{id:'E-196-b:post-run-reimbursement',delay:0,day:16,phase:'结算',probability:.5,effects:{cash:3000},description:'科室批准的三千元版面费报销到账。'}];
  }
  // A colleague refinancing debt is a transfer of creditor, not debt forgiveness.
  if (row.id === 'E-206') options[0].effects.privateDebt = 10000;
  if (row.id === 'E-064') for (const i of [0, 2]) {
    const principal = i === 0 ? 3000 : 1500;
    options[i].effects.receivable = principal;
    options[i].deferred = [{ id: `E-064-${i}:repayment`, delay: 7, phase: '结算', effects: { cash: principal, receivable: -principal }, probability: 0.6, description: `李恂按约归还 ¥${principal.toLocaleString('en-US')}，这笔借款已经结清。` }];
  }
  if (row.id === 'E-095') options[0].deferred = [{ id: 'E-095-a:feeding', delay: 0, phase: '日终', repetitions: 3, effects: { cash: -30, emotion: 3 }, description: '你给后门的猫添了食物和水。' }];
  if (row.id === 'E-081') {
    options[0].modifiers.push({ id: 'E-081-a:coffee', kind: 'formula', days: 3, value: 25, target: 'coffee-price', description: '三日内咖啡每杯 ¥25。' });
    options[1].modifiers.push({ id: 'E-081-b:tea', kind: 'formula', days: 3, value: 5, target: 'coffee-first', description: '三日内茶只提供一次体力恢复。' });
  }
  for(const o of options)for(const d of [...o.deferred,...o.failureDeferred??[]]){
    const sourceChoice=d.id.match(/E-\d{3}-[abc]/)?.[0];
    if(sourceChoice&&EVENT_DEFERRED_RESULTS[sourceChoice]&&!/exam-result|repayment|feeding|peer-absent|post-run-reimbursement/.test(d.id))d.description=EVENT_DEFERRED_RESULTS[sourceChoice];
  }
  const exclusive = row.followup.match(/互斥组[：:]\s*([^；（]+)/)?.[1] ?? row.trigger.match(/互斥组[：:]\s*([^；（]+)/)?.[1];
  return { ...row, text: eventPlayerText(row.text), options, phases: phaseFor(row), repeatable: /可重复/.test(row.followup), exclusiveGroup: exclusive,
    scopeKind: scopeFor(row), requiredQualifiers: row.trigger.split('；').filter(c => !/`[^`]+`\s*[≥≤<>=]\s*\d+/.test(c)).map(clean).filter(c => !/^(?:D|否则 D|任意日|阶段|工资日|夜班日|夜班后|非夜班|已触发|未触发|必发|关系|体力|SAN|情绪|抑郁|声望|余额|负债|现金压力|累计超支|当日累计超支|利息|互斥组|权重)/.test(c)),
    onEnter: row.id==='E-157'?{san:-5,emotion:-10,depression:3,reputation:-10}:/触发时先/.test(row.followup) ? immediateEffects(row.followup.split('；')[0]) : {} };
});
export const EVENT_BY_ID = Object.fromEntries(AUTHORED_EVENTS.map(e => [e.id, e])) as Record<string, AuthoredEvent>;
// Weekly notices concern real accumulated deductions and occur on both wage
// days. The director schedules them as obligations, not weighted lottery slots.
EVENT_BY_ID['E-159'].repeatable=true;
EVENT_BY_ID['E-160'].repeatable=true;
EVENT_BY_ID['E-159'].onEnter={emotion:-RULES.weeklyOverspend.emotion,reputation:-RULES.weeklyOverspend.reputation};
export const EVENT_SOURCES = source.sources;
export const DOCUMENTED_ENDINGS = source.endings;
export const DOCUMENTED_ROUTES = source.routes;

function has(ctx: EventContext, key: string): boolean { return Boolean(ctx.facts[key]); }
function flagAge(ctx: EventContext, key: string): number { const v = ctx.facts[key]; return typeof v === 'object' ? ctx.day - v.day + 1 : 1; }
const compare = (a: number, op: string, b: number) => op === '≥' || op === '>=' ? a >= b : op === '≤' || op === '<=' ? a <= b : op === '>' ? a > b : op === '<' ? a < b : a === b;

export function eventEligible(event: AuthoredEvent, ctx: EventContext): boolean {
  if (!event.phases.includes(ctx.phase)) return false;
  if(['E-159','E-160'].includes(event.id)&&!RULES.wageDays.includes(ctx.day as never))return false;
  if(event.id==='E-106'&&!RULES.nightDays.includes((ctx.day+3) as never))return false;
  if(event.id==='E-100'&&has(ctx,'家庭-丧亲'))return false;
  if (ctx.seen?.[event.id] !== undefined && (!event.repeatable || ctx.seen[event.id] === ctx.day)) return false;
  if (event.exclusiveGroup && AUTHORED_EVENTS.some(e => e.exclusiveGroup === event.exclusiveGroup && ctx.seen?.[e.id] !== undefined)) return false;
  if(event.id==='E-100'&&(has(ctx,'家庭-出院')||has(ctx,'家庭-放弃治疗')))return false;
  const raw = event.trigger;
  if (event.id === 'E-099' || event.id === 'E-105') {
    if (has(ctx, '家庭-高潮已发') || ctx.day < 4 || ctx.day > 10) return false;
  }
  if (event.category === 5 && +event.id.slice(2) >= 134 && +event.id.slice(2) <= 138 && has(ctx, '药代-上交')) return false;
  if (event.id === 'E-134') {
    if (!has(ctx, '药代-1餐叙') || has(ctx, '药代-上交') || Number(ctx.facts['药代-拒绝'] ?? 0) >= 2 || ctx.day < 7 || ctx.day > 10) return false;
  }
  const night = ctx.night ?? [3, 6, 9, 12, 14].includes(ctx.day);
  for (const original of raw.split('；')) {
    const c = clean(original);
    if(event.id==='E-188'&&/^D11$/.test(c)){
      if(ctx.day<(ctx.paperDeadline??RULES.butterfly.paperDeadline))return false;
      continue;
    }
    if (['E-099', 'E-105'].includes(event.id) && /^D/.test(c)) continue;
    if (event.id === 'E-134' && /D8 必发|药代-上交|药代-拒绝|否则 D7/.test(c)) continue;
    if (/^(?:阶段=|必发|互斥组|任意日)/.test(c)) continue;
    if (c === '夜班日' && !night) return false;
    if (c === '非夜班日' && night) return false;
    if (c === '夜班后一天' && ![4, 7, 10, 13].includes(ctx.day)) return false;
    if (c === '工资日' && ![7, 14].includes(ctx.day)) return false;
    const dayRange = c.match(/^D(\d+)[–-]D(\d+)/);
    if (dayRange && !(ctx.day >= +dayRange[1] && ctx.day <= +dayRange[2]) && !(['E-099', 'E-105'].includes(event.id) && ctx.day === 10)) return false;
    const daySet = c.match(/^D\d+(?:／D\d+)+/);
    if (daySet && !daySet[0].split('／').map(x => +x.slice(1)).includes(ctx.day)) return false;
    const dayExact = c.match(/^D(\d+)(?![\d–／-])/);
    if (dayExact && !dayRange && !daySet && event.id !== 'E-134' && ctx.day !== +dayExact[1]) return false;
    if (/^D≥/.test(c) && ctx.day < +c.slice(2)) return false;
    if (/时段=白天/.test(c) && ctx.phase === '夜班') return false;
    if (/时段=夜班/.test(c) && ctx.phase !== '夜班') return false;
    if (/已触发|未触发|写入/.test(c)) {
      const keys = [...original.matchAll(/`([^`]+)`/g)].map(m => m[1]);
      if (keys.length) {
        const negative = c.startsWith('未触发');
        const found = keys.map(k => has(ctx, k));
        if (negative ? found.some(Boolean) : /／|或/.test(c) ? !found.some(Boolean) : !found.every(Boolean)) return false;
        const age = c.match(/第\s*(\d+)\s*日起/);
        if (age && !keys.some(k => flagAge(ctx, k) >= +age[1])) return false;
        if (/当日或次日/.test(c) && flagAge(ctx, keys[0]) > 2) return false;
        if (/当日(?!或)/.test(c) && flagAge(ctx, keys[0]) !== 1) return false;
      }
    }
    const resourceParts = c.split('／');
    const answers: boolean[] = [];
    for (const part of resourceParts) {
      const m = part.match(/(体力|SAN|情绪|抑郁|声望|余额|负债|现金压力|当日累计超支|累计超支)\s*([≥≤<>=]+)\s*¥?([\d,]+)/);
      if (m) { const key = ({ 体力: 'stamina', SAN: 'san', 情绪: 'emotion', 抑郁: 'depression', 声望: 'reputation', 余额: 'cash', 负债: 'debt', 现金压力: 'pressure', 当日累计超支: 'overspend', 累计超支: 'overspend' } as const)[m[1] as '体力']; answers.push(compare(Number(ctx[key] ?? 0), m[2], num(m[3]))); }
      const rel = part.match(/(?:关系·)?(主任|护士长|同事|家人)(?:关系)?\s*([≥≤<>=]+)\s*(\d+)/);
      if (rel) answers.push(compare(ctx.relations?.[relations[rel[1]]] ?? 2, rel[2], +rel[3]));
      const count = original.match(/`([^`]+)`\s*([≥≤<>=]+)\s*(\d+)/);
      if (count && !/^已触发|^未触发/.test(c)) answers.push(compare(Number(ctx.facts[count[1]] ?? 0), count[2], +count[3]));
    }
    if (answers.length && !answers.some(Boolean)) return false;
    if (/利息\s*>\s*当日收入/.test(c) && !((ctx.interest ?? 0) > (ctx.income ?? 0))) return false;
  }
  return event.requiredQualifiers.every(q => ctx.qualifiers?.includes(q));
}
export function eventWeight(event: AuthoredEvent, ctx: EventContext): number {
  let w = event.weight || 1;
  if(event.id==='E-170'&&ctx.day===4)w=4;
  if (event.category === 5 && (ctx.pressure ?? 0) >= 60) w *= 2;
  if (ctx.day >= 8 && /已触发/.test(event.trigger)) w *= 1.5;
  if (event.category === 1 && (ctx.san ?? 100) < 50 && event.options.some(o => o.check?.skill === 'observe')) w *= 1.5;
  if ((ctx.reputation ?? 50) < 20 && /投诉|拍照|录音/.test(event.title + event.text)) w *= 1.5;
  if (event.category === 4 && (ctx.relations?.family ?? 2) <= 1) w *= 1.5;
  if (has(ctx, '医务科备案') && /投诉|升级/.test(event.title + event.followup)) w *= 2;
  return w;
}
export const eligibleEvents = (ctx: EventContext) => AUTHORED_EVENTS.filter(e => eventEligible(e, ctx));
export function mandatoryEvents(ctx: EventContext): AuthoredEvent[] {
  return eligibleEvents(ctx).filter(e => e.weight === 0 || /必发/.test(e.trigger) && (e.id === 'E-134' ? ctx.day === 8 : ['E-099', 'E-105'].includes(e.id) ? ctx.day === 10 : true));
}
/** Caller supplies a keyed deterministic draw; reading UI does not consume RNG. */
export function pickEvent(ctx: EventContext, draw: number): AuthoredEvent | undefined {
  const pool = eligibleEvents(ctx).filter(e => e.weight > 0);
  const total = pool.reduce((s, e) => s + eventWeight(e, ctx), 0);
  let point = Math.max(0, Math.min(0.999999999, draw)) * total;
  return pool.find(e => (point -= eventWeight(e, ctx)) < 0);
}
const EVENT_SPEAKERS:Record<string,string[]>={
  chief:['E-041','E-049','E-050','E-051','E-052','E-053','E-062','E-063','E-066','E-096','E-145','E-149','E-159','E-160','E-161','E-162','E-168','E-170','E-174','E-179','E-180','E-187','E-189','E-192'],
  nurse:['E-039','E-046','E-047','E-048','E-055','E-056','E-059','E-060','E-065','E-087','E-164','E-197','E-198','E-200','E-201','E-202','E-203','E-204','E-206','E-211'],
  peer:['E-040','E-042','E-043','E-054','E-057','E-061','E-064','E-067','E-069','E-072','E-078','E-084','E-086','E-089','E-143','E-144','E-177','E-210'],
  father:['E-114','E-118','E-128','E-205'],
  research:['E-183','E-184','E-186','E-188','E-190','E-191','E-193'],
};
/** Casting is separate from evidence identity: binding.actorId remains the exact source person. */
export function eventRuntimeActor(event:AuthoredEvent,binding:EventBinding):string|undefined{
  for(const [actor,ids]of Object.entries(EVENT_SPEAKERS))if(ids.includes(event.id))return actor;
  if(event.category===1)return undefined;
  if(event.category===4)return 'mother';
  if(event.category===5&&['E-131','E-132','E-133','E-134','E-135','E-136','E-137','E-138','E-146','E-148','E-151'].includes(event.id))return 'rep';
  if(event.category===3||event.category===6||event.category===7)return undefined;
  return ({jiang:'nurse',li:'peer',tang:'chief',zhou:'research',ye:'rep',mother:'mother',father:'father'}as Record<string,string>)[binding.actorId??''];
}
export function eventToCard(event: AuthoredEvent, binding: EventBinding, context?: EventContext): EventCard {
  if (event.scopeKind === 'patient' && (!binding.patientId || binding.scope.kind !== 'patient' || binding.scope.id !== binding.patientId)) throw new Error(`${event.id} requires one bound patient instance`);
  if (event.scopeKind === 'project' && binding.scope.kind !== 'project') throw new Error(`${event.id} requires a project scope`);
  const sourceBeds = [...event.text.matchAll(/(?:床\s*(\d+)|(\d+)\s*床)/g)].map(m => +(m[1] ?? m[2]));
  const uniqueBeds = [...new Set(sourceBeds)];
  const boundBed=binding.bed;
  const substitute = (text: string) => boundBed !== undefined ? text.replace(/(?:床\s*(\d+)|(\d+)\s*床)/g, (_, before: string, after: string) => {
    const i = uniqueBeds.indexOf(+(before ?? after));
    const chosen = binding.patients?.[i];
    const bed=chosen?.bed ?? (i <= 0 ? boundBed : +(before ?? after));
    return bed>0?`${bed} 床`:`${chosen?.name??binding.patientName??'患者'}所在诊位`;
  }) : text;
  // E-209's third source row describes an ending condition, not a player action.
  const options = context ? contextualOptions(event, context) : event.id==='E-209'?event.options.slice(0,2):event.options;
  const playerLabel=(option:EventOption)=>option.label!==(EVENT_BY_ID[event.id]??event).options.find(o=>o.id===option.id)?.label
    ?option.label:eventOptionLabel(event.id,option.id,option.label);
  const projectedEffects=(effects:Effects):Effects=>({...structuredClone(effects),...(effects.hazards?{hazards:effects.hazards.map(h=>({...h,reason:substitute(h.reason),norm:substitute(h.norm)}))}:{})});
  return { id: binding.instanceId, authoredEventId: event.id, eventBinding: binding, title: event.title,
    text: substitute(event.id==='E-100'&&context?.facts['family-icu-daily-fee']?`重症监护病房发来费用短信：按已经确认的项目，今日需要补交 ¥${Number(context.facts['family-icu-daily-fee']).toLocaleString('en-US')}。`:event.id==='E-171'&&typeof context?.facts['patient-budget-excess']==='number'?`${binding.patientName??'这位患者'}的费用已经超预算 ¥${Number(context.facts['patient-budget-excess']).toLocaleString('en-US')}，按当前方案仍需继续住院。已经结清的差额不会再次扣款。`:EVENT_DIALOGUE[event.id]?.text??event.text), kind: binding.phase === '夜班' ? 'night' : binding.phase === '日终' ? 'rest' : 'story',
    actor: eventRuntimeActor(event,binding),
    scope: binding.scope, patientId: binding.patientId, chain: `event-${event.category}`, onEnter: structuredClone(event.onEnter),
    options: options.map(o => ({ ...structuredClone(o), id: `${binding.instanceId}:${o.id}`, label:substitute(playerLabel(o)),result: substitute(o.result),hint:o.hint?substitute(o.hint):undefined,
      check:o.check?{...structuredClone(o.check),failure:projectedEffects(o.check.failure),purpose:o.check.purpose?substitute(o.check.purpose):undefined,failureHint:o.check.failureHint?substitute(o.check.failureHint):undefined,failureText:substitute(o.check.failureText)}:undefined,
      failureTotal:o.failureTotal?projectedEffects(o.failureTotal):undefined,
      deferred:o.deferred.map(d=>({...structuredClone(d),description:substitute(d.description)})),
      failureDeferred:o.failureDeferred?.map(d=>({...structuredClone(d),description:substitute(d.description)})),
      effects: { ...projectedEffects(o.effects), flags: [...(o.effects.flags ?? []), `event-seen:${event.id}`] },
    })) };
}

/** Expand explicit “each of these patients” risks; no unrelated random bed is selected. */
export function eventRiskTargets(event: AuthoredEvent, option: EventOption, binding: EventBinding): { scope: EventBinding['scope']; hazards: NonNullable<Effects['hazards']> }[] {
  const hazards = option.effects.hazards ?? [];
  if (!hazards.length) return [];
  const text = option.consequence;
  const number = /三床各计|三位病人各计|当日三床各计|该三床各计/.test(text) ? 3 : /两床各计/.test(text) ? 2 : 1;
  if (number === 1) return [{ scope: binding.scope, hazards }];
  if (event.scopeKind === 'project') return [{ scope: binding.scope, hazards: hazards.map(h => ({ ...h, weight: h.weight * number })) }];
  if (!binding.patients || binding.patients.length < number) throw new Error(`${event.id} requires ${number} actual affected patient instances`);
  return binding.patients.slice(0, number).map(p => ({ scope: { kind: 'patient', id: p.id }, hazards: structuredClone(hazards) }));
}

/** Resolve resource/fact-dependent alternatives before the choice is offered. */
export function contextualOptions(event: AuthoredEvent, context: EventContext): EventOption[] {
  if(event.id==='E-209')return event.options.slice(0,2);
  if(event.id==='E-100'){
    const options=structuredClone(event.options),fee=Number(context.facts['family-icu-daily-fee']??(has(context,'家庭-降级')?2000:8000));
    options[0].effects.cash=-fee;options[0].label=`转 ¥${fee.toLocaleString('en-US')}，补交今天的住院预交金`;options[0].consequence=`余额 −¥${fee.toLocaleString('en-US')}；现金压力 +5`;options[0].hint=options[0].consequence;return options;
  }
  const original = source.events.find(e => e.id === event.id)!;
  const row = structuredClone(original);
  const familySupports = (context.relations?.family ?? 2) >= 3;
  const bait = Object.keys(context.facts).some(k => k.startsWith('科研-诱惑-') && has(context, k));
  const badPaper = has(context, '科研-造假');
  if (event.id === 'E-097') row.options[2].consequence = familySupports ? '情绪 +3' : '情绪 −3';
  if (event.id === 'E-098') row.options[2].consequence = familySupports ? '情绪 +3；鉴定庭抗压检定 +1' : '情绪 −3';
  if(event.id==='E-204')row.options[2].consequence=familySupports?'情绪恢复到 50；抑郁 −5':'情绪恢复到 40；家人关系 −1';
  if (event.id === 'E-179') row.options[1].consequence = has(context, '飞检-追回') ? '余额 −¥4,000' : '同年住院医关系 −2';
  if (event.id === 'E-182') row.options[2].consequence = has(context, '药代-科室账') ? 'F+8' : '主任关系 −1';
  if (event.id === 'E-186') row.options[2].consequence = bait ? '体力 −5；SAN −8' : '体力 −5';
  if (event.id === 'E-187') row.options[0].consequence = bait ? 'SAN −5；情绪 −8' : 'SAN −5';
  if (event.id === 'E-188') row.options[0].consequence = has(context, '科研-诱惑-美化') || has(context, '科研-诱惑-代写') ? 'SAN −10；声望 +5；主任关系 +1；写入 `科研-造假`' : '体力 −10；写入 `科研-诚实`';
  if (event.id === 'E-190') row.options[0].consequence = badPaper ? `体力 −5；写入 \`科研-答辩\`；检定：抗压 DC ${has(context,'科研-主任课题')?15:14}；失败：写入 \`科研-通报\`` : '体力 −5；声望 +5；写入 `科研-答辩`';
  if (event.id === 'E-100' && has(context, '家庭-降级')) row.options[0].consequence = '余额 −¥2,000；现金压力 +5';
  if (row.options.every((o,i) => o.consequence === original.options[i].consequence)) return event.options;
  const compiled = optionsFor(row);
  if(event.id==='E-098')for(const o of compiled)for(const m of o.modifiers)if(m.kind==='skill'){m.kind='formula';m.target=`court-preparation:${m.target}`;}
  return compiled.map((o, i) => ({ ...o,
    ...(event.id==='E-182'&&i===2?{result:has(context,'药代-科室账')?'主任让你把收款信息发给他：“走科室那个账户。”这笔版面费不用你个人付，会记在科室账户的支出里。':'主任合上账本：“自己的文章，版面费自己想办法。”这笔钱没报成。'}:{}),
    effects: { ...o.effects, flags: [...new Set([...(o.effects.flags ?? []), ...(event.options[i].effects.flags ?? []).filter(f => !f.startsWith('科研-诚实') && !f.startsWith('科研-造假') && !f.startsWith('科研-通报'))])] } }));
}

export { compileClauses, immediateEffects, sum as mergeEventEffects };
/** Apply this total once; do not apply check.failure again afterwards. */
export function authoredChoiceEffects(option:EventOption,success:boolean):Effects{
  const effects=structuredClone(!success&&option.check?option.failureTotal??sum(option.effects,option.check.failure):option.effects);
  if(effects.flags&&effects.clear)effects.flags=effects.flags.filter(f=>!effects.clear!.includes(f));
  return effects;
}
