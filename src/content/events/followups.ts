import type {Run,Card,Option,Scope}from '../../game/types';
import type {EventPhase}from './types';
import {liability}from './ending-adapter';
import {talentDisputeSettlement}from '../../game/talents';
import {getClinicalGraph}from '../clinical';
import {playerClinicalSource}from '../../game/discharge-responsibility';
import {isPlayerResponsibleForPatient}from './clinical-ownership';
export interface DisputeState {patientId:string;stage:1|2|3|4;first:boolean;second:boolean;settled?:boolean;suppressionCount?:number;stage3due?:number;}
export interface SourceFollowup extends Card {sourceFollowup:{kind:'dispute'|'denial-record'|'superior-evidence'|'settlement'|'forgiveness'|'nurse-report'|'police-report'|'police-receipt';patientId:string;stage?:number;};}
const scope=(id:string):Scope=>({kind:'patient',id});
const choice=(id:string,label:string,result:string,effects:Option['effects']={},ap=0):Option=>({id,label,result,effects,ap,minutes:ap*12,cost:0});
const flag=(uid:string,name:string)=>`clinical:${uid}:${name}`;
/** Only material already present in this run can open these records. */
export function buildSourceFollowups(r:Run,phase:EventPhase):SourceFollowup[]{
 const s=r.authored;if(!s)return[];const cards:SourceFollowup[]=[],state=s.dispute;
 const actual=(key:string)=>!!s.activeFacts[key]||!!r.facts[key];
 const published=(id:string)=>!!s.published[id];
 if(r.day>=13&&phase==='交班'){
  const infused=r.patients.find(p=>p.active&&p.inpatient&&p.damage<3&&p.clinical?.choices.some(id=>getClinicalGraph(p.caseId)?.nodes.flatMap(n=>n.options).some(o=>o.id===id&&/静脉|输液/.test(o.label))));
  const id=`${r.id}:source-nurse-infusion-report`;
  if(infused&&!published(id))cards.push({id,kind:'story',actor:'nurse',title:'输液核对的签名',text:`护士长带来${infused.name}的输液核对表：有一项核对没有按要求完成。她请你把责任写成医嘱交代不清，再签字交上去。输液经过与各人的实际操作仍需要分别核实。`,scope:scope(infused.uid),patientId:infused.uid,sourceFollowup:{kind:'nurse-report',patientId:infused.uid},options:[
   choice(`${id}:sign`,'按她提出的原因签字','你在报告上承担了这次差错，护士长收走签字页。原始输液核对表仍在。',{relations:{nurse:2},hazards:[{type:'R',weight:15,reason:'签字承担输液核对差错',norm:'按实际操作区分责任',causal:false}],flags:[flag(infused.uid,'infusion_responsibility_signed')]}),
   choice(`${id}:refuse`,'拒绝代担，保留原始核对表','你拒绝代签。护士长收回表格，此后的夜间配合明显慢了下来。',{relations:{nurse:-3},flags:['nurse-night-cooperation-delayed']}),
  ]});
 }
 const patient=state?r.patients.find(p=>p.uid===state.patientId):r.patients.find(p=>p.active&&p.inpatient&&p.damage<3&&isPlayerResponsibleForPatient(r,p));
 if(patient&&r.day>=2&&phase==='查房'&&(!state||state.stage===1)){
  const id=`${r.id}:source-unrest:1`,uid=patient.uid;
  if(!published(id))cards.push({id,kind:'story',title:'先把方案说清楚',text:`${patient.name}的家属打开录音设备，说明会完整保留这次谈话。他们等你解释治疗方案和费用，也想知道目前还有哪些事不能确定。`,scope:scope(uid),patientId:uid,sourceFollowup:{kind:'dispute',patientId:uid,stage:1},options:[
   {...choice(`${id}:explain`,'当面说明，并给一份书面说明','你说明方案与费用，留下书面说明。家属接受了这次解释，录音仍由家属保存。',{patience:20,flags:[flag(uid,'unrest_1_success'),flag(uid,'recording-exists')]},2),check:{skill:'comfort',dc:12,purpose:'说明治疗计划与费用',failure:{flags:[flag(uid,'recording-exists')],hazards:[{type:'C',weight:10,reason:'首次方案与费用沟通未达成理解',norm:'向同一患者及受托家属说明',causal:false}]},failureText:'家属仍有疑问，书面说明没有把问题说清楚。完整录音继续由家属保存。'}},
   choice(`${id}:ignore`,'继续工作，暂不回应','你没有回应这次询问。家属把未回答的问题也录了下来。',{emotion:-5,hazards:[{type:'C',weight:10,reason:'未回应同一患者家属的方案询问',norm:'告知与沟通',causal:false}],flags:[flag(uid,'recording-exists')]}),
   choice(`${id}:office`,'请医务科到场，一起完整说明','医务科到场后与你一起说明方案，现场记录和录音分别保存。',{reputation:-3,flags:[flag(uid,'unrest_1_success'),flag(uid,'recording-exists')]},2),
  ]});
 }
 if(state&&patient&&state.stage===2&&r.day>=7&&phase==='结算'){
  const id=`${r.id}:source-unrest:2`,uid=patient.uid;if(!published(id))cards.push({id,kind:'story',title:'录音与病程',text:`医务科收到${patient.name}家属递交的剪辑录音，称查房敷衍、病历迟记。医务科要对照完整病程和原始材料，核实家属说的这些情况。`,scope:scope(uid),patientId:uid,sourceFollowup:{kind:'dispute',patientId:uid,stage:2},options:[
   {...choice(`${id}:review`,'与家属谈，出示完整病程','双方对照完整病程核对后，家属接受了说明，医务科结束这次投诉。',{flags:[flag(uid,'unrest_2_success')]}),check:{skill:'record',dc:13,purpose:'核对完整病程与录音时间',failure:{flags:[flag(uid,'unrest_filed')]},failureText:'提交材料仍没有解释清楚时间差，医务科将未答事项备案。'}},
   choice(`${id}:file`,'按流程登记，保留双方材料','你完成登记，家属的疑问仍未解决。',{reputation:-5,hazards:[{type:'C',weight:10,reason:'家属提交材料后告知争议尚未解决',norm:'保留同一患者的真实沟通过程',causal:false}],flags:[flag(uid,'unrest_filed')]}),
   choice(`${id}:chief`,'请主任出面','主任接过材料，答应继续联系双方。目前还没有形成和解结果。',{relations:{chief:-1},flags:[flag(uid,'unrest_filed')]}),
  ]});
  if(cards.at(-1)?.id===id&&talentDisputeSettlement({talents:r.talents,debuffs:r.debuffs,day:r.day,memory:r.talentMemory},2))cards.at(-1)!.options.push(choice(`${id}:settle`,'与家属私下谈清，确认投诉和解','你把家属最在意的问题逐一说清，双方签收和解记录。本次投诉结束，原始录音与诊疗经过仍保留。',{flags:[flag(uid,'unrest_2_success'),flag(uid,'unrest_private_settlement')]},1));
 }
 if(state&&patient&&state.stage===3&&r.day>=Math.max(13,state.stage3due??0)&&phase==='结算'){
  const id=`${r.id}:source-unrest:3:${state.suppressionCount??0}`,uid=patient.uid,settled=state.settled||state.second,suppressed=!settled&&actual(`complaint-suppressed:${uid}`);
  if(!published(id))cards.push({id,kind:'story',title:suppressed?'暂时没有递出的材料':'最后一次答复',text:`${patient.name}${patient.active?'仍在病区接受治疗':'已经离开病区'}。医务科与家属核对这几次答复，原始录音没有删除。`,scope:scope(uid),patientId:uid,sourceFollowup:{kind:'dispute',patientId:uid,stage:3},options:[choice(`${id}:${suppressed?'delay':'confirm'}`,suppressed?'保留待答清单，确认明日再谈':settled?'确认沟通结束，交付完整答复':'收取主管部门来函，准备继续说明',suppressed?'家属暂时没有继续递交材料。被你隐去的情况仍未说清，医务科把问题留待下次谈话。':settled?'家属向你说了声谢谢，表示这次投诉已经结束。手机里的完整录音仍保留着。':'家属将材料递交上级主管部门，要求继续核查。医院收下来函，保留你的历次答复。',suppressed?{clear:[`complaint-suppressed:${uid}`],flags:[flag(uid,'unrest_suppressed_once')]}:settled?{san:-3,flags:[flag(uid,'unrest_3_success')]}:{reputation:-15,emotion:-15,hazards:[{type:'C',weight:20,reason:'同一患者的告知争议升级到主管部门',norm:'核对历次实际沟通与答复',causal:false}],flags:[flag(uid,'unrest_escalated'),
   // DK-1 entry. Only a harmed patient's escalated dispute names one family
   // member; an ordinary complaint or a settled dispute names nobody.
   ...(patient.damage>=1?['伤医-施暴者已确定',`伤医-家属:${uid}`,`伤医-施暴者:family:${uid}`]:[])]})]});
 }
 if(phase==='交班'||phase==='结算')for(const p of r.patients){
  const policeId=`${p.uid}:source-police-report`,receiptId=`${p.uid}:source-police-receipt`;
  const disputeKnown=actual(flag(p.uid,'unrest_escalated'))||actual(`complaint:${p.uid}`)||actual(`family-record:${p.uid}`)||r.journal.some(j=>j.scope.kind==='patient'&&j.scope.id===p.uid&&/报警|举报|投诉/.test(j.result));
  if(p.damage>=2&&p.caseId!=='C020'&&playerClinicalSource(r,p)&&disputeKnown&&!published(policeId))cards.push({
    id:policeId,kind:'story',title:'家属决定报案',text:`${p.name}的家属到医务科说，他们准备就此前的诊疗经过向公安机关报案。工作人员请双方保留原始记录，不要在走廊继续争吵。报案是否受理、是否立案，还要由有关机关另行审查。`,scope:scope(p.uid),patientId:p.uid,sourceFollowup:{kind:'police-report',patientId:p.uid},options:[
      choice(`${policeId}:records`,'核对材料清单，如实说明自己经手的部分','家属提交了报案材料，你提交对应的诊疗记录和书面说明。两份材料分别登记，原件没有改动。',{san:-3,flags:[flag(p.uid,'police_report_submitted')]},1),
      choice(`${policeId}:office`,'由医务科对接，保持联络','家属自行递交了报案材料。医务科负责联系，通知你保留资料并等候询问。',{emotion:-5,flags:[flag(p.uid,'police_report_submitted')]}),
    ]});
  const reportSource=r.facts[flag(p.uid,'police_report_submitted')]??s.activeFacts[flag(p.uid,'police_report_submitted')];
  if(reportSource&&r.day>reportSource.day&&!published(receiptId))cards.push({id:receiptId,kind:'story',title:'报案受理回执',text:`医务科转来${p.name}一方的报案受理回执，患者姓名和所涉日期均与这次纠纷对应。回执仅说明报案材料已受理，并不代表已经立案或认定了责任。`,scope:scope(p.uid),patientId:p.uid,sourceFollowup:{kind:'police-receipt',patientId:p.uid},options:[choice(`${receiptId}:file`,'核对姓名、日期和受理编号，归档回执','回执已经归档。你保留了原始诊疗记录，之后按通知提供说明。是否立案仍待审查。',{san:-2,flags:[flag(p.uid,'police_report_received')]})]});
  const uid=p.uid,denial=s.ledger.facts.some(f=>f.scope.kind==='patient'&&f.scope.id===uid&&['隐瞒-被抓','隐瞒-家属证实','隐瞒-记录'].includes(f.id)),denialId=`${uid}:source-denial-record`;
  if(denial&&!published(denialId)&&!actual(flag(uid,'1224_recorded')))cards.push({id:denialId,kind:'story',title:'把前后两次陈述分开记',text:`${p.name}最初的回答与后来核实的病史不同。原记录仍在，补充记录需要分别注明询问内容、患者原话和新信息来源。`,scope:scope(uid),patientId:uid,sourceFollowup:{kind:'denial-record',patientId:uid},options:[choice(`${denialId}:record`,'如实补记询问、否认与后来核实内容','你把前后两次陈述和信息来源分开写清，没有把新信息倒填成当时已经知道。',{flags:[flag(uid,'1224_recorded')]},1),choice(`${denialId}:keep`,'保留原件，暂不补记','原件保留，新核实的内容尚未完整写入。',{emotion:-2})]});
  const retained=s.ledger.facts.some(f=>f.scope.kind==='patient'&&f.scope.id===uid&&f.id==='留证'),evidenceId=`${uid}:source-superior-evidence`;
  if(retained&&(s.seen['E-156']!==undefined||actual('飞检-约谈'))&&!published(evidenceId))cards.push({id:evidenceId,kind:'story',title:'提交上级指示原件',text:`稽核组请你说明${p.name}那张处方的签署经过。你保存了主任当时的聊天记录，但尚未把原件交给核查人员。`,scope:scope(uid),patientId:uid,sourceFollowup:{kind:'superior-evidence',patientId:uid},options:[choice(`${evidenceId}:deliver`,'核对患者和时间，将完整记录交给稽核组','稽核组实际收到完整记录，签收单注明患者、日期和材料范围。',{flags:[flag(uid,'superior_order_recorded')]},1),choice(`${evidenceId}:keep`,'继续自行保管','你没有提交原件。自己保存的材料尚未进入核查卷宗。',{emotion:-3})]});
  const compensationId=`${uid}:source-compensation`,paid=actual(flag(uid,'compensated'));
  if(p.damage>=2&&p.caseId!=='C020'&&playerClinicalSource(r,p)&&r.day>=7&&!published(compensationId)&&!paid){
   const estimate=liability(r,p),cash=estimate.personalRecovery;
   cards.push({id:compensationId,kind:'story',title:'书面调解方案',text:`医务科与${p.name}的家属就费用达成一份书面方案：医院支付 ¥${estimate.hospitalCompensation.toLocaleString('en-US')}，按院内安排向你追偿 ¥${cash.toLocaleString('en-US')}。家属同意先按这份方案收款，是否出具谅解仍由家属另行决定。`,scope:scope(uid),patientId:uid,sourceFollowup:{kind:'settlement',patientId:uid},options:[choice(`${compensationId}:pay`,'同意方案，落实付款并收好凭证','医院按方案支付，个人部分按约结算。付款凭证对应这位患者，谅解书尚未签署。',{cash:-cash,flags:[flag(uid,'compensated')]},2),choice(`${compensationId}:review`,'保留方案，申请继续复核','你没有同意付款，请医务科继续核对方案，赔偿还没有支付。',{emotion:-5},1)]});
  }
  const forgivenessId=`${uid}:source-forgiveness`;
  if(paid&&!published(forgivenessId)&&s.ledger.commits.includes(`${compensationId}:pay`)){
   cards.push({id:forgivenessId,kind:'story',title:'到账后的决定',text:`${p.name}的家属确认赔偿已到账。医务科请他们另外决定是否出具谅解书；赔偿到账后，他们仍有权拒绝。`,scope:scope(uid),patientId:uid,sourceFollowup:{kind:'forgiveness',patientId:uid},options:[choice(`${forgivenessId}:ask`,'说明经过，请家属独立决定','你说明已经发生的经过，请家属自行决定，等待书面答复。',{},1),choice(`${forgivenessId}:stop`,'尊重家属，暂不再请求','你没再请求谅解，家属也没有签谅解书。已经支付的赔偿仍归家属。',{emotion:-3})]});
  }
 }
 for(const card of cards)if(card.sourceFollowup.kind==='dispute'){
  const delta=s.ledger.modifiers.filter(m=>m.target==='same-patient-dispute-dc'&&m.starts<=r.day&&m.expires>=r.day&&m.scope.kind==='patient'&&m.scope.id===card.patientId).reduce((n,m)=>n+(m.value??0),0);
  for(const option of card.options)if(option.check)option.check.dc+=delta;
 }
 return cards;
}
