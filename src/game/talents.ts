import { DEBUFF_DEFINITIONS, TALENT_DEFINITIONS, TALENT_SELECTION } from '../content/talents';
import type { Effects, Hazard, HazardInput, Relation, Skill, Vital } from './types';
import { RULES } from './rules';

/** Design 02's runtime contract. These hooks accept facts, never infer intent from
 * a translated option label, and never mutate the run or historical hazard log. */
export type TalentOperation = 'history' | 'observe' | 'exam' | 'full-exam' | 'comfort' | 'persuade' | 'record' | 'rescue-record' | 'initial-record' | 'progress-record' | 'consent' | 'refusal-signature' | 'consult' | 'consult-wait' | 'endure' | 'day-end' | 'treatment' | 'other';
export type TalentActor = 'patient' | 'family' | 'chief' | 'nurse' | 'peer' | 'other';
export interface TalentMemory {
  day: number;
  rerollsUsed: number;
  firstContacts: string[];
  intuitionReady: string[];
  reviewedPatients: string[];
  fullReviewsUsed: number;
  smelledPatients: string[];
  chartClues: Record<string, string[]>;
  quotedPatients: string[];
  survivalUsed: boolean;
  gainedDay: Record<string, number>;
  permanentStomach: boolean;
  emotionalNights: number;
  saneNights: number;
  fullSleepNights: number;
  coffeeFreeDays: number;
  proactiveConsults: number;
  correctCare: number;
  transferredPatients: string[];
  concealedPatients: Record<string, number>;
  beautifiedProjects: string[];
  chiefKnowsProjects: string[];
  delayedRecords: {patientId: string; recordId: string; dueDay: number}[];
  processed: string[];
}
export interface TalentContext {
  talents: readonly string[];
  debuffs: readonly string[];
  day: number;
  memory?: TalentMemory;
}
export interface TalentHookResult {
  memory: TalentMemory;
  effects: Effects;
  addDebuffs: string[];
  removeDebuffs: string[];
  pressureDelta: number;
  notices: string[];
}
const has=(s:TalentContext,id:string)=>s.talents.includes(id)||s.debuffs.includes(id);
const both=(s:TalentContext,a:string,b:string)=>has(s,a)&&has(s,b);
const clamp=(v:number,min=0,max=1)=>Math.max(min,Math.min(max,v));
const unique=(xs:string[])=>[...new Set(xs)];
export function initialTalentMemory(day=1):TalentMemory {
  return {day,rerollsUsed:0,firstContacts:[],intuitionReady:[],reviewedPatients:[],fullReviewsUsed:0,smelledPatients:[],chartClues:{},quotedPatients:[],survivalUsed:false,gainedDay:{},permanentStomach:false,emotionalNights:0,saneNights:0,fullSleepNights:0,coffeeFreeDays:0,proactiveConsults:0,correctCare:0,transferredPatients:[],concealedPatients:{},beautifiedProjects:[],chiefKnowsProjects:[],delayedRecords:[],processed:[]};
}
/** Defaults also migrate saves made before individual talent counters existed. */
export function talentMemory(s:TalentContext):TalentMemory {
  return {...initialTalentMemory(s.day),...structuredClone(s.memory??{})};
}
function result(s:TalentContext):TalentHookResult {return {memory:talentMemory(s),effects:{},addDebuffs:[],removeDebuffs:[],pressureDelta:0,notices:[]};}
function once(r:TalentHookResult,id:string){if(r.memory.processed.includes(id))return false;r.memory.processed.push(id);return true;}

