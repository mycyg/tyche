import type {Card,Effects,Option,Patient,Run} from './types';
import {fullGraph,visibleClinicalReports} from './clinical';
import {unrevealedGraphClues,revealGraphClue,unrevealedGraphScent} from '../content/clinical/clues';
import {PRESET_BY_ID} from '../content/patients';
import {PRESET_CHART_CLUES} from '../content/patients/chart-clues';
import {unrevealedPresetScent} from '../content/patients/scent';
import {runRandom} from './run-random';
import {talentContext} from './traits';
import * as talent from './talents';
import {RULES} from './rules';
import {isPlayerResponsibleForPatient}from '../content/events/clinical-ownership';

const marker=(p:Patient,id:string)=>`ability:${p.uid}:${id}`;
const context=(r:Run)=>talentContext(r);
export function clinicalClues(p:Patient,r?:Run):talent.IntuitionClue[] {
  const graph=fullGraph(p.caseId);
  if(graph&&p.clinical)return unrevealedGraphClues(graph,p.clinical);
  const text=p.preset&&PRESET_CHART_CLUES[p.caseId],prefix=`preset:${p.caseId}:${p.uid}`;
  if(!text||r?.facts[`${prefix}:revealed`]||r?.facts[`${prefix}:chart-history`])return [];
  return [{id:`${p.caseId}:chart-history`,text,direction:'history'}];
}
const atFirstNode=(p:Patient)=>p.clinical?.entered.length===1||!!p.preset&&p.presetNode===p.preset.steps[0]?.id;
/** A preset's admission prose is already presented to the player. Re-reading
 * it does not unlock hidden diagnostics. Later reports must originate in this
 * patient's committed journal, never an unselected option's result. */
export function abilityReports(r:Run,p:Patient):{id:string;title:string;full:string}[] {
  if(p.clinical)return visibleClinicalReports(r,p);
  if(!p.preset)return [];
  const reports=[{id:`${p.uid}:admission`,title:'接诊时已有资料',full:[p.preset.complaint,...p.preset.history].join('\n')}];
  for(const entry of r.journal)if(entry.scope.kind==='patient'&&entry.scope.id===p.uid&&entry.flags.includes(`preset:${p.caseId}:${p.uid}:revealed`))
    reports.push({id:entry.id,title:entry.title,full:entry.result});
  return reports;
}
function normFor(p:Patient) {
  const graph=fullGraph(p.caseId),preset=PRESET_BY_ID.get(p.caseId);
  return graph?.nodes.flatMap(n=>n.options.flatMap(o=>[...(o.effects.hazards??[]),...o.rules.flatMap(rule=>rule.effects.hazards??[])])).find(h=>h.type==='R')?.norm
    ??preset?.hazards.find(h=>h.type==='R')?.norm
    ??preset?.hazards.find(h=>h.norm)?.norm;
}
export interface AbilityResult {
  hook:talent.TalentHookResult;
  text:string;
  patientPatch?:Partial<Patient>;
  stopLocalCare?:boolean;
  leaveTomorrow?:boolean;
}
const emptyHook=(r:Run):talent.TalentHookResult=>({memory:talent.talentMemory(context(r)),effects:{},addDebuffs:[],removeDebuffs:[],pressureDelta:0,notices:[]});

/** First contact only reveals a sensory observation that actually exists in the
 * authored case. An intuition warning never reveals a laboratory result. */
export function firstContact(r:Run,p:Patient):AbilityResult[] {
  const graph=fullGraph(p.caseId),clue=clinicalClues(p,r)[0];
  const preset=PRESET_BY_ID.get(p.caseId);
  const hintClue=clue??(preset?.hasHidden?{id:`${p.caseId}:hidden`,text:'',direction:'history' as const}:undefined);
  const intuition=talent.firstTalentContact(context(r),p.uid,hintClue,runRandom(r,`intuition:${p.uid}`));
  const result:AbilityResult[]=[{hook:intuition,text:intuition.hint??''}];
  if(intuition.hint)intuition.effects.flags=[`lamp-flash:${p.uid}:${p.clinical?.nodeId??p.presetNode??'entry'}`];
  const scent=graph&&p.clinical?unrevealedGraphScent(graph,p.clinical):undefined;
  if(scent) {
    const smell=talent.talentSmell({...context(r),memory:intuition.memory},p.uid,scent);
    if(smell.clue)result.push({hook:smell,text:smell.clue,patientPatch:{clinical:{...p.clinical!,flags:[...new Set([...p.clinical!.flags,...scent.revealFlags])]}}});
  }
  const presetScent=unrevealedPresetScent(r,p);
  if(presetScent) {
    const smell=talent.talentSmell({...context(r),memory:intuition.memory},p.uid,presetScent);
    if(smell.clue) {
      smell.effects.flags=presetScent.flags;
      result.push({hook:smell,text:smell.clue,patientPatch:{preset:{...p.preset!,findings:[...p.preset!.findings,smell.clue]}}});
    }
  }
  return result;
}

