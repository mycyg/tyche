import type {Card,Option,Run} from './types';
import {presetArchiveChecks} from '../content/patients/archive-links';
import {CASE_PRESETS} from '../content/patients';
import {clinicalGraphs} from '../content/clinical';

const sourceTraps=new Map<string,Set<string>>();
function sourceTrapIds(caseId:string):Set<string> {
  if(sourceTraps.has(caseId))return sourceTraps.get(caseId)!;
  const keys=new Set<string>();
  const graph=clinicalGraphs.find(g=>g.id===caseId);
  if(graph)for(const o of graph.nodes.flatMap(n=>n.options))
    if(o.effects.hazards?.length||o.check?.failure.hazards?.length||o.rules.some(rule=>rule.effects.hazards?.length))keys.add(`${caseId}:${o.id}`);
  const preset=CASE_PRESETS.find(p=>p.id===caseId);
  if(preset)for(const o of preset.scenes.flatMap(n=>n.options))
    if(o.effects.hazards?.length||o.check?.failure.hazards?.length)keys.add(`${caseId}:${o.id.slice(`preset:${caseId}:`.length)}`);
  sourceTraps.set(caseId,keys);return keys;
}
export function validArchiveTrap(raw:string,canonicalOnly=false):boolean {
  const caseId=raw.match(/^(C-?\d{3}):/)?.[1];if(!caseId)return false;
  const canonical=canonicalTrapId(caseId,raw);
  return !!canonical&&(!canonicalOnly||raw===canonical)&&sourceTrapIds(caseId).has(canonical);
}

/** Both current stable IDs and old seed records containing an encounter UID are
 * accepted. IDs from another case cannot match by a shared option suffix. */
export function canonicalTrapId(caseId:string,raw:string):string|undefined {
  const embedded=raw.match(/(?:^|:)(C-?\d{3})(?=:|$)/)?.[1];
  if(embedded&&embedded!==caseId)return;
  if(/^C-\d{3}$/.test(caseId)) {
    const match=raw.match(/(?:^|:)((?:entry|investigate|decision|rescue|communication|handoff|echo):[a-z0-9-]+(?::private)?)$/);
    return match?`${caseId}:${match[1]}`:undefined;
  }
  if(/^C\d{3}$/.test(caseId)) {
    const match=raw.match(/(?:^|:)(s\d+[a-z]?_[a-z0-9_]+)(?::\d+)?$/);
    return match?`${caseId}:${match[1]}`:undefined;
  }
}
export function archivedTrapIds(r:Pick<Run,'archiveTraps'|'priorSeeds'>):Set<string> {
  const values=(r.archiveTraps??[]).flatMap(raw=>{
    const caseId=raw.match(/^(C-?\d{3}):/)?.[1];return caseId?[canonicalTrapId(caseId,raw)]:[];
  });
  for(const old of r.priorSeeds??[])values.push(canonicalTrapId(old.caseId,old.trapId));
  return new Set(values.filter((id):id is string=>!!id));
}
export function hasTribunalReadout(r:Pick<Run,'day'|'phase'|'ending'|'tribunalResponse'>):boolean {
  return r.day>=15&&r.phase==='ending'&&!!r.ending&&!!r.tribunalResponse;
}
/** Rewards use all authored source risks read at the tribunal, not just seeds.
 * Unmapped external-event / entity-specific risks are returned for auditing;
 * never misfile them under an unrelated patient trap. */
export function collectTrapArchive(r:Run):{keys:string[];unmappedHazardIds:string[]} {
  if(!hasTribunalReadout(r))return {keys:[],unmappedHazardIds:[]};
  const keys=new Set<string>(),unmappedHazardIds:string[]=[];
  for(const h of r.hazards) {
    if(h.scope.kind!=='patient')continue;
    const patient=r.patients.find(p=>p.uid===h.scope.id),key=patient&&canonicalTrapId(patient.caseId,h.choiceId);
    if(key&&validArchiveTrap(key,true))keys.add(key);else unmappedHazardIds.push(h.id);
  }
  return {keys:[...keys],unmappedHazardIds};
}
export function matchingArchivedTraps(r:Pick<Run,'archiveTraps'|'priorSeeds'>,card?:Card,option?:Option):string[] {
  if(!card?.caseId||!option)return [];
  const {caseId}=card,known=archivedTrapIds(r);
  const candidates:string[]=[];
  if(option.clinicalChoice)candidates.push(`${caseId}:${option.clinicalChoice}`);
  else if(caseId.startsWith('C-')) {
    const local=option.id.match(/:(entry|investigate|decision|rescue|communication|handoff|echo):(.+)$/);
    if(local){
      const id=`${local[1]}:${local[2]}`;
      const direct=canonicalTrapId(caseId,id);if(direct)candidates.push(direct);
      if(option.check&&!option.chanceCheck)candidates.push(...presetArchiveChecks(caseId,id));
    }
  }
  return [...new Set(candidates.filter(id=>known.has(id)))];
}
export function archiveCheckMatched(r:Pick<Run,'archiveTraps'|'priorSeeds'>,card?:Card,option?:Option):boolean {
  return !!option?.check&&!option.chanceCheck&&matchingArchivedTraps(r,card,option).length>0;
}
function sourceTrapLabel(trapId:string):string|undefined {
  const separator=trapId.indexOf(':'),caseId=trapId.slice(0,separator),local=trapId.slice(separator+1);
  if(caseId.startsWith('C-'))return CASE_PRESETS.find(p=>p.id===caseId)?.scenes.flatMap(n=>n.options).find(o=>o.id===`preset:${caseId}:${local}`)?.label;
  return clinicalGraphs.find(g=>g.id===caseId)?.nodes.flatMap(n=>n.options).find(o=>o.id===local)?.label;
}
/** Caller displays the notice then stores flag on the Run; no preview mutates
 * state. A single source trap can prompt once per encounter, not once per node. */
export function archiveNotices(r:Run,card:Card):{flag:string;trapId:string;text:string}[] {
  if(!card.patientId)return [];
  return [...new Set(card.options.flatMap(o=>matchingArchivedTraps(r,card,o)))].flatMap(trapId=>{
    const flag=`archive-notice:${card.patientId}:${trapId}`;
    if(r.facts[flag])return [];
    const label=sourceTrapLabel(trapId);if(!label)return [];
    const hasCheck=card.options.some(o=>!!o.check&&!o.chanceCheck&&matchingArchivedTraps(r,card,o).includes(trapId));
    const bonus=r.talents.includes('T04')?3:2;
    return [{flag,trapId,text:`踩坑档案：你以前复盘过「${label}」中的风险。${hasCheck?`这次识别相关风险时，检定加 ${bonus} 点。`:'这项处置仍由你直接决定，不掷临床骰子。'}仍须实际核对资料、完成检查与处置。`}];
  });
}