export function validateTalentSelection(ids:readonly string[],fourthSlotUnlocked=false):string[] {
  const errors:string[]=[];const valid=TALENT_DEFINITIONS.filter(t=>ids.includes(t.id));
  if(ids.length<1||ids.length>(fourthSlotUnlocked?4:3))errors.push(`请选择 1 至 ${fourthSlotUnlocked?4:3} 项天赋。`);
  if(new Set(ids).size!==ids.length)errors.push('不能重复选择同一天赋。');
  if(valid.length!==new Set(ids).size)errors.push('存在未收录的天赋。');
  for(const family of new Set(valid.map(t=>t.family)))if(valid.filter(t=>t.family===family).length>TALENT_SELECTION.maxFamily)errors.push(`${family}最多选择 2 项。`);
  return errors;
}
/** Weighted sampling without replacement; caller supplies seeded random values. */
export function drawTalentPool(random:()=>number,count=9,exclude:readonly string[]=[]):string[] {
  const candidates=TALENT_DEFINITIONS.filter(t=>!exclude.includes(t.id));const picked:string[]=[];
  while(picked.length<count&&candidates.length){let weight=clamp(random(),0,.999999999)*candidates.reduce((sum,t)=>sum+t.weight,0);let index=candidates.findIndex(t=>(weight-=t.weight)<0);if(index<0)index=candidates.length-1;picked.push(candidates.splice(index,1)[0].id);}
  return picked;
}
export function talentStart(s:TalentContext):TalentHookResult {
  const r=result(s);if(!once(r,'start'))return r;
  if(has(s,'T16'))r.effects.caps={stamina:20};
  if(has(s,'T24'))r.effects.cash=5000;
  if(has(s,'T11'))r.effects.reputation=-10;
  if(has(s,'T14'))r.effects.relations={peer:-1};
  if(both(s,'T26','T28'))r.effects.flags=['forced_audit_interview'];
  return r;
}
/** Return the live cap, not a mutation to permanent caps. baseCap already
 * includes T16 and meta upgrades. The post-night penalty affects waking stamina,
 * NOT the maximum to which coffee/nap can restore stamina (design 01 §1). */
export function talentStaminaCap(s:TalentContext,baseCap:number,isNight:boolean):number {
  const daytime=has(s,'T17')&&!isNight?15:0;
  return Math.max(1,baseCap-daytime);
}
export function talentWakingStamina(s:TalentContext,liveCap:number,afterNight:boolean):number {return Math.max(0,Math.min(talentSleepCeiling(s,liveCap),liveCap-(afterNight?(both(s,'T16','T17')?RULES.nightAfterStamina/2:RULES.nightAfterStamina):0)));}
export function talentBaseAp(s:TalentContext,base:number,afterNight:boolean):number {
  return Math.max(0,base-Number(has(s,'T04'))-Number(has(s,'B03'))-(afterNight&&!has(s,'T17')?2:0));
}
export function talentInterestRate(s:TalentContext,base=.03):number {return base+(has(s,'T24')?.01:0)+(has(s,'B17')?.01:0);}
export function talentPressureDecay(s:TalentContext,base=3):number {return base*(has(s,'T25')?.5:1);}
export function talentSleepCeiling(s:TalentContext,cap:number):number {return cap*(has(s,'B01')?.7:1);}
export function talentDayStart(s:TalentContext):TalentHookResult {
  const r=result(s);if(r.memory.day!==s.day){r.memory.day=s.day;r.memory.rerollsUsed=0;}
  if(!once(r,`day-start:${s.day}`))return r;
  if(has(s,'T20')&&s.day>=8){r.memory.permanentStomach=true;if(!has(s,'B03'))r.addDebuffs.push('B03');r.memory.gainedDay.B03??=s.day;}
  if(has(s,'B20')&&s.day-(r.memory.gainedDay.B20??s.day)>=7)r.removeDebuffs.push('B20');
  if(has(s,'T09')&&has(s,'B23'))r.removeDebuffs.push('B23');
  return r;
}
export function talentNightStart(s:TalentContext):TalentHookResult {
  const r=result(s);if(once(r,`night-start:${s.day}`)&&has(s,'T09'))r.effects.stamina=-3;return r;
}
export interface TalentDaySummary {
  emotion:number;san:number;reputation:number;relations:Partial<Record<Relation,number>>;debt:number;
  fullSleep:boolean;coffeeCount:number;
}
export function talentDayEnd(s:TalentContext,day:TalentDaySummary):TalentHookResult {
  const r=result(s);if(!once(r,`day-end:${s.day}`))return r;
  const stomach=has(s,'B03')||r.memory.permanentStomach;
  r.effects.emotion=(has(s,'T10')?-3:0)+(has(s,'B09')?-5:0)+(has(s,'T19')&&!stomach?2:0);
  if(has(s,'T19')&&!stomach)r.effects.cash=-60;
  if(has(s,'B12'))r.effects.depression=2;
  r.memory.emotionalNights=day.emotion>=60?r.memory.emotionalNights+1:0;
  r.memory.saneNights=day.san>=70?r.memory.saneNights+1:0;
  r.memory.fullSleepNights=day.fullSleep?r.memory.fullSleepNights+1:0;
  r.memory.coffeeFreeDays=day.coffeeCount===0?r.memory.coffeeFreeDays+1:0;
  if(r.memory.emotionalNights>=2)r.removeDebuffs.push('B01');
  if(r.memory.saneNights>=2)r.removeDebuffs.push('B05');
  if(r.memory.fullSleepNights>=2)r.removeDebuffs.push('B07');
  if(r.memory.coffeeFreeDays>=3)r.removeDebuffs.push('B04');
  return {...r,removeDebuffs:unique([...r.removeDebuffs,...talentAutomaticRecovery(s,day)])};
}
export function talentAutomaticRecovery(s:TalentContext,snapshot:Pick<TalentDaySummary,'san'|'reputation'|'relations'|'debt'>):string[] {
  return [snapshot.san>=70?'B06':'',(snapshot.relations.chief??0)>=4?'B13':'',snapshot.reputation>=70?'B14':'',(snapshot.relations.nurse??0)>=4?'B15':'',(snapshot.relations.peer??0)>=3?'B16':'',snapshot.debt<=0?'B17':''].filter(id=>id&&s.debuffs.includes(id));
}

