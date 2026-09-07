import { runDie, runRandom } from '../../game/run-random';
import type { Ending, Hazard, Patient, Run } from '../../game/types';
import { DOCUMENTED_ENDINGS, DOCUMENTED_ROUTES } from './catalog';
import { RULES } from '../../game/rules';
import { butterflyResolutionView, routeButterfly } from './butterfly';
import type { AuthoredDirectorState } from '../../game/director';
import { ENDING_PROSE } from './ending-prose';
import {talentNotPresentThreshold}from '../../game/talents';
import {eventFactNotes}from './fact-records';
import {courtPreparationNotes}from './court-preparation';
import {clinicalAssignment}from './clinical-ownership';
import {playerClinicalSource}from '../../game/discharge-responsibility';
import {interruptionPhase}from '../../game/interruption';
import type {EventPhase}from './types';
import {auditScore}from '../../game/audit-score';
export {auditScore}from '../../game/audit-score';
export interface SeedHistory {runId:string;caseId:string;trapId:string}
export type EndingRun=Run&{authored?:AuthoredDirectorState;shiftPhase?:string;priorSeeds?:SeedHistory[];lampSignals?:{patientId:string;nodeId:string;day:number}[]};
export interface EndingOptions {response?:'facts'|'admit'|'silent';requested?:string;early?:'san'|'stamina'|'emotion'|'interest'|'debt'|'quit';occurredPhase?:EventPhase}
export interface DocumentedEnding extends Ending {annexIds:string[];sourceId:string;liability?:Liability;seedHistory:SeedHistory[]}
export const ENDING_DEFINITIONS=DOCUMENTED_ENDINGS;
export const ENDING_IDS=ENDING_DEFINITIONS.map(e=>e.id);
const definitions=new Map(ENDING_DEFINITIONS.map(e=>[e.id,e]));
const priority=(id:string)=>{const value=definitions.get(id)?.priority;return typeof value==='number'?value:0;};
const MAIN_ENDINGS=['X01','X02','X03','X04','X05','X06','X07','X09','X10','X11','X12','X13','X14','X15','X16','X17','X18','X19','X20','X21','X22','X23','X24','X25','X26','X27','X28','X29','X31','X32','X33','X34','X35','X36']
  .sort((a,b)=>priority(b)-priority(a)||a.localeCompare(b));
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const money=(n:number)=>`¥${Math.round(n).toLocaleString('zh-CN')}`;
function facts(r:EndingRun):Set<string>{return new Set([...Object.keys(r.facts),...Object.keys(r.authored?.activeFacts??{}),...(r.authored?.chains??[]).flatMap(c=>c.facts.map(f=>`${c.chain}:${f.type}`))]);}
const any=(f:Set<string>,...names:string[])=>names.some(n=>f.has(n));
function patientFacts(r:EndingRun,p:Patient):Set<string>{
  const result=new Set(p.clinical?.flags??[]);
  for(const key of facts(r)){
    for(const prefix of [`clinical:${p.uid}:`,`${p.uid}:`])if(key.startsWith(prefix))result.add(key.slice(prefix.length));
    for(const prefix of ['tampered','1224','concealment-causal','superior-signed','compensated','forgiven','reported','prosecuted','autopsy-consented','autopsy-done','tampering-discovered'])if(key===`${prefix}:${p.uid}`)result.add(prefix);
  }
  for(const chain of r.authored?.chains??[])if(chain.subjects.patientId===p.uid)for(const fact of chain.facts)result.add(fact.type);
  return result;
}
export interface Liability {patientId:string;R:number;C:number;D:number;F:number;L:number;level:number;levelName:string;causal:boolean;tampered:boolean;concealmentDefence:boolean;superiorRecorded:boolean;loss:number;hospitalCompensation:number;personalRecovery:number}
export function liability(r:Run,p:Patient):Liability{
  const ff=patientFacts(r,p),hs=r.hazards.filter(h=>h.scope.kind==='patient'&&h.scope.id===p.uid);
  const sum=(type:Hazard['type'])=>hs.filter(h=>h.type===type).reduce((n,h)=>n+Math.max(0,h.weight),0);
  const R=sum('R'),C=sum('C'),D=sum('D'),F=sum('F');
  const tampered=any(ff,'tampered','record_tampered');
  const concealmentDefence=any(ff,'1224','1224_recorded','denial_recorded')&&any(ff,'concealment-causal','hidden_history_causal');
  const superiorRecorded=any(ff,'superior-signed','superior_order_recorded','chief_signed');
  const L=Math.max(0,R+(C+D)/2+(tampered?20:0)-(concealmentDefence?15:0)-(superiorRecorded?10:0));
  let level=L<15?0:L<30?1:L<50?2:L<80?3:4;
  if(concealmentDefence)level=Math.max(0,level-1);if(tampered)level=4;
  const causal=hs.some(h=>h.type==='R'&&h.causal&&!!h.norm.trim()&&(p.clinical?.causalChoices.length?p.clinical.causalChoices.some(choice=>h.choiceId.includes(choice)):true));
  const loss=p.damage>=3?1200000+Math.floor(runRandom(r,`civil:${p.uid}:loss`)*600001):p.damage===2?300000+Math.floor(runRandom(r,`civil:${p.uid}:loss`)*600001):0;
  const hospitalCompensation=Math.round(loss*[.1,.3,.5,.85,1][level]);
  const insured=any(facts(r),'医责险','medical-liability-insurance','liability-insured','insurance-bought');
  return{patientId:p.uid,R,C,D,F,L,level,levelName:['轻微','次要','同等','主要','完全'][level],causal,tampered,concealmentDefence,superiorRecorded,loss,hospitalCompensation,personalRecovery:insured?0:Math.round(hospitalCompensation*.1)};
}
export interface EndingAssessment {q:number;fees:number;seeds:Patient[];worst?:Patient;liability?:Liability;review?:{patientId:string;A:number};night:boolean;paid:boolean;forgiven:boolean;reported:boolean;filed:boolean;dc:number;face:number;corruption:boolean;corruptionCaught:boolean;systemInfection:boolean;falseProject:boolean;tamperingDiscovered:boolean}
export function assessEnding(r:EndingRun,occurredPhase=interruptionPhase(r)):EndingAssessment{
  const f=facts(r),q=auditScore(r),fees=r.hazards.filter(h=>h.type==='F').reduce((n,h)=>n+Math.max(0,h.weight),0);
  // C020 starts after an unrelated death: its paperwork never creates a clinical injury.
  const seeds=r.patients.filter(p=>p.damage>=2&&p.caseId!=='C020'&&(!clinicalAssignment(r,p)||!!playerClinicalSource(r,p))).sort((a,b)=>b.damage-a.damage||liability(r,b).L-liability(r,a).L);
  const worst=seeds[0],l=worst?liability(r,worst):undefined,pf=worst?patientFacts(r,worst):new Set<string>();
  const paid=any(pf,'compensated','hospital_compensated','compensation_paid'),forgiven=any(pf,'forgiven','family_forgiveness_received'),reported=any(pf,'reported','police_report_received','complaint_to_police');
  const lawyer=any(f,'律师','lawyer-consulted','lawyer-hired');
  const dc=clamp(10+(worst?.damage===3?3:0)+Math.floor((l?.C??0)/10)+Math.min(6,q)-(r.reputation>=70?3:0)-(forgiven?4:0)-(r.reputation>=70&&r.relations.chief>=3?2:0)-(lawyer?1:0)+(any(pf,'医闹升级','unrest_escalated')?2:0),2,19);
  const face=runDie(r,'court:case'),filed=!!worst&&!!l&&l.level>=3&&l.causal&&face<dc;
  const exported=any(f,'prescriptions-exported','prescription-exported','药代-4统方','统方'),rebate=any(f,'kickback-received','rebate-received','药代-5回扣','回扣');
  const corruption=exported||rebate;let rate=(rebate?.5:.25)+Math.min(.3,.05*q);if(r.talents.includes('T28'))rate=Math.min(1,rate*2);
  // 03 §2.5: the photographed prescription increases discovery only if stage 3+
  // was already accepted at that time; a complaint never creates corruption.
  const photoDay=r.authored?.seen['E-028'];
  if(photoDay!==undefined&&['药代-3挂名','药代-4统方','药代-5回扣'].some(key=>{
    const day=r.authored?.activeFacts[key]?.day??r.facts[key]?.day;return day!==undefined&&day<=photoDay;
  }))rate=Math.min(1,rate*2);
  const falseProject=any(f,'paper-submitted-false','research-lied-inquiry','科研-造假','科研-撤稿','科研-通报','撤稿','BTF-004:knowingly_false_submission','BTF-004:reply_false','BTF-004:scapegoat_statement');
  const tamperingDiscovered=r.patients.some(p=>{const pf=patientFacts(r,p);return any(pf,'tampered','record_tampered')&&any(pf,'tampering-discovered','audit_document_received','formal_reply_submitted');})||any(f,'record-tampered-discovered');
  let review:EndingAssessment['review'];
  if(!seeds.length&&q>0&&runDie(r,'court:review')<=Math.min(18,q)){
    const pool=r.patients.map(p=>({p,A:r.hazards.filter(h=>h.scope.kind==='patient'&&h.scope.id===p.uid).reduce((n,h)=>n+Math.max(0,h.weight),0)})).filter(x=>x.A>0);
    let draw=runRandom(r,'court:review:patient')*pool.reduce((n,x)=>n+x.A,0);const picked=pool.find(x=>(draw-=x.A)<0);if(picked)review={patientId:picked.p.uid,A:picked.A};
  }
  return{q,fees,seeds,worst,liability:l,review,night:occurredPhase==='夜班',paid,forgiven,reported,filed,dc,face,corruption,corruptionCaught:corruption&&runRandom(r,'court:corruption')<rate,systemInfection:any(f,'hospital-infection-system')||r.day>=15&&runRandom(r,'court:system-infection')<.03,falseProject,tamperingDiscovered};
}
function chosen(r:EndingRun,event:string){return r.committed.some(id=>id.includes(event));}
function lastEventOutcome(r:EndingRun,event:string){return [...r.authored?.ledger.outcomes??[]].reverse().find(o=>o.eventId===event);}
/** Older saves already record the failed E-198-a result, but missed its flag.
 * An occurrence, retained recording, or a different failed conversation is not an upload. */