export function abilityOptions(r:Run,card:Card):Option[] {
  if(r.emergency||'patientGate'in card)return [];
  const p=r.patients.find(p=>p.uid===card.patientId),s=context(r),m=talent.talentMemory(s),options:Option[]=[];
  const add=(id:NonNullable<Option['talentAction']>,label:string,ap=0,minutes=0,effects:Effects={},check?:Option['check'],target=p?.uid??card.id,key='')=>{
    const option:Option={id:`${card.id}:ability:${id}${key?`:${key}`:''}`,talentAction:id,interaction:'ability',label,ap,minutes,cost:0,effects,result:'',check,talentTarget:target,mechanics:{operation:'other',quality:'neutral'}};
    if(!r.committed.includes(option.id))options.push(option);
    return option;
  };
  if(p?.active&&p.damage<3&&isPlayerResponsibleForPatient(r,p)) {
    const clues=clinicalClues(p,r);
    if(r.talents.includes('T02')&&p.inpatient&&['交班','查房'].includes(r.shiftPhase??'')&&clues.some(c=>!m.chartClues[p.uid]?.includes(c.id)))
      add('chart-review','翻阅旧病历，核对一条尚未发现的线索',2);
    if(r.talents.includes('T05')&&atFirstNode(p)&&m.fullReviewsUsed<5&&!m.reviewedPatients.includes(p.uid)&&abilityReports(r,p).length)
      add('full-review','再看一眼已经取得的完整回报',0,10,{stamina:-3});
    if(r.difficulty!=='attending'&&r.talents.includes('T10')&&!m.quotedPatients.includes(p.uid)&&normFor(p))
      add('norm-quote','翻看与这次处置有关的规范');
    if(r.talents.includes('T27')&&!m.transferredPatients.includes(p.uid)) {
      const o=add('transfer','说明转诊理由，请家属同意转上级医院',RULES.ward.transferAp,RULES.ward.transferMinutes,{},
        {skill:'comfort',dc:RULES.abilities.transferDc,purpose:'家属是否接受转诊安排',failureHint:'家属拒绝转诊，本院处置仍需继续。',failure:{patience:-5},failureText:'家属没有接受转诊建议。患者仍由你负责，需要继续原处置。'});
      o.mechanics={operation:'comfort',checkOperation:'comfort',actor:'family',quality:'neutral'};
    }
    if(r.talents.includes('T30')&&(p.damage>0||r.hazards.some(h=>h.scope.id===p.uid&&h.causal))&&!r.facts[marker(p,`conceal:${card.id}`)])
      add('conceal','告诉家属暂时没有新情况，隐去坏消息',0,0,{hazards:[{type:'C',weight:15,reason:'报平安：隐瞒患者坏消息',norm:'如实告知患者及合法受托人',causal:false}]});
  }
  // A discharged patient's overdue chart remains accessible from a rest desk.
  // Completing one record does not erase its original late-documentation risk.
  for(const due of talent.talentDueRecords(s))if(due.patientId===p?.uid||card.kind==='rest'&&!card.patientId) {
    const owner=r.patients.find(patient=>patient.uid===due.patientId);
    if(owner)add('late-record',`补记${owner.name}第${due.dueDay-1}天的病程记录`,1,5,{},undefined,due.recordId,due.recordId);
  }
  if(r.talents.includes('T25')&&(['family','father','mother'].includes(card.actor??'')||card.chain==='event-4')&&!m.processed.includes(`relative-loan:${card.id}`))
    add('relative-loan','向亲戚借一万元，记下归还约定',0,0,{cash:10000,privateDebt:10000,relations:{family:-1}});
  if(card.kind==='rest'&&!card.patientId) {
    if(!r.facts[`counselling:${r.day}`])add('counselling','去临床心理科就诊',2,0,{cash:-300,san:15,depression:-10,reputation:-5,relations:{chief:-1}});
    if(r.debuffs.includes('B03')&&!m.permanentStomach&&!r.facts[`gastroscopy:${r.day}`])add('gastroscopy','完成自身健康评估与胃镜检查',2,0,{cash:-600});
    if(r.debuffs.includes('B09'))add('family-clear','给家里打电话，把自己的情况说清楚',0,0,{},
      {skill:'comfort',dc:14,purpose:'家人能否接受你对婚事的安排',failure:{emotion:-5},failureHint:'家人尚未接受你的安排，催婚压力仍在。',failureText:'电话没有谈拢。家人仍在追问，你先结束了通话。'});
    if(r.debuffs.includes('B10'))add('leave-group','退出科室群，保留值班联络电话',0,0,{relations:{chief:-1}});
    if(r.day<14&&!r.skipNextDay&&!r.facts[`leave-request:${r.day}`])add('day-off','向科室申请明天停诊休息一天',0,0,{depression:-5});
  }
  return options;
}