export interface TalentCheckContext {
  operation:TalentOperation;
  actor:TalentActor;
  patientId?:string;
  /** These are other sources of advantage, not already talent-modified values. */
  advantage?:boolean;
  disadvantage?:boolean;
  archiveMatched?:boolean;
}
export interface TalentCheckModifiers {
  modifier:number;dcDelta:number;advantage:boolean;disadvantage:boolean;
  criticalFailureFaces:number[];reasons:string[];consumeIntuition:boolean;
  /** Signature bookkeeping only: never auto-consents to treatment. */
  signatureAutomatic:boolean;
}
export function talentCheck(s:TalentContext,c:TalentCheckContext):TalentCheckModifiers {
  const r:TalentCheckModifiers={modifier:0,dcDelta:0,advantage:!!c.advantage,disadvantage:!!c.disadvantage,criticalFailureFaces:has(s,'T22')?[1,2]:[1],reasons:[],consumeIntuition:false,signatureAutomatic:false};
  const add=(n:number,why:string)=>{r.modifier+=n;r.reasons.push(why);};
  const memory=talentMemory(s);
  if(c.operation==='observe'){
    if(has(s,'T04'))add(1,'复盘：观察加 1');
    if(has(s,'B02'))add(-2,'手抖：观察减 2');
    if(has(s,'B07')&&!has(s,'T01'))add(-1,'分神：观察减 1');
  }
  if(c.archiveMatched)add(has(s,'T04')?3:2,has(s,'T04')?'复盘：匹配陷阱加 3':'匹配陷阱加 2');
  if(c.operation==='comfort'){
    if(has(s,'T11'))add(2,'好说话：安慰加 2');
    if(has(s,'B11'))r.disadvantage=true;
  }
  if(c.operation==='persuade'&&c.actor==='chief'){
    const protectionLost=has(s,'T29')&&memory.chiefKnowsProjects.some(id=>memory.beautifiedProjects.includes(id));
    if(has(s,'T14')&&!protectionLost)add(2,'主任的人：说服主任加 2');
    if(has(s,'B13')){r.dcDelta+=2;r.reasons.push('主任盯上：说服主任难度加 2');}
  }
  if(c.operation==='consult'&&has(s,'T08')){r.dcDelta-=3;r.reasons.push('会诊单：会诊说服难度减 3');}
  if(has(s,'T15')){
    if(c.actor==='family'&&['history','comfort'].includes(c.operation))r.advantage=true;
    if(c.actor==='patient'&&c.operation==='history')r.disadvantage=true;
  }
  if(c.patientId&&['history','observe'].includes(c.operation)&&memory.intuitionReady.includes(c.patientId)){
    r.advantage=true;r.consumeIntuition=true;r.reasons.push('不对劲：本病例一次问诊或观察优势');
  }
  if(c.operation==='day-end'&&has(s,'T21')&&!has(s,'T01'))r.dcDelta+=1;
  r.signatureAutomatic=has(s,'T07')&&['consent','refusal-signature'].includes(c.operation);
  if(r.advantage&&r.disadvantage){r.advantage=false;r.disadvantage=false;r.reasons.push('优势与劣势抵消');}
  return r;
}
export function commitTalentCheck(s:TalentContext,c:TalentCheckContext):TalentMemory {
  const memory=talentMemory(s);if(c.patientId&&talentCheck(s,c).consumeIntuition)memory.intuitionReady=memory.intuitionReady.filter(id=>id!==c.patientId);return memory;
}
export function talentRollOutcome(s:TalentContext,face:number,modifier:number,dc:number):{success:boolean;critical:'success'|'failure'|null} {
  if(face===20)return {success:true,critical:'success'};
  if(face===1||(has(s,'T22')&&face===2))return {success:false,critical:'failure'};
  return {success:face+modifier>=dc,critical:null};
}
export function talentRerollsRemaining(s:TalentContext):number {const m=talentMemory(s);return has(s,'T22')?Math.max(0,1-(m.day===s.day?m.rerollsUsed:0)):0;}
export function useTalentReroll(s:TalentContext,pendingUnsettled:boolean):TalentMemory|null {
  if(!pendingUnsettled||talentRerollsRemaining(s)<1)return null;
  const m=talentMemory(s);if(m.day!==s.day){m.day=s.day;m.rerollsUsed=0;}m.rerollsUsed++;return m;
}

