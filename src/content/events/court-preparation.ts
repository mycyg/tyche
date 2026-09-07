import type {Card,Run}from '../../game/types';
import {courtPreparationModifier}from './specialized-checks';
import {auditEchoCard}from './audit-echo';
import {buildSourceFollowups}from './followups';
import {RULES}from '../../game/rules';
export const COURT_PREPARATION_CHAIN='court-preparation';
const carryKinds=['police-receipt','denial-record','superior-evidence','forgiveness'];
const courtCarry=(card:Card):boolean=>card.id.includes(':audit-echo:')||carryKinds.includes((card as Card&{sourceFollowup?:{kind:string}}).sourceFollowup?.kind??'');
export function buildTribunalPreparation(r:Run):Card[]{
 if(r.day!==15)return[];
 // A notice published but crowded out of the ward agenda is still pending.
 // Reuse its actual source and ID rather than inventing a fresh investigation.
 const pending=(r.authored?.sceneAgenda??[]).flatMap(item=>{const card=r.authored?.published[item.cardId];return card&&courtCarry(card)?[card]:[];});
 const carried:Card[]=[...new Map([...pending,...RULES.audit.echoThresholds.flatMap(q=>{const card=auditEchoCard(r,q);return card?[card]:[];}),...buildSourceFollowups(r,'交班').filter(c=>courtCarry(c))].map(c=>[c.id,c])).values()].map(c=>({...c,shiftPhase:'交班' as const,options:c.options.map(o=>({...o,ap:0,minutes:0}))}));
 return[...carried,...(['record','endure']as const).map(skill=>{
  const id=`${r.id}:court-preparation:${skill}`,records=skill==='record';
  return{id,chain:COURT_PREPARATION_CHAIN,kind:'story' as const,shiftPhase:'交班' as const,scope:{kind:'personal' as const,id:r.id},title:records?'卷宗核对':'会议室里的陈述',text:records?'医务科请你按患者、日期整理这十四天的原始病历与已有补记。没有写过的内容不能补成当时就有的记录。':'会议室里，核查人员请你说明自己实际参与的诊疗经过。对于没有亲历的部分，可以明确回答不知道。',options:[
   {id:`${id}:prepare`,label:records?'核对原件、补记时间和附件目录':'按实际经过陈述，区分亲历与转述',ap:0,minutes:0,cost:0,effects:{flags:[`court-preparation:${skill}:complete`]},result:records?'已持有的材料按患者和日期整理齐全，原件与补记分别标明。当时没记下的内容，仍列为缺项。':'你把亲历的过程说明清楚，对转述和无法确认的部分作了区分。',check:{skill,dc:14-courtPreparationModifier(r,skill),purpose:records?'整理已有卷宗':'在询问中说明实际经过',failure:{flags:[`court-preparation:${skill}:incomplete`],clear:[`court-preparation:${skill}:complete`]},failureText:records?'部分附件还没排好顺序，你标出待核对的页码，按原样提交。':'你没能把部分时间顺序说清，核查人员把未答清楚的问题单独记下。'}},
   {id:`${id}:decline`,label:records?'保留原件现状，注明尚未整理':'暂不作口头补充，保留书面材料',ap:0,minutes:0,cost:0,effects:{flags:[`court-preparation:${skill}:declined`]},result:records?'材料按现有状态交出，尚未整理的部分已经注明。':'你没有补充口头陈述，核查仍按已经收到的材料继续。'},
  ]};
 })].filter(card=>!card.options.some(option=>r.committed.includes(option.id)));
}
export function courtPreparationNotes(r:Run):string[]{
 const notes:string[]=[];
 for(const [skill,label]of [['record','卷宗整理'],['endure','现场陈述']]as const){
  if(r.facts[`court-preparation:${skill}:complete`])notes.push(`${label}已完成，认定仍以原始记录和实际经过为准。`);
  else if(r.facts[`court-preparation:${skill}:incomplete`])notes.push(`${label}仍有未核清之处，已注明待核对事项。`);
  else if(r.facts[`court-preparation:${skill}:declined`])notes.push(`${label}未作补充，原有材料按现状保留。`);
 }
 return notes;
}