export function resolveAbility(r:Run,card:Card,o:Option,success:boolean):AbilityResult {
  const p=r.patients.find(p=>p.uid===card.patientId),s=context(r),base=emptyHook(r);
  switch(o.talentAction) {
    case 'chart-review': {
      if(!p)throw new Error('Chart review requires patient');
      const graph=fullGraph(p.caseId),hook=talent.talentChartReview(s,p.uid,clinicalClues(p,r));
      delete hook.effects.ap;
      const clue=hook.clue;
      if(p.preset&&clue)hook.effects.flags=[`preset:${p.caseId}:${p.uid}:chart-history`,`preset:${p.caseId}:${p.uid}:history-full`];
      return {hook,text:clue?.text??'现有病历已经核对，没有发现新的线索。',patientPatch:graph&&p.clinical&&clue?{clinical:revealGraphClue(graph,p.clinical,clue.id)}:p.preset&&clue?{preset:{...p.preset,history:[...p.preset.history,clue.text]}}:undefined};
    }
    case 'full-review': {
      if(!p)throw new Error('Full review requires patient');
      const reports=abilityReports(r,p),hook=talent.talentFullReview(s,p.uid,atFirstNode(p),reports.length>0);
      return {hook,text:reports.map(report=>`${report.title}\n${report.full}`).join('\n\n')};
    }
    case 'norm-quote': {
      if(!p)throw new Error('Norm quote requires patient');
      const hook=talent.talentNormQuote(s,p.uid,normFor(p));return {hook,text:hook.quote??'本次记录中没有额外的规范条目。'};
    }
    case 'relative-loan':return {hook:talent.talentRelativeLoan(s,card.id),text:'亲戚把一万元转来。金额和归还约定留在聊天记录中，这笔钱计入私人借款，不算收入。'};
    case 'transfer': {
      if(!p)throw new Error('Transfer requires patient');
      const hook=talent.talentTransfer(s,p.uid,success);
      if(success)hook.effects.flags=[...(hook.effects.flags??[]),`defensive-transfer:${p.uid}`];
      else hook.effects={patience:-5};
      return {hook,stopLocalCare:hook.transferred,text:success?'家属接受了转诊安排，接收团队已确认。原记录和未排除风险一起交接；本院停止后续床旁处置，既往行为仍保留在记录里。':'家属没有接受转诊建议。患者仍由你负责，需要继续原处置。'};
    }
    case 'conceal': {
      if(!p)throw new Error('Concealment requires patient');
      const hook=talent.talentConceal(s,p.uid,o.id);hook.effects.flags=[marker(p,`conceal:${card.id}`),`complaint-suppressed:${p.uid}`];
      return {hook,text:'家属暂时没有继续追问。未告知的坏消息仍然存在，这次说法也留在了后续沟通的记录中。'};
    }
    case 'counselling': {
      const hook=talent.talentRecover(s,'counselling');hook.effects={...o.effects,flags:[`counselling:${r.day}`]};return {hook,text:'你完成了这次就诊，并与科室核对后续工作安排。失眠和幻听的持续影响解除。'};
    }
    case 'gastroscopy': {
      const hook=talent.talentRecover(s,'gastroscopy');delete hook.effects.ap;hook.effects.flags=[`gastroscopy:${r.day}`,'self-health-exam'];return {hook,text:'你完成了检查和评估，医生把后续治疗和休息安排写进就诊记录。胃痛不再持续影响你的工作。'};
    }
    case 'family-clear':return {hook:success?talent.talentRecover(s,'family-clear'):{...base,effects:{emotion:-5}},text:success?'你把工作、婚事和能承担的安排分别说清楚。家人答应不再每天追问。':o.check!.failureText};
    case 'leave-group':return {hook:talent.talentRecover(s,'leave-group'),text:'你退出了群聊。值班联络方式仍然有效，主任另发来一句：上班时到办公室说一下。'};
    case 'day-off':return {hook:{...base,effects:{depression:-5,flags:[`leave-request:${r.day}`]}},leaveTomorrow:true,text:'科室确认了次日停诊与交接安排。明天不能接诊、预支或加班，患者由同事接手。'};
    case 'late-record':return {hook:{...base,memory:talent.talentCompleteDelayedRecord(s,o.talentTarget??'')},text:'你补齐了记录，分别注明事情发生的时间和补记时间。这次迟记仍有记录。'};
    default:throw new Error('Unknown talent action');
  }
}