export interface TalentCosts {ap:number;minutes:number;cost:number;stamina:number;}
export interface TalentCostContext {
  operation:TalentOperation;isNight:boolean;clinical:boolean;quality?:'correct'|'neutral'|'incorrect';
  /** Included in base.minutes. Never includes active examination/treatment time. */
  consultWaitMinutes?:number;
}
export function talentCosts(s:TalentContext,base:TalentCosts,c:TalentCostContext):TalentCosts {
  const out={...base};
  if(c.operation==='full-exam'&&has(s,'T12'))out.stamina+=1;
  if(['exam','full-exam'].includes(c.operation)&&has(s,'B02'))out.stamina+=1;
  if(c.operation==='consult'&&has(s,'B21'))out.ap+=1;
  if(['consent','refusal-signature'].includes(c.operation)&&has(s,'T07'))out.ap=Math.max(1,out.ap);
  if(has(s,'T08')) {
    const waiting=c.consultWaitMinutes??(c.operation==='consult-wait'?base.minutes:0);
    if(Number.isFinite(waiting))out.minutes-=Math.max(0,Math.min(base.minutes,waiting))*.5;
  }
  if(has(s,'T06'))out.minutes+=1;
  if(has(s,'B08'))out.minutes*=1.15;
  if(has(s,'B22'))out.minutes*=c.quality==='neutral'?.8:c.quality==='correct'?1.2:1;
  if(c.clinical)out.cost*=(has(s,'T26')?1.2:1)*(has(s,'B20')?1.15:1);
  if(c.isNight&&has(s,'T17'))out.stamina*=.7;
  return out;
}
export interface TalentHazardContext {patientId?:string;unsignedConsent?:boolean;newAfterTransfer?:boolean;}
/** Only new hazards enter this hook. Calling it on the stored log would compound
 * reductions and would wrongly erase pre-transfer evidence. */
export function talentHazards(s:TalentContext,hazards:readonly HazardInput[],c:TalentHazardContext={}):HazardInput[] {
  if(c.newAfterTransfer&&c.patientId&&talentMemory(s).transferredPatients.includes(c.patientId))return [];
  return hazards.map(h=>{
    let factor=1;
    if(h.type==='D')factor=(has(s,'T06')?.7:1)*(both(s,'T06','T09')?.9:1)*(has(s,'B08')?.9:1);
    if(h.type==='R')factor=(has(s,'T10')?.85:1)*(has(s,'T26')?.6:1)*(has(s,'B20')?.8:1);
    if(h.type==='F')factor=(has(s,'T26')?1.6:1)*(has(s,'B20')?1.3:1);
    if(h.type==='C')factor=(has(s,'B14')?1.2:1)*(c.unsignedConsent&&has(s,'T07')?0:1);
    return {...h,weight:h.weight*factor};
  });
}
export interface TalentEffectsContext {
  randomEvent?:boolean;dispute?:boolean;departmentNotice?:boolean;correctCare?:boolean;
  ownPatientDeath?:boolean;representativeBenefit?:boolean;isNight?:boolean;
}
/** Do not apply this to cost.stamina as well as talentCosts: costs and reward
 * effects are separate ledgers, each transformed exactly once. */