function collapseVideoPublished(r:EndingRun,f:Set<string>):boolean{
  const outcome=lastEventOutcome(r,'E-198');
  if(outcome)return outcome.choiceId.endsWith('E-198-a')&&!outcome.success||outcome.choiceId.endsWith('E-198-c');
  return f.has('视频上网');
}
function mature(r:EndingRun){return r.day>=15||r.phase==='tribunal'||r.phase==='ending';}
function currentSeeds(r:EndingRun):SeedHistory[]{return r.patients.filter(p=>p.damage>=2&&p.caseId!=='C020').flatMap(p=>r.hazards.filter(h=>h.scope.kind==='patient'&&h.scope.id===p.uid&&h.causal).map(h=>({runId:r.id,caseId:p.caseId,trapId:p.clinical?.causalChoices.find(id=>h.choiceId.includes(id))??h.choiceId.replace(`${p.uid}:`, '').replace(/:\d+$/,'')})));}
export interface EndingEligibility {eligible:boolean;missing:string[];evidence:string[]}
export interface RouteClosure {id:string;title:string;status:'resolved'|'pending'|'escalated';text:string;sources:string[]}
/** Only an actually opened line gets a page; promises keep their unfinished state. */
export function documentedRouteClosures(r:EndingRun):RouteClosure[]{
  const f=facts(r),seen=r.authored?.seen??{},outcomes=r.authored?.ledger.outcomes??[],result:RouteClosure[]=[];
  const add=(id:string,sources:string[],status:RouteClosure['status'],text:string)=>{if(sources.length)result.push({id,title:DOCUMENTED_ROUTES.find(d=>d.id===id)!.title.replace(/线.*$/,'记录'),status,text,sources});};
  const have=(...ids:string[])=>ids.filter(id=>seen[id]!==undefined||f.has(id)||outcomes.some(o=>o.eventId===id));
  const unrest=r.patients.filter(p=>[...patientFacts(r,p)].some(k=>/^unrest_|医闹/.test(k)));
  if(unrest.length){const escalated=unrest.some(p=>any(patientFacts(r,p),'unrest_escalated','医闹升级')),complete=unrest.every(p=>patientFacts(r,p).has('unrest_3_success'));add('2.1',unrest.map(p=>p.uid),escalated?'escalated':complete?'resolved':'pending',escalated?'家属已经把材料交给上级主管部门。录音、病程与各次答复按患者分别存档。':complete?'三次沟通已经完成。家属结束投诉，原始录音仍由家属保存。':'双方已经交换过材料，尚未完成的答复仍列在医务科待办中。');}
  const audit=have('E-153','E-156','E-157','飞检-进驻','飞检-通报');
  add('2.2',audit,f.has('飞检-通报')?'escalated':seen['E-157']!==undefined?'resolved':'pending',f.has('飞检-通报')?'飞检结论已经通报，相关费用和整改要求列在通知中。':'已提交的病历留有签收记录。尚未收到书面结论的部分继续等待核查。');
  const billed=r.patients.filter(p=>p.charged>0);add('2.3',billed.map(p=>p.uid),'resolved',`本轮病组超支中已经结算的个人负担合计 ${money(billed.reduce((n,p)=>n+p.charged,0))}。各患者的实际费用、预算与已付金额分列，没有重复扣款。`);
  const hidden=r.patients.filter(p=>any(patientFacts(r,p),'1224','denial_recorded','hidden_history_causal','allergy_known','hidden_cause'));
  add('2.4',hidden.map(p=>p.uid),hidden.some(p=>p.damage>=2)?'escalated':'resolved',hidden.some(p=>p.damage>=2)?'补问的内容与原始回答都保留下来。是否与损害有关，要对照各自患者的后续经过。':'补充的病史已交给后续接诊者，原来的否认和后来查明的内容分别记录。');
  const questioned=have('E-027','E-028','E-029','质疑-1回扣'),post=lastEventOutcome(r,'E-028'),reply=lastEventOutcome(r,'E-029');
  const closed=reply?.choiceId.endsWith('E-029-a')&&reply.success;
  const explained=!post&&!reply&&f.has('质疑-化解');
  const postDeleted=post?.choiceId.endsWith('E-028-b')&&post.success;
  const complaint=!postDeleted&&(f.has('质疑-3投诉')||!!post&&(!post.success||post.choiceId.endsWith('E-028-c')));
  const requested=post?.choiceId.endsWith('E-028-a');
  add('2.5',questioned,closed||explained||postDeleted&&!reply?'resolved':reply?.success===false||complaint?'escalated':'pending',
    closed?'医务科收下了你的书面说明，这起投诉已经结案。原始处方和投诉材料一并留档。':
    reply?.choiceId.endsWith('E-029-a')?'医务科要求补充说明，投诉还没有结案。':
    reply?.choiceId.endsWith('E-029-b')?'主任接下了投诉材料。你还没收到处理结果。':
    reply?.choiceId.endsWith('E-029-c')?'挂号费和药费已经退还，退款记录还在。医院尚未通知投诉结案。':
    explained?'患者听完了用药和费用的解释，没再追问回扣的事。':
    postDeleted?'患者删了帖子。你们的私信还在，处方原件也留着。':
    complaint?'帖子还在，患者继续向医院投诉。这件事还没处理完。':
    requested?'医务科收到了处方和情况说明。你申请由医院回应，还没收到答复。':
    seen['E-028']!==undefined?'同事发来了处方帖子，还没有收到这件事处理完的消息。':'患者问起了用药和费用，后续答复还没完成。');
  const drug=[...f].filter(k=>/^药代-/.test(k));add('2.6',drug,any(f,'药代-退款','药代-上交')?'resolved':any(f,'药代-4统方','药代-5回扣','药代-约谈')?'escalated':'pending',any(f,'药代-退款','药代-上交')?'已退回或上交的款项有登记。此前发生的往来仍保留原记录。':any(f,'药代-4统方','药代-5回扣')?'处方明细与实际收款留下了记录。后来拒绝邀请或归还借款，没有撤销此前的行为。':'已经发生的接触和收款分别登记。未接受的邀请没有计成已收报酬。');
  const research=[...f].filter(k=>/^科研-|^paper-|^BTF-004:/.test(k));add('2.7',research,any(f,'科研-造假','科研-撤稿','paper-submitted-false','BTF-004:knowingly_false_submission')?'escalated':any(f,'科研-诚实','paper-submitted-clean','BTF-004:honest_submission','BTF-004:project_refused')?'resolved':'pending',any(f,'科研-造假','paper-submitted-false','BTF-004:knowingly_false_submission')?'已经提交的稿件与核查记录一起保存，知情时间和本人签署的内容仍需说明。':any(f,'科研-诚实','paper-submitted-clean','BTF-004:honest_submission')?'稿件已按核实过的资料提交，署名与各自完成的工作分开登记。':'未完成的核查、未获同意的署名与尚未提交的稿件仍各列一项，没有写成已经发表。');
  const family=[...f].filter(k=>/^家庭-|^wedding-|^father-/.test(k));add('2.8',family,any(f,'丧亲','家庭-丧亲','father-deceased')?'escalated':any(f,'家庭-出院','家庭-婚礼已到','wedding-attended')?'resolved':'pending',any(f,'丧亲','家庭-丧亲','father-deceased')?'家里办完了后续手续。已经支付的费用与尚未清偿的借款留在同一本账里。':any(f,'家庭-出院')?'家人已经出院，接送与剩余费用按此前实际安排办理。':'已经到场、已经转出的款项与未完成的安排分别记下。账单没有因为轮转结束而消失。');
  const politics=have('E-041','E-053','E-054','E-195','知情','互相把柄','举报人');add('2.9',politics,any(f,'互相把柄','举报人')?'escalated':'pending','本人签过的材料、已经提出的异议与仍未兑现的人手安排分别存档。同事的工作由实际承担者说明。');
  const health=have('E-073','E-199','E-212','health-open','自身健康线开启');add('2.10',health,any(f,'已就诊')?'resolved':'pending',any(f,'已就诊')?'专科就诊记录已经放回体检袋，复查日期写在预约单上。':'自己的异常报告仍在，尚未完成的就诊需要继续安排。');
  return result;
}
export function endingEligibility(r:EndingRun,id:string,options:EndingOptions={}):EndingEligibility{
  if(!definitions.has(id))return{eligible:false,missing:['未定义的结局'],evidence:[]};
  const a=assessEnding(r,options.occurredPhase),f=facts(r),l=a.liability,pf=a.worst?patientFacts(r,a.worst):new Set<string>(),response=options.response??r.tribunalResponse??'facts';
  const requested=options.requested===id,atEnd=mature(r)||!!options.early||requested;
  const health=any(f,'health-open','自身健康线开启','健康-开启')&&(r.authored?.seen['E-212']!==undefined||any(f,'health-report-abnormal','未就诊','已就诊'));
  const repeat=(r.priorSeeds??[]).some(old=>old.runId!==r.id&&currentSeeds(r).some(now=>now.caseId===old.caseId&&now.trapId===old.trapId));
  const lampCount=new Set((r.lampSignals??[]).map(x=>`${x.patientId}:${x.nodeId}`)).size||[...f].filter(k=>k.startsWith('lamp-flash:')).length;
  const validRequested=requested&&(['X21','X22'].includes(id)?r.vitals.san<=0||chosen(r,id==='X21'?'E-200':'E-201'):id==='X23'?chosen(r,'E-202'):id==='X24'?chosen(r,'E-205')||chosen(r,'E-200')&&r.relations.family>=3||r.depression>=75:id==='X06'?a.corruption:['X31','X32'].includes(id)?options.early==='quit'||chosen(r,'E-209')||f.has('resign-requested'):false);
  const acquittal=(a.filed||any(pf,'prosecuted'))&&a.worst?.damage===3&&!any(pf,'autopsy-done','autopsy_completed')&&!!l&&l.D<10&&l.R<30&&runRandom(r,'court:acquittal')<.1;
  const suspended=a.filed&&response==='admit'&&a.paid&&a.forgiven&&!acquittal;
  const exempt=a.filed&&!!l&&l.L>=50&&l.L<60&&a.forgiven&&!acquittal;
  const checks:Record<string,[boolean,string][] >={
    X01:[[a.filed,'同一患者满足刑事移交条件'],[!suspended&&!exempt&&!acquittal,'不符合缓刑、免刑或无罪情形']],
    X02:[[a.filed,'同一患者满足刑事移交条件'],[response==='admit','本人选择认罪认罚'],[a.paid,'医院已经实际赔偿'],[a.forgiven,'该患者家属出具了谅解']],
    X03:[[a.filed,'已进入刑事处理'],[!!l&&l.L>=50&&l.L<60,'责任分值为50至59'],[a.forgiven,'该患者家属出具了谅解']],
    X04:[[a.filed||any(pf,'prosecuted'),'已经被起诉'],[!!a.worst&&a.worst.damage===3,'对应患者死亡'],[!any(pf,'autopsy-done','autopsy_completed'),'未能完成尸检'],[!!l&&l.D<10&&l.R<30,'病历完整且诊疗过错有限'],[runRandom(r,'court:acquittal')<.1,'二审证据复核结果符合']],
    X05:[[!!l&&l.level===2,'同等责任'],[a.reported,'该患者纠纷已经报警'],[runRandom(r,'court:nonprosecution')<.4,'检察审查作出不起诉决定']],
    X06:[[a.corruption,'实际发生统方或回扣'],[a.corruptionCaught||validRequested,'有关行为已被调查发现']],
    X07:[[!!l&&l.level>=3&&!a.filed||!!a.review&&a.review.A>=30,'主要以上责任未进入刑事，或抽卷发现严重履职问题']],
    X08:[[a.filed&&!acquittal&&(!exempt||suspended),'本案作出生效刑事处罚']],
    X09:[[a.fees>=60||[...f].filter(k=>/^audit-interview-failed:/.test(k)).length>=2||(r.authored?.ledger.outcomes??[]).filter(o=>['E-155','E-156'].includes(o.eventId)&&!o.success).length>=2,'费用问题或两次飞检约谈失败达到追回条件']],
    X10:[[a.fees>=40,'实质费用问题'],[any(f,'drug-question-report-confirmed','举报查实')||(r.authored?.ledger.outcomes??[]).some(o=>o.eventId==='E-028'&&!o.success),'举报已核实']],
    X11:[[a.tamperingDiscovered||a.falseProject,'不实病历或项目材料已被发现']],
    X12:[[a.systemInfection,'医院独立发生院感系统事件']],
    X13:[[!!l&&l.level===3&&!a.filed,'对应损害由医院承担主要民事责任，未受刑事处理']],
    X14:[[!!l&&l.level>=1&&l.level<=2,'次要或同等临床损害责任']],
    X15:[[!!l&&l.concealmentDefence,'具体病史询问记录且隐瞒与本次损害有关']],
    X16:[[!!l&&l.tampered,'受损患者的相关病历被本人篡改']],
    X17:[[r.exhausted>=2||options.early==='stamina','第二次体力耗尽'],[!a.night,'发生在白天']],
    X18:[[health,'自己的异常体检报告已送达'],[r.exhausted>=1||r.vitals.stamina<=0,'曾经体力耗尽']],
    X19:[[collapseVideoPublished(r,f),'体力耗尽的视频已经传到网上'],[r.reputation<20,'声望低于二十']],
    X20:[[r.exhausted>=2||options.early==='stamina','第二次体力耗尽'],[a.night,'发生在夜班']],
    X21:[[r.vitals.san<=0||options.early==='san'||validRequested,'精神状态不能继续工作'],[!a.night,'发生在白天']],
    X22:[[r.vitals.san<=0||options.early==='san'||validRequested,'精神状态不能继续工作'],[a.night,'发生在夜班']],
    X23:[[chosen(r,'E-202')||r.patients.some(p=>patientFacts(r,p).has('san-wrong-record-discovered'))||any(f,'san-wrong-record-discovered'),'精神耗尽后写错病历且被质控发现']],
    X24:[[r.depression>=75&&r.relations.family>=2||validRequested,'家人接走并完成离岗安排']],
    X25:[[r.emotionalBreaks>=2||options.early==='emotion','第二次情绪崩溃并停止履职']],
    X26:[[r.depression>=75,'抑郁严重'],[r.relations.family<2,'没有家人支持']],
    X27:[[any(f,'家庭-婚事','wedding-planned'),'家庭事项是婚礼'],[any(f,'家庭-婚礼未到','wedding-absent'),'没有到场'],[!any(f,'家庭-婚事已付','wedding-paid','wedding-half-paid','wedding-gift-paid'),'没有承担支出'],[r.relations.family===0,'家人关系破裂']],
    X28:[[r.uncoveredDays>=RULES.debtGrace||options.early==='interest','连续两个结算日的近期实际日均收入不足以覆盖当日利息']],
    X29:[[r.debt>50000||options.early==='debt','信用债务超过五万元']],
    X30:[[any(f,'卖车','car-sold','家庭-卖车'),'实际出售车辆'],[r.debt+r.privateDebt>0,'卖车后仍有债务']],
    X31:[[options.early==='quit'||any(f,'resign-requested','quit-confirmed')||validRequested,'本人已确认离职'],[!a.corruption,'无实际统方或回扣']],
    X32:[[options.early==='quit'||any(f,'resign-requested','quit-confirmed')||validRequested,'本人已决定离职'],[a.corruption,'有实际统方或回扣']],
    X33:[[atEnd,'本轮结束'],[!a.seeds.length,'无严重临床损害']],
    X34:[[atEnd,'本轮结束'],[r.depression>=50||r.income<0||any(f,'liaison-job-obtained'),'抑郁持续、绩效为负或已取得院外岗位']],
    X35:[[atEnd,'本轮结束'],[r.relations.chief<=1||any(f,'annual-evaluation-low')||!!a.review&&a.review.A>=15&&a.review.A<30,'评价不合格或需补训']],
    X36:[[atEnd,'本轮结束'],[!a.seeds.length,'无严重临床损害'],[r.reputation>=70&&r.relations.chief>=4&&r.relations.peer>=3,'得到主任与同事认可']],
    X37:[[[...f].filter(k=>k.startsWith('defensive-transfer:')).length>=talentNotPresentThreshold({talents:r.talents,debuffs:r.debuffs,day:r.day,memory:r.talentMemory},6),'推诿性转诊次数达到当前门槛'],[r.hazards.reduce((n,h)=>n+Math.max(0,h.weight),0)<20,'隐患总量低于二十']],
    X38:[[r.patients.some(p=>p.caseId==='C020'&&any(patientFacts(r,p),'autopsy_discussed','rights_given')&&any(patientFacts(r,p),'autopsy-consented','autopsy_consented')),'尸检已告知且家属实际签字同意']],
    X39:[[r.patients.some(p=>{const pf=patientFacts(r,p);return any(pf,'recording-exists','recording_full')&&['unrest_1_success','unrest_2_success','unrest_3_success'].every(x=>pf.has(x));}),'同一患者全程录音且三拍沟通均成功']],
    X40:[[repeat,'前后两局同一陷阱都导致严重损害']],
    X41:[[r.talents.includes('T01'),'选有第六感'],[lampCount>=8,'实际提示至少八次'],[r.vitals.san>0&&!any(f,'SAN归零','san-ever-zero'),'精神从未归零'],[!a.seeds.length,'无严重临床损害']],
  };
  const required=checks[id]??[],missing=required.filter(([met])=>!met).map(([,label])=>label);
  return{eligible:missing.length===0,missing,evidence:required.filter(([met])=>met).map(([,label])=>label)};
}
export function chainAnnexes(r:Run):string[]{
  const rr=r as EndingRun,result:string[]=[];
  for(const chain of rr.authored?.chains??[]){const world={day:r.day,cash:r.cash,ap:r.ap,facts:chain.facts.map(f=>f.type),actorAvailable:false,final:true};const view=butterflyResolutionView(routeButterfly(chain,world),world);result.push(`${view.title}\n${view.text}`);}
  if(r.receivable>0)result.push(`借给同事的钱还有 ${money(r.receivable)} 未收回，金额和还款日期保留在聊天记录里。`);
  if(r.privateDebt>0)result.push(`私人借款尚余 ${money(r.privateDebt)}，与银行借贷分别记在账上。`);
  const f=facts(rr);
  if(any(f,'shift-covered'))result.push(any(f,'li-family-help-done')?'李恂按约在家人出院那天到场，委托与签收照片留在聊天里。':any(f,'li-favor-used')?'李恂已经兑现过一次顶班。后来每份材料仍由各自实际经历的人说明。':'李恂仍欠你一段时间，结束轮转时这次帮忙尚未兑现。');
  if(any(f,'recording-exists'))result.push(any(f,'record-official-received')?'医务科已签收原始录音，家属仍保留副本。':'家属仍持有原始录音。尚未送达的材料继续等待办理交接。');
  if(any(f,'li-false-witness'))result.push('替同事签下的查体证明还在。复核会对照当时的实际查房经过。');
  if(any(f,'丧亲','家庭-丧亲','father-deceased'))result.push('家里的衣柜多出一层空格。母亲把留下的衣服叠好，没有再往里放。');
  if(any(f,'liaison-job-obtained'))result.push('联络岗位的聘用文件已经送达。以后，那些带条件的电话会先打到你这里。');
  result.push(...documentedRouteClosures(rr).map(c=>`${c.title}\n${c.text}`));
  result.push(...courtPreparationNotes(r));
  return [...new Set(result)];
}
function attachmentIds(r:EndingRun,main:string,options:EndingOptions):string[]{
  const ids=['X09','X10','X11','X13','X14','X15','X16','X24','X26','X30','X37','X38','X39','X40','X41'].filter(id=>id!==main&&endingEligibility(r,id,options).eligible).sort((a,b)=>priority(b)-priority(a)||a.localeCompare(b));
  if(['X01','X02'].includes(main))ids.unshift('X08');
  if(ids.includes('X16'))return ids.filter(id=>!['X13','X14','X15'].includes(id));
  if(ids.includes('X15'))return ids.filter(id=>!['X13','X14'].includes(id));
  return ids;
}
export function documentedEnding(r:Run,id:string,options:EndingOptions={}):DocumentedEnding{
  const rr=r as EndingRun,def=definitions.get(id);if(!def)throw new Error(`Unknown ending ${id}`);
  const eligibility=endingEligibility(rr,id,options);if(!eligibility.eligible)throw new Error(`${id} prerequisites missing: ${eligibility.missing.join('；')}`);
  const a=assessEnding(rr),[decision,baseEpilogue]=id==='X14'&&a.paid?PAID_SETTLEMENT_PROSE:ENDING_PROSE[id],annexIds=attachmentIds(rr,id,options),annexes=chainAnnexes(rr);
  for(const annex of annexIds){const prose=annex==='X14'&&a.paid?PAID_SETTLEMENT_PROSE:ENDING_PROSE[annex];annexes.push(`${definitions.get(annex)!.title}\n${prose[0]}\n${prose[1]}`);}
  for(const note of rr.authored?.endNotes??[])if(note.trim()&&!annexes.includes(note.trim()))annexes.push(note.trim());
  for(const note of eventFactNotes(rr))if(!annexes.includes(note))annexes.push(note);
  if(a.liability&&['X01','X02','X03','X05','X07','X13','X14','X15','X16'].some(x=>x===id||annexIds.includes(x))){const l=a.liability,monthly=RULES.wages*2,month=2026*12+8+Math.ceil(l.personalRecovery/monthly);annexes.push(`医疗损害赔偿明细\n${a.worst!.name}：总损失 ${money(l.loss)}；医院按${l.levelName}责任承担 ${money(l.hospitalCompensation)}。${l.personalRecovery?`个人追偿 ${money(l.personalRecovery)}；按每月 ${money(monthly)} 扣还测算，绩效扣至 ${Math.floor(month/12)} 年 ${month%12+1} 月。`:'已购医责险承担个人追偿部分。'}`);}
  let epilogue=baseEpilogue;if(id==='X34'&&any(facts(rr),'liaison-job-obtained'))epilogue='第一天上班，你把医院门禁卡放进抽屉。新工作群里有几个熟悉的名字。';
  return{id,title:def.title,category:def.category,decision,epilogue,annexes,court:['刑事','行政','民事'].includes(def.category),annexIds,sourceId:def.id,liability:a.liability,seedHistory:currentSeeds(rr)};
}
export const PAID_SETTLEMENT_PROSE=['医务科结算回执：已经接受的赔偿方案完成付款，医院与个人部分分别列在凭证中。家属是否出具谅解仍另行记录。','你把付款凭证放回文件袋，核对了一遍收款人和金额。']as const;
export function earlyEnding(r:Run,kind:NonNullable<EndingOptions['early']>,occurredPhase=interruptionPhase(r)):Ending{
  const a=assessEnding(r,occurredPhase),options:EndingOptions={early:kind,occurredPhase};
  const id=kind==='san'?(a.night?'X22':'X21'):kind==='stamina'?(a.night?'X20':'X17'):kind==='emotion'?'X25':kind==='interest'?'X28':kind==='debt'?'X29':a.corruption?'X32':'X31';
  return documentedEnding(r,id,options);
}
export function tribunalEnding(r:Run,response:'facts'|'admit'|'silent'):Ending{
  const rr=r as EndingRun,a=assessEnding(rr),options:EndingOptions={response};
  if(a.worst&&(a.liability?.level??0)>=3&&a.liability?.causal)r.roll={id:'court:case',kind:'tribunal',face:a.face,modifier:0,dc:a.dc,success:a.face>=a.dc,label:'立案审查'};
  for(const id of MAIN_ENDINGS)if(endingEligibility(rr,id,options).eligible)return documentedEnding(r,id,options);
  if(a.worst)return{id:'X14',title:'调解',category:'民事',decision:`本次损害已完成复核，医院按已核实的${a.liability!.levelName}责任处理。`,epilogue:ENDING_PROSE.X14[1],annexes:chainAnnexes(rr),court:true,annexIds:attachmentIds(rr,'X14',options),sourceId:'X14',seedHistory:currentSeeds(rr)} as DocumentedEnding;
  return documentedEnding({...r,day:Math.max(15,r.day)},'X33',options);
}
