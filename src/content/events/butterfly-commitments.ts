import type {Run,Card}from '../../game/types';
import type {AuthoredDirectorState,ButterflyCommitmentCard}from '../../game/director';
import type {ButterflyState,ButterflyWorld}from './butterfly';
import type {EventPhase}from './types';
import {RULES}from '../../game/rules';
import {approvedDeadlineChanges}from './butterfly-deadlines';
import {isPlayerResponsibleForPatient}from './clinical-ownership';
import {patientAssessmentComplete}from '../../game/care-completion';

type Commitment=ButterflyState['commitments'][number];
interface Delivery {title:string;text:string;label:string;result:string;actor?:Card['actor'];}

/** A delivery may use only the matching materials and the person actually
 * doing this task. The player's own review never depends on Li being on duty. */
export function commitmentDelivery(r:Run,s:AuthoredDirectorState,chain:ButterflyState,c:Commitment,w:ButterflyWorld):Delivery|undefined{
 if(c.status!=='accepted'||/cover_accepted/.test(c.type)||(c.resumeDay??0)>r.day)return;
 const f=new Set(w.facts),p=r.patients.find(p=>p.uid===chain.subjects.patientId);
 const li=!s.actor.liAwayDays.includes(r.day),zhou=!s.actor.zhouAwayDays.includes(r.day);
 const original=f.has('original_file_retained')||f.has('zhou_saw_original')||f.has('source_materials_received');
 if(c.type==='deadline_change_requested'){
  const change=approvedDeadlineChanges({...r,authored:s},chain)[0];if(!change)return;
  return{title:'确认获准的改期',text:`经办人同意把清单里一项不紧急的事务从第 ${change.from} 天改到第 ${change.to} 天，等你确认是否改期。原来的期限还没到；抢救、临床处置和对方没答应延期的费用，仍按原时间处理。`,label:'确认采用这项改期，保留其他任务的原时间',result:`这项待办的截止日期改为第 ${change.to} 天。其他任务没有随之延期，已经发生的逾期也没有撤销。`};
 }
 if(c.type==='clinical_explanation_accepted'){
  if(!chain.subjects.projectId||!original)return;
  return{title:'答应周乔的临床解释',text:'周乔列出了这个项目里需要解释的临床术语和病例纳入标准。你答应写这部分说明，她负责核查资料，各自完成后交给对方。',label:'按现有原始资料写明临床依据，把不明确的部分列出',result:'你把临床说明交给周乔，写清哪些情况适用、哪些还不能确定。患者没做过的检查，你没有写成已经做过；周乔那份核查还得等她交付。'};
 }
 if(/verification|labor_exchange|contribution_division/.test(c.type)){
  if(!chain.subjects.projectId||!original||c.type!=='self_verification_accepted'&&(!zhou||!f.has('zhou_saw_original')))return;
  const self=c.type==='self_verification_accepted';
  return{title:'逐项核对原始资料',actor:self?undefined:'research',text:self?'你把自己保管的来稿和原始资料并排打开，按之前列出的项目逐项核对。':'周乔按约带来同一项目的材料，你们打开已经收到的那份文件。核对只涉及这次认领的工作。',label:self?'完成本人认领的核对并留下记录':'核对约定的项目，签认各自完成的部分',result:s.actor.datasetHasProblem?'核对后，你发现分组记录与汇总结果对不上，在核查记录里写明了具体缺项、原件来源和发现时间，确认这份资料有实质问题。':'原始分组和汇总结果对得上。你在核查记录里写下资料来源和核对时间，这次没有发现实质矛盾。'};
 }
 if(c.type==='source_delivery_requested'){
  if(!chain.subjects.projectId||!zhou)return;
  return{title:'资料发送方的回执',actor:'research',text:'原发送方回复了，将同项目的资料发给周乔。她打开附件，等你一起确认收到了哪些文件。',label:'核对项目和附件，记录周乔已收到',result:'周乔确认文件齐了：“我先看，看完再找你。”核查还没做，原件也没另发到你的个人账户。'};
 }
 if(c.type==='source_preservation_requested'){
  if(!chain.subjects.projectId||!f.has('original_file_retained'))return;
  return{title:'资料保管回执',text:'项目资料员发来清单，请你看看交了哪些文件、哪个版本，要作什么用。',label:'核对已交文件与保管回执',result:'资料员登记了文件和版本，收进项目档案。他只负责保管，不替你核查，也没把文件发给周乔。'};
 }
 if(c.type==='offer_return_requested'){
  const asset=s.ledger.modifiers.find(m=>m.id===chain.subjects.offerAssetId&&m.kind==='pending-asset'&&(m.value??0)>0);
  if(!asset)return;
  return{title:'待退回款的回执',text:`财务人员找出那笔尚未接受的 ${asset.value} 元，核对原付款人、退款渠道和你之前提出的退回登记。钱仍在待处理款中，没有记入你的可用余额。`,label:'核对原款，办理原路退回并签收回执',result:`财务人员确认 ${asset.value} 元已经原路退回，回执记明原转账和退款日期。这笔待处理款结清，没有扣你的生活费，也没有冲减其他私人借款。`};
 }
 if(c.type==='original_data_requested'){
  if(!chain.subjects.projectId)return;
  return{title:'原始资料的回复',actor:'research',text:'发送方回复了你的索取请求，给出本项目原始资料及允许核对的范围。附件还没有经过你的检查。',label:'核对项目与版本，接收本次资料',result:'你确认附件属于这次项目，保存了收到的版本和授权范围。现在有材料可以核对，是否存在实质问题仍待检查。'};
 }
 if(/record_delivery|formal_preservation/.test(c.type)){
  if(!p||!f.has('record_delivery_agreed'))return;
  if(c.source==='BTF-003:N04a'&&!chain.commitments.some(other=>other.type==='handoff_requested'&&other.source===c.source&&other.status==='completed'))return;
  return{title:'核验录音原件',text:'原件保管人按约提交了文件，医务科请你核对患者、日期与此前允许提交的范围。原件是否完整需要与交接清单逐项对照。',label:'核验患者、原件范围和接收回执',result:'你收到了这位患者获准提交的原文件，在清单里写明日期、保管人和谁可以接收。文件只交给指定的人核对，没有公开转发。'};
 }
 if(/matched_witness|collaborator_witness/.test(c.type)){
  if(chain.chain==='BTF-004'?!zhou:!li)return;
  const consent=chain.facts.some(f=>f.type==='witness_commitment')||w.facts.includes('witness_commitment');
  // Choosing a request consumed the permission but did not erase the consent.
  if(!consent&&!chain.consumedResources.includes('witness_commitment'))return;
  return{title:'亲历者的说明',actor:chain.chain==='BTF-004'?'research':'peer',text:'之前答应到场的亲历者按约带来自己的记录。复核人员先问参与时间，再问哪些事情是本人完成的。',label:'核对本人范围，接收签认后的说明',result:'亲历者签好说明，交了上去。他只证明自己做过的事；你负责的处置或投稿，仍需由你解释。'};
 }
 if(c.type==='witness_attendance_requested'){
  if(!p)return;
  return{title:'床旁共同说明',actor:'nurse',text:'姜蓉安排了在岗同事来到床旁。你把这次需要解释的事项和此前已经告知的内容分别交代给对方。',label:'共同说明现有安排，记录各自到场',result:'同事听完这次沟通，记下到场时间。他只能证明自己在场时听见的话，之前的谈话他没有听到。'};
 }
 if(/handoff/.test(c.type)){
  if(!p||!p.active||p.damage>=3||!isPlayerResponsibleForPatient({...r,authored:s},p))return;
  const nurse=/alternative|successor/.test(c.type);if(!nurse&&!li)return;
  const unfinished=!patientAssessmentComplete(p);
  if(!nurse&&f.has('favor_one_ward_review')&&(c.type!=='handoff_requested'||unfinished))return;
  if(unfinished)return{title:'把未完成的诊疗交清',actor:nurse?'nurse':'peer',text:nurse?'姜蓉带着同意接班的医生来核对患者。你把已经做过的事、还没排除的风险和待回报的检查逐项交代，接班医生对照病历确认。':'李恂来到床旁。你把已经做过的事、还没排除的风险和待回报的检查交代给他，他对照病历逐项确认。',label:'当面交清未决事项，确认接班者签收',result:'接班医生签收了这位患者今天剩下的诊疗工作，你也把值班电话交给他。没做完的检查和待定的出院安排仍列在病历里，下次接班时还要核对。'};
  return{title:'交清床旁待办',actor:nurse?'nurse':'peer',text:nurse?'姜蓉带着同意接班的医生来核对这张床。你们对照已完成的诊疗记录，列出今天尚待复评的事项。':'李恂按约来接班。你们对照这位患者已有的诊疗记录，核对今日待办、用药和需要继续观察的问题。',label:'逐项交接，并确认接班者完成今日复评',result:'接班医生签收待办，完成了这位患者今天的床旁复评。你今天不用再查这张床，原病程、已经付过的费用和仍需观察的问题都留在记录里。'};
 }
 if(c.type==='time_help_accepted'||c.type==='time_help_requested'){
  const player=c.source==='BTF-002:N01d';if(!player&&!li)return;
  return{title:'约好的那趟手续',actor:player?undefined:'peer',text:player?'李恂按约发来材料和经办窗口。你核对齐后，按约去办这趟手续。':'李恂按约回来，带着你交给他的材料和经办回执。',label:'核对所办事项与回执',result:player?'你办完手续，把回执交还李恂。你们确认这次帮忙已经完成，原有借款金额不变，这趟也没有借出新的钱。':'这趟手续已经办完，回执与原材料对应。李恂完成了约定的帮忙，原有借款仍按实际转账结算。'};
 }
 if(/family_delegation_requested|family_delegate_requested/.test(c.type)){
  if(!f.has('family_delegate_agreed'))return;
  return{title:'家里发来的代办回执',actor:'mother',text:'弟弟把约好代办的手续办完，发来回执，请你核对姓名和办理事项。缴费、本人签字和不能代办的部分另列，没有一并算作完成。',label:'逐项核对代办回执，留下尚未办妥的事',result:'回执对应这次已同意代办的事项。你确认手续已办完，把尚未缴费和必须本人办理的部分继续留在清单上。'};
 }
 if(c.type==='family_attendance_chosen'){
  if(!f.has('family_event'))return;
  return{title:'赶到家人身边',actor:'mother',text:'你按说好的时间赶到，母亲把已经办过的事和还要跑的窗口指给你看。医院那边未交清的患者事项仍由原交班记录核对。',label:'陪家人办理这次约好的事务',result:'你陪家里人办完这趟事，确认各自接下来负责的部分。病区里没交完的工作还得另行交接，这趟也没替家里付账单。'};
 }
 if(c.type==='division_requested'){
  if(!li)return;
  return{title:'确认约好的分工',actor:'peer',text:'李恂带着日程来找你：“说清楚，哪段是我顶班，哪段是帮你跑资料，别到时候全算我头上。”',label:'核对时段，各自确认负责范围',result:'你们把时间和分工对上了。额外患者没交接，资料也还没查，那些得另安排。'};
 }
 if(c.type==='liaison_role_accepted'){
  if(!f.has('liaison_offer_received')||!f.has('liaison_position_vacant')||f.has('review_opened')||f.has('cooperation_ended'))return;
  return{title:'办公室的任命通知',actor:'chief',text:`唐济让办公室发来正式分工，联络岗位由你接任。从明天起，每天要留出 ${RULES.butterfly.liaisonDailyAp} 行动、${RULES.butterfly.liaisonDailyMinutes} 分钟办联络，没有额外工资。`,label:'核对职责与生效时间，签收任命通知',result:'你签收了通知，明天开始干这份活。此前的款项和资料交换仍要按原记录接受核查。'};
 }
 return;
}

export function butterflyCommitmentCard(r:Run,s:AuthoredDirectorState,chain:ButterflyState,c:Commitment,w:ButterflyWorld,phase:EventPhase,id=`${c.id}:fulfil:${r.day}`):ButterflyCommitmentCard|undefined{
 const delivery=commitmentDelivery(r,s,chain,c,w);if(!delivery)return;
 return{id,kind:'story',title:delivery.title,text:delivery.text,actor:delivery.actor,scope:chain.scope,patientId:chain.subjects.patientId,chain:chain.chain,butterflyCommitment:{chainStateId:chain.id,commitmentId:c.id,phase},options:[
   {id:`${id}:complete`,label:delivery.label,ap:0,minutes:0,cost:0,effects:{},result:delivery.result+(r.day>c.due?' 原约定日期已经过去，逾期经过和今天的完成时间分别保留。':'')},
  {id:`${id}:defer`,label:'今天先不办理，保留原来的期限',ap:0,minutes:0,cost:0,effects:{emotion:-1},result:'今天没有完成这项约定。你答应的事还没办完，允许办理的范围和截止时间也都没变。'},
 ]};
}