export function talentEffects(s:TalentContext,effects:Effects,c:TalentEffectsContext):Effects {
  const e=structuredClone(effects);
  if(c.randomEvent&&has(s,'T16')){
    for(const key of ['stamina','san','emotion','reputation','cash','income','ap'] as const)if((e[key]??0)>0)e[key]=e[key]!*.5;
    if(e.relations)for(const key of Object.keys(e.relations) as Relation[])if((e.relations[key]??0)>0)e.relations[key]=e.relations[key]!*.5;
    if(e.caps)for(const key of Object.keys(e.caps) as Vital[])if((e.caps[key]??0)>0)e.caps[key]=e.caps[key]!*.5;
  }
  if(c.dispute&&has(s,'T13'))for(const key of ['san','emotion'] as const)if((e[key]??0)<0)e[key]=e[key]!*.5;
  if(has(s,'T13')&&(e.reputation??0)>0)e.reputation=e.reputation!*.85;
  if(c.departmentNotice&&has(s,'B10')&&(e.emotion??0)<0)e.emotion=e.emotion!*1.5;
  if(c.correctCare&&has(s,'B12')&&(e.emotion??0)>0)e.emotion=Math.max(0,e.emotion!-5);
  if(c.ownPatientDeath&&has(s,'B12')&&(e.san??0)<0)e.san=-5;
  if(c.representativeBenefit&&has(s,'T28')){
    if((e.san??0)<0)e.san=0;
    if((e.cashPressure??0)<0)e.cashPressure=talentRepresentative(s,-e.cashPressure!,0).pressureRelief*-1;
  }
  if(c.isNight&&has(s,'T17')&&(e.stamina??0)<0)e.stamina=e.stamina!*.7;
  return e;
}

export interface TalentEventContext {positive?:boolean;food?:boolean;chiefResponsibility?:boolean;peerNegative?:boolean;chiefCallout?:boolean;peerCover?:boolean;peerMeal?:boolean;}
export function talentEventWeight(s:TalentContext,base:number,c:TalentEventContext):number {
  if(has(s,'B16')&&(c.peerCover||c.peerMeal))return 0;
  const m=talentMemory(s);const protectionLost=has(s,'T29')&&m.chiefKnowsProjects.some(id=>m.beautifiedProjects.includes(id));
  return base*(c.positive&&has(s,'T21')?1.5:1)*(c.chiefResponsibility&&has(s,'T14')&&!protectionLost?2:1)*(c.peerNegative&&has(s,'T14')?1.2:1)*(c.chiefCallout&&has(s,'B13')?2:1);
}
export function talentFoodPositive(s:TalentContext):boolean {return has(s,'T19')&&!has(s,'B03')&&!talentMemory(s).permanentStomach;}
export function talentDisputeSettlement(s:TalentContext,act:number):boolean {return act===2&&both(s,'T11','T13');}
export function talentForcedAudit(s:TalentContext):boolean {return both(s,'T26','T28');}
export function talentNotPresentThreshold(s:TalentContext,normal:number):number {return both(s,'T27','T30')?4:normal;}
export function talentSkimChance(s:TalentContext,base:number):number {return clamp(base+(has(s,'B05')?.2:0));}
export function talentTransferFirst(s:TalentContext):boolean {return has(s,'B21');}
export function talentShowBudget(s:TalentContext):boolean {return has(s,'B24');}
export function talentBudgetCharge(s:TalentContext,overBudgetCharge:number):number {return overBudgetCharge*(has(s,'B24')?1.2:1);}

