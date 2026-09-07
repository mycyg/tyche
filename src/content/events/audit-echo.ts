import type {Card,Run}from '../../game/types';
import type {AuthoredEvent}from './types';
import {RULES}from '../../game/rules';
import {auditScore}from '../../game/audit-score';
import {runRandom}from '../../game/run-random';

export function auditEventWeight(r:Run,e:AuthoredEvent):number {
  return /投诉|复诊|抽查|飞检|稽核|质控|回访|核查/.test(`${e.title} ${e.trigger}`)?Math.min(RULES.audit.weightMax,1+RULES.audit.weightPerPoint*auditScore(r)):1;
}
/** Every echo cites an actual earlier action. It is a new request for records,
 * not a claim that treatment, consent, a complaint or a police report happened. */
export function auditEchoDueDay(r:Run,threshold:number):number|undefined {
  const crossing=Array.from({length:Math.min(r.day,RULES.days)},(_,i)=>i+1).find(day=>auditScore({...r,hazards:r.hazards.filter(h=>h.day<=day),facts:Object.fromEntries(Object.entries(r.facts).filter(([,f])=>f.day<=day))})>=threshold);
  if(crossing===undefined)return;
  const delay=RULES.audit.echoDelayMin+Math.floor(runRandom(r,`audit-echo:${threshold}:delay`)*(RULES.audit.echoDelayMax-RULES.audit.echoDelayMin+1));
  return Math.min(RULES.days+1,crossing+delay);
}
export function auditEchoCard(r:Run,requestedThreshold?:number):Card|undefined {
  if(r.day<2||r.day>RULES.days+1)return;
  const threshold=RULES.audit.echoThresholds.find(q=>(requestedThreshold===undefined||q===requestedThreshold)&&auditScore(r)>=q&&(auditEchoDueDay(r,q)??Infinity)<=r.day&&!r.authored?.published[`${r.id}:audit-echo:${q}`]);
  if(!threshold||!r.hazards.length)return;
  const hazard=r.hazards.filter(h=>h.day<r.day).sort((a,b)=>b.weight-a.weight||a.day-b.day)[0];if(!hazard)return;
  const entry=r.journal.find(j=>j.id===hazard.choiceId||`${j.id}:critical`===hazard.choiceId);
  if(!entry)return;
  const p=hazard.scope.kind==='patient'?r.patients.find(p=>p.uid===hazard.scope.id):undefined;
  const id=`${r.id}:audit-echo:${threshold}`,tier=RULES.audit.echoThresholds.indexOf(threshold);
  const opening=['质控员发来一条消息，请你核对一份早先的记录。','医务科要求你找出当时留存的资料，逐项说明处置经过与记录差异。','医务科通知你保留现有材料，提交书面说明；找不到的原件也要如实说明去向。'][tier];
  return {id,kind:'audit',shiftPhase:r.day>RULES.days?'交班':'结算',actor:'auditor',title:['一份旧记录','需要补交的说明','原件与书面答复'][tier],scope:hazard.scope,patientId:p?.uid,
    text:`${opening}\n涉及第 ${entry.day} 天${p?`的${p.name}`:'的事项'}：“${entry.choice}”。你当时留下的记录是：“${entry.result}”`,
    options:[
      {id:`${id}:review`,label:'清点现有资料，说明经过和无法核实的内容',ap:r.day>RULES.days?0:RULES.audit.echoAp[tier],minutes:r.day>RULES.days?0:15,cost:0,mechanics:{operation:'record',quality:'correct'},effects:{san:-2,hazardRelief:{D:5}},result:'你把能找到的资料列成清单，另写补充说明，注明补记时间。你分别注明了哪些内容没有依据、哪些原件没找到。原来的签字和诊疗记录都保留着。'},
      {id:`${id}:handover`,label:'提交现有材料，请医务科继续核对',ap:0,minutes:5,cost:0,effects:{reputation:-3},result:'医务科签收了现有材料，要求你保持联络。还没解释清楚的缺项，仍需你补充说明。'},
      {id:`${id}:ignore`,label:'暂不答复，把通知留在待办里',ap:0,minutes:0,cost:0,effects:{emotion:-2,hazards:[{type:'D',weight:5,reason:'收到原始记录核查通知后未按要求答复',norm:'按要求保留原始资料并如实答复具体核查事项',causal:false}]},result:'通知没有得到答复。医务科记下了未交说明，继续追问材料是否保留、由谁经手。'},
    ]};
}
