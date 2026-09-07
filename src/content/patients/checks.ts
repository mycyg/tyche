import type { Option, Scene } from '../../game/types';
import type { PresetSource } from './types';
import { probeEvidence } from './probe-copy';

export interface PresetProbe { method: 'history' | 'observe' | 'comfort'; dc: number; topic: string; source: string; privateRequired: boolean; retry: boolean }
export function presetProbes(source: PresetSource): PresetProbe[] {
  return [...source.hidden.matchAll(/\bDC\s*(\d+)/g)].map(match => {
    const before = source.hidden.slice(0, match.index).split(/[。；／]/).at(-1) ?? '';
    const after = source.hidden.slice(match.index! + match[0].length);
    const note = after.match(/^\s*[（(]([^）)]*)/)?.[1] ?? '';
    const method = /安抚/.test(before) || /失败后再解释/.test(before) ? 'comfort' : before.lastIndexOf('察觉') > before.lastIndexOf('问诊') ? 'observe' : 'history';
    const topics: [RegExp, string][] = method === 'history'
      ? [[/药|处方|小白片/, '药物名称与实际服用'], [/家族|家里有人/, '家族病史'], [/饮食|进食/, '近期饮食与进食行为'], [/跌|摔/, '近期跌倒与受伤'], [/饮酒/, '饮酒经过'], [/家属在场/, '患者尚未说全的病史']]
      : [[/眼底|视乳头/, '眼底表现'], [/颈静脉|奔马律|水肿/, '心肺及循环体征'], [/心电图/, '心电图细节'], [/药盒|医嘱|病历/, '原始用药与病历记录'], [/下肢|小腿/, '双下肢体征'], [/淋巴结/, '淋巴结查体'], [/气味|酒气/, '气味线索'], [/颈前|瘢痕/, '既往手术体征']];
    const clean = before.replace(/問诊/g, '问诊').replace(/^揭示[：:]?/, '').replace(/(?:问诊|察觉)\s*$/, '').replace(/.*(?:选项后|离开后|不选则|选项.*或)\s*$/, '').replace(/^单独(?:问|询问)/, '').trim();
    const topic = method === 'comfort' ? '患者对处置的顾虑与拒绝理由' : topics.find(([pattern]) => pattern.test(note))?.[1] ?? (clean || (method === 'history' ? '病程与既往史' : '本次针对性体征'));
    return { method, dc: Number(match[1]), topic, source: `${before}${match[0]}${note ? `（${note}）` : ''}`, privateRequired: /回避|离开|单独/.test(before), retry: /失败后/.test(before) };
  });
}

/** Optional sourced enquiries complement paid objective checks. Failed enquiry
 * never yields the hidden finding, and still leads to a paid recheck/consult. */
export function addPresetProbes(scenes: Scene[], source: PresetSource, _finding: string, prefix: string) {
  const scene = scenes.find(scene => scene.id === `${prefix}:investigate`)!;
  const probes = presetProbes(source);
  probes.forEach((probe, index) => {
    const id = `${prefix}:investigate:source-probe-${index + 1}${probe.privateRequired ? ':private' : ''}`;
    const result = probeEvidence(source, index, probe.method);
    const option: Option = { id, label: `${probe.privateRequired ? '请陪同者暂时回避，' : ''}${probe.method === 'comfort' ? '解释并确认' : probe.method === 'history' ? '补问' : '重新观察'}：${probe.topic}`,
      ap: probe.privateRequired ? 1 : 0, minutes: 4, cost: 0, result, mechanics: { operation: probe.method, actor: 'patient', quality: 'correct' },
      effects: { stamina: -2, flags: [`${prefix}:key-fact-known`, `${prefix}:probe-${index + 1}-passed`] }, next: `${prefix}:decision`,
      check: { skill: probe.method === 'history' ? 'clinical' : probe.method === 'comfort' ? 'comfort' : 'observe', dc: probe.dc,
        purpose: `核实${probe.topic}`, failureHint: '这项信息仍未核实；可以追加客观核对或请专科协助。',
        failure: { stamina: -2, flags: [`${prefix}:probe-${index + 1}-failed`] },
        failureText: '你这次没有取得可靠信息，已在记录中注明还需核实。患者尚未接受下一步处置，你可以追加检查或请专科共同评估。' } };
    if (source.id === 'C-135' && index === 0) {
      option.label = '电话联系母亲，核对下午的尿布情况';
      option.mechanics = { operation: 'history', actor: 'family', quality: 'correct' };
      option.check!.purpose = '母亲能否说明下午的排便情况';
    }
    if (source.id === 'C-144' && index === 0) option.label = '问陪同者：咳嗽开始的那一刻，孩子在做什么';
    if(['C-001','C-142'].includes(source.id)&&index===1)option.when={none:[`${prefix}:probe-2-passed`,`${prefix}:scent-known`]};
    if(source.id==='C-158')option.when={none:[`${prefix}:full-exam-done`]};
    // Repeated source checks can address different aspects at equal difficulty.
    if (scene.options.some(o => o.label === option.label)) option.label += `（补充核对 ${index + 1}）`;
    if (source.id === 'C-013' && index === 1) {
      option.when = { all: [`${prefix}:revealed`], none: [`${prefix}:probe-${index + 1}-passed`, `${prefix}:probe-${index + 1}-failed`] };
      scenes.find(scene => scene.id === `${prefix}:decision`)!.options.push(option);
    } else if (probe.retry) {
      option.when = { all: [`${prefix}:probe-${index}-failed`], none: [`${prefix}:probe-${index + 1}-failed`, `${prefix}:probe-${index + 1}-passed`] };
      scenes.find(scene => scene.id === `${prefix}:decision`)!.options.push(option);
    } else scene.options.push(option);
    if (probe.method === 'history' && !probe.privateRequired) scene.options.push({ ...structuredClone(option), id: `${id}:private`, ap: 1,
      label: `请陪同者暂时回避，${option.label}`, minutes: 7,
      result: `患者有了单独说明的机会。${result}` });
  });
  return scenes;
}