export interface IntuitionClue {id:string;text:string;direction:'history'|'exam'|'medication';}
export function talentIntuitionChance(s:TalentContext,base=1):number {return has(s,'T01')?clamp(base*(has(s,'T21')?.5:1)-(has(s,'B07')?.25:0)):0;}
export function firstTalentContact(s:TalentContext,patientId:string,clue:IntuitionClue|undefined,random:number):TalentHookResult&{clue?:IntuitionClue;hint?:string} {
  const r:TalentHookResult&{clue?:IntuitionClue;hint?:string}=result(s);
  if(r.memory.firstContacts.includes(patientId))return r;r.memory.firstContacts.push(patientId);
  if(clue&&has(s,'T01')&&random<talentIntuitionChance(s)){
    r.memory.intuitionReady.push(patientId);r.effects.san=-5;r.clue=clue;
    const direction={history:'再问一段病史',exam:'重新看看查体',medication:'把用药再核对一遍'}[clue.direction];
    r.hint=has(s,'T04')?`有些地方对不上。${direction}。`:'有些地方对不上。';
  }
  return r;
}
export function talentChartReview(s:TalentContext,patientId:string,clues:readonly IntuitionClue[]):TalentHookResult&{clue?:IntuitionClue;apCost:number} {
  const r:TalentHookResult&{clue?:IntuitionClue;apCost:number}={...result(s),apCost:0};if(!has(s,'T02'))return r;
  const known=r.memory.chartClues[patientId]??[];const clue=clues.find(c=>!known.includes(c.id));if(!clue)return r;
  r.memory.chartClues[patientId]=[...known,clue.id];r.clue=clue;r.apCost=2;r.effects.ap=-2;return r;
}
export function talentSmell(s:TalentContext,patientId:string,smell:{kind:'alcohol'|'ketone'|'uremic'|'bitter-almond';text:string}|undefined):TalentHookResult&{clue?:string} {
  const r:TalentHookResult&{clue?:string}=result(s);if(!has(s,'T03')||!smell||r.memory.smelledPatients.includes(patientId))return r;
  r.memory.smelledPatients.push(patientId);r.effects.emotion=-2;r.clue=smell.text;return r;
}
export function talentFullReview(s:TalentContext,patientId:string,firstNode:boolean,reportAvailable:boolean):TalentHookResult&{allowed:boolean;extraMinutes:number} {
  const r={...result(s),allowed:false,extraMinutes:0};
  if(!has(s,'T05')||!firstNode||!reportAvailable||r.memory.fullReviewsUsed>=5||r.memory.reviewedPatients.includes(patientId))return r;
  r.allowed=true;r.extraMinutes=10;r.effects.stamina=-3;r.memory.fullReviewsUsed++;r.memory.reviewedPatients.push(patientId);return r;
}
export function talentNormQuote(s:TalentContext,patientId:string,norm:string|undefined):TalentHookResult&{quote?:string} {
  const r:TalentHookResult&{quote?:string}=result(s);if(!has(s,'T10')||!norm||r.memory.quotedPatients.includes(patientId))return r;
  r.memory.quotedPatients.push(patientId);r.quote=norm;return r;
}

/** Call once, after the underlying action completed, with a unique committed ID. */
/** B06's per-incident SAN cost is charged by nightClinicalCharge; it is not an action hook. */
export function talentAfterAction(s:TalentContext,action:{id:string;operation:TalentOperation;patientId?:string;proactive?:boolean;correctCare?:boolean}):TalentHookResult&{patientTrust:number;complaintDelta:number} {
  const r={...result(s),patientTrust:0,complaintDelta:0};if(!once(r,`action:${action.id}`))return r;
  if(action.operation==='full-exam'&&action.patientId&&has(s,'T12')){r.patientTrust=3;r.complaintDelta=-1;}
  if(action.operation==='consult'){
    if(has(s,'T08')&&action.patientId)r.effects.hazards=[{type:'F',weight:5,reason:'新增会诊流程',norm:'会诊适应证与诊疗必要性',causal:false}];
    if(action.proactive){r.memory.proactiveConsults++;if(r.memory.proactiveConsults>=3)r.removeDebuffs.push('B21');}
  }
  if(action.correctCare){r.memory.correctCare++;if(r.memory.correctCare>=3)r.removeDebuffs.push('B22');}
  return r;
}
export function talentCoffee(s:TalentContext,cupsAlready:number):{allowed:boolean;stamina:number;reputation:number} {
  if(cupsAlready>=3)return {allowed:false,stamina:0,reputation:0};
  return {allowed:true,stamina:has(s,'B04')?5:has(s,'T20')?15:[15,8,3][Math.max(0,cupsAlready)],reputation:has(s,'T20')?0:(cupsAlready>=1?-2:0)+(has(s,'B15')?-1:0)};
}
export function talentNap(s:TalentContext,alreadyNapped:boolean):{allowed:boolean;stamina:number;ap:number} {return {allowed:!alreadyNapped,stamina:alreadyNapped?0:has(s,'T18')?15:10,ap:alreadyNapped?0:has(s,'T18')?2:1};}
export function talentOvertime(s:TalentContext):Effects {return has(s,'B15')?{reputation:-1}:{};}
export function talentSurvival(s:TalentContext,vital:Vital,cap:number):TalentHookResult&{rescued:boolean;value:number} {
  const r={...result(s),rescued:false,value:0};if(!has(s,'T23')||r.memory.survivalUsed)return r;
  r.rescued=true;r.value=Math.max(1,cap-30);r.memory.survivalUsed=true;r.effects={san:-10,depression:10};return r;
}

export function talentRelativeLoan(s:TalentContext,eventId:string):TalentHookResult&{allowed:boolean} {
  const r={...result(s),allowed:false};if(!has(s,'T25')||!once(r,`relative-loan:${eventId}`))return r;
  r.allowed=true;r.effects={cash:10000,privateDebt:10000,relations:{family:-1}};return r;
}
export function talentRepresentative(s:TalentContext,basePressureRelief:number,statisticsProbability:number):{pressureRelief:number;statisticsProbability:number;canHandOver:boolean;sanExempt:boolean} {
  return {pressureRelief:basePressureRelief*(has(s,'T28')?2:1),statisticsProbability:clamp(statisticsProbability*(has(s,'T28')?2:1)),canHandOver:!has(s,'T28'),sanExempt:has(s,'T28')};
}
export function talentTransfer(s:TalentContext,patientId:string,accepted:boolean):TalentHookResult&{allowed:boolean;transferred:boolean;notPresentDelta:number} {
  const r={...result(s),allowed:has(s,'T27'),transferred:false,notPresentDelta:0};
  if(!r.allowed||!accepted||r.memory.transferredPatients.includes(patientId))return r;
  r.transferred=true;r.notPresentDelta=1;r.memory.transferredPatients.push(patientId);r.effects={reputation:-5,discharge:true,flags:[`transferred:${patientId}`]};return r;
}
export function talentResearch(s:TalentContext,projectId:string):TalentHookResult&{automatic:boolean;retractionProbability:number;colleagueKnows:boolean} {
  const r={...result(s),automatic:false,retractionProbability:0,colleagueKnows:false};
  if(!has(s,'T29')||!once(r,`research:${projectId}`))return r;
  r.automatic=true;r.retractionProbability=.4;r.colleagueKnows=true;r.memory.beautifiedProjects.push(projectId);
  r.effects.flags=[`beautified:${projectId}`,`paper_complete:${projectId}`,`colleague_knows:${projectId}`];return r;
}
export function talentChiefLearns(s:TalentContext,projectId:string):TalentMemory {const m=talentMemory(s);m.chiefKnowsProjects=unique([...m.chiefKnowsProjects,projectId]);return m;}
export function talentConceal(s:TalentContext,patientId:string,actionId:string):TalentHookResult&{suppressEscalation:boolean} {
  const r={...result(s),suppressEscalation:false};if(!has(s,'T30')||!once(r,`conceal:${actionId}`))return r;
  r.suppressEscalation=true;r.memory.concealedPatients[patientId]=(r.memory.concealedPatients[patientId]??0)+1;
  r.effects.hazards=[{type:'C',weight:15,reason:'报平安：隐瞒患者坏消息',norm:'如实告知患者及合法受托人',causal:false}];return r;
}
/** Patient death adds a matching entry; historical entries remain immutable.
 * Pass the existing hazard log after its initial talent multipliers were applied. */
export function talentConcealDeath(s:TalentContext,patientId:string,historical:readonly Hazard[]):TalentHookResult {
  const r=result(s);if(!once(r,`conceal-death:${patientId}`))return r;
  const entries=historical.filter(h=>h.scope.kind==='patient'&&h.scope.id===patientId&&h.type==='C'&&h.reason==='报平安：隐瞒患者坏消息');
  if(entries.length)r.effects.hazards=entries.map(h=>({...h,reason:'隐瞒坏消息后患者死亡：追加告知责任',weight:h.weight}));
  return r;
}

export function talentDebuffWeights(s:TalentContext,c:{debt:number;afterNight:boolean;san:number}):{id:string;weight:number}[] {
  return DEBUFF_DEFINITIONS.filter(d=>!s.debuffs.includes(d.id)&&!(d.id==='B23'&&has(s,'T09'))).map(d=>({id:d.id,weight:d.weight*(d.family==='钱'&&c.debt>0?2:1)*(d.family==='体力'&&c.afterNight?2:1)*(d.family==='感知'&&c.san<50?2:1)}));
}
export function drawTalentDebuffs(s:TalentContext,c:{debt:number;afterNight:boolean;san:number},random:()=>number,count=3):string[] {
  const pool=talentDebuffWeights(s,c);const selected:string[]=[];
  while(pool.length&&selected.length<count){let n=clamp(random(),0,.999999999)*pool.reduce((a,d)=>a+d.weight,0);let index=pool.findIndex(d=>(n-=d.weight)<0);if(index<0)index=pool.length-1;selected.push(pool.splice(index,1)[0].id);}return selected;
}
export function talentGainDebuff(s:TalentContext,id:string):TalentHookResult {
  const r=result(s);if(!DEBUFF_DEFINITIONS.some(d=>d.id===id)||s.debuffs.includes(id)||(id==='B23'&&has(s,'T09')))return r;
  if(id==='B18'){r.effects={cash:2000,relations:{family:-1}};r.pressureDelta=10;return r;}
  if(id==='B19'){r.effects.cash=-500;return r;}
  r.addDebuffs=[id];r.memory.gainedDay[id]=s.day;
  if(id==='B01')r.memory.emotionalNights=0;if(id==='B04')r.memory.coffeeFreeDays=0;if(id==='B05')r.memory.saneNights=0;if(id==='B07')r.memory.fullSleepNights=0;if(id==='B21')r.memory.proactiveConsults=0;if(id==='B22')r.memory.correctCare=0;
  return r;
}
export function talentRemovableDebuffs(s:TalentContext):string[] {return s.debuffs.filter(id=>{const d=DEBUFF_DEFINITIONS.find(d=>d.id===id);return !!d&&!d.permanent&&!(id==='B03'&&talentMemory(s).permanentStomach);});}
export type DebuffRecovery = 'counselling'|'day-off'|'gastroscopy'|'family-clear'|'leave-group'|'dispute-ended';
export function talentRecover(s:TalentContext,event:DebuffRecovery,success=true):TalentHookResult&{apCost:number;cashCost:number} {
  const r={...result(s),apCost:0,cashCost:0};if(!success)return r;
  if(event==='counselling')r.removeDebuffs=['B01','B06'];
  if(event==='day-off')r.removeDebuffs=['B02','B23'];
  if(event==='gastroscopy'&&has(s,'B03')&&!r.memory.permanentStomach){r.removeDebuffs=['B03'];r.apCost=2;r.cashCost=600;r.effects={ap:-2,cash:-600};}
  if(event==='family-clear')r.removeDebuffs=['B09'];
  if(event==='leave-group'){r.removeDebuffs=['B10'];if(has(s,'B10'))r.effects.relations={chief:-1};}
  if(event==='dispute-ended')r.removeDebuffs=['B11'];
  r.removeDebuffs=r.removeDebuffs.filter(id=>s.debuffs.includes(id));return r;
}
export function talentDelayedRecord(s:TalentContext,patientId:string,recordId:string,operation:TalentOperation,random:number):TalentHookResult&{delayed:boolean} {
  const r={...result(s),delayed:false};if(operation!=='progress-record'||!has(s,'B23')||has(s,'T09')||!once(r,`record:${recordId}`)||random>=.2)return r;
  r.delayed=true;r.memory.delayedRecords.push({patientId,recordId,dueDay:s.day+1});
  r.effects.hazards=[{type:'D',weight:10,reason:'病程记录延至次日',norm:'病历记录及时性',causal:false}];return r;
}
export function talentDueRecords(s:TalentContext):TalentMemory['delayedRecords'] {return talentMemory(s).delayedRecords.filter(r=>r.dueDay<=s.day);}
export function talentCompleteDelayedRecord(s:TalentContext,recordId:string):TalentMemory {const m=talentMemory(s);m.delayedRecords=m.delayedRecords.filter(r=>r.recordId!==recordId);return m;}

/** Adapter for legacy Check.skill, where history/observation were combined.
 * Clinical operation metadata should override this fallback at all call sites. */
export function talentOperationForSkill(skill:Skill):TalentOperation {return ({observe:'observe',clinical:'treatment',record:'record',persuade:'persuade',comfort:'comfort',endure:'endure'} as const)[skill];}
