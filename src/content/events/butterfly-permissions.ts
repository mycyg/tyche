import type {Card,Run}from '../../game/types';
import type {ButterflyState,ButterflyWorld}from './butterfly';
import {RULES}from '../../game/rules';
import {runRandom}from '../../game/run-random';
import {deadlineCandidates}from './butterfly-deadlines';

export type PermissionKind='limited-costs'|'public-explanation'|'joint-meeting'|'loan-terms'|'record-materials'|'research-witness'|'family-delegation'|'deadline-change'|'project-split'|'joint-statement'|'funding-review'|'privacy-scope';
export interface ButterflyPermissionCard extends Card {butterflyPermission:{chainStateId:string;kind:PermissionKind};}
export const PERMISSION_FACTS:Record<PermissionKind,string>={'limited-costs':'limited_patient_authorization','public-explanation':'public_authorization','joint-meeting':'meeting_commitment','loan-terms':'unconditional_terms_received','record-materials':'record_delivery_agreed','research-witness':'witness_commitment','family-delegation':'family_delegate_agreed','deadline-change':'deadlines_may_extend','project-split':'project_split_agreed','joint-statement':'joint_statement_agreed','funding-review':'funding_review_terms','privacy-scope':'privacy_scope_limited'};
export const permissionActor=(kind:PermissionKind):Card['actor']=>({'loan-terms':'rep','public-explanation':'auditor','research-witness':'research','family-delegation':'mother','deadline-change':'chief','project-split':'research','funding-review':'auditor','privacy-scope':'auditor'}as Partial<Record<PermissionKind,Card['actor']>>)[kind];

/** Actual permission is an interaction, not a deduction from a relationship
 * score. A failed request cannot unlock disclosure, a meeting or a loan. */
export function butterflyPermissionCards(r:Run,chain:ButterflyState,w:ButterflyWorld,offeredId?:string):ButterflyPermissionCard[]{
 const f=new Set(w.facts),requests:PermissionKind[]=[];
 if(chain.status==='closed'&&!f.has('privacy_scope_requested'))return[];
 if(chain.chain==='BTF-003'){
  if(chain.cursor.endsWith(':N02')&&f.has('patient_can_express'))requests.push('limited-costs');
  if(chain.cursor.endsWith(':N03')&&r.journal.some(j=>j.scope.kind==='patient'&&j.scope.id===chain.subjects.patientId))requests.push('public-explanation');
  if(chain.cursor.endsWith(':N06')&&f.has('patient_can_express'))requests.push('joint-meeting');
  if(f.has('holder_contacted')&&(chain.cursor.endsWith(':N04')||chain.commitments.some(c=>/record_delivery|formal_preservation/.test(c.type)&&c.status==='accepted')))requests.push('record-materials');
 }
 if(chain.chain==='BTF-004'&&chain.cursor.endsWith(':N07')&&f.has('verification_completed')&&!r.authored?.actor.zhouAwayDays.includes(r.day))requests.push('research-witness');
 if(chain.chain==='BTF-002'&&f.has('written_terms_requested')&&!f.has('conditional_offer_accepted')&&!f.has('offer_refused'))requests.push('loan-terms');
 if(f.has('commitment_collision')){
  requests.push('family-delegation');
  if(r.day<RULES.days&&deadlineCandidates(r).length)requests.push('deadline-change');
 }
 if(chain.chain==='BTF-004'&&chain.subjects.paymentId&&f.has('verification_completed'))requests.push('project-split');
 if(f.has('same_review_received')&&f.has('witness_commitment')&&!f.has('selective_disclosure'))requests.push('joint-statement');
 if(chain.subjects.paymentId&&(f.has('exchange_performed')||f.has('project_accepted')))requests.push('funding-review');
 if(f.has('privacy_scope_requested'))requests.push('privacy-scope');
 const text:Record<PermissionKind,[string,string,string,string,string]>={
  'limited-costs':['先问患者愿意说到哪里','患者刚才说，不想再让家里借钱。你准备向家属谈费用，得先问清他愿意告诉谁、哪些话可以说。','询问本次费用沟通的对象与范围','患者指定了接收信息的家属，同意你只谈这次费用和可以调整的安排，其他私下说过的话不要转述。你把范围记下。','患者不愿让你转述刚才私下说的话。必要的病情和治疗告知，仍按原流程办理。'],
  'public-explanation':['公开说明前的审批','医务科要求先审核拟公开的说明。你可以提出申请，只用已核实、获准使用的内容回应，患者隐私不能随录音一起发出去。','提交说明范围，申请本次公开回应','医务科核对后批准了这次说明的范围，限定接收渠道，并要求保留原始材料。授权不包括无关的私人内容。','医务科没有批准这次公开说明，要求继续核对材料。现有资料不能因此直接发到外面。'],
  'joint-meeting':['约双方当面谈','患者和家属都还在，但还没有约好一起谈。你需要分别询问他们是否愿意到场，不能替任何一方答应。','分别询问双方，约定这次会谈','患者和家属分别确认愿意到场，也同意不播放录音。你记下约定时间，各自仍可以决定谈到哪里。','双方没能约好到场，这次谈话还没定下来。需要继续沟通的事，你都留在待办里。'],
  'loan-terms':['写明条件的回复','叶茗回复了你对借款条件的询问，金额和期限写在消息里。她这次提出不附带业务交换的私人借款，是否接受由你决定。','核对借款金额与归还日期','你读完一万元的借款条件，记下七天后的归还日期。这次没有答应收款，余额和私人借款都尚未改变。','你暂时不看这份回复，也没有收款。家里的缴费安排仍按原来的日期。'],
  'record-materials':['原件交给谁','你联系上这段录音的保管人。对方问清了接收人和用途，还没有答应把文件交出来。','确认原件范围、接收人员与本次核对用途','保管人同意按这次争议的范围提交原文件，限定交给医务科核对。你记下联系方式与约定，文件还要当面核验接收。','保管人没有同意这次交付。你记下答复，目前仍未取得原件，也不能把剪辑片段写成完整录音。'],
  'research-witness':['问周乔能否到场','答辩前，你把涉及共同核对的问题发给周乔。她做过的工作有自己的记录，是否到场仍要由她答复。','请周乔只说明本人完成的那部分核对','周乔确认了到场时间：“我只说自己核过的。你怎么投稿、为什么用那份稿子，还得你自己答。”这次承诺只用于本项目的答辩。','周乔没有答应来，核查记录也还由她保管。这次你得自己回答，不能把她写成已经到场的证人。'],
  'family-delegation':['家里的事能交给谁','家里和医院的事撞在了同一时段。弟弟还没有答应代办，你需要把要办的手续、费用和需要本人到场的部分说清楚。','打电话问清能代办的事项，请家人答复','弟弟答应代办已经列明的手续，不能代签的部分仍留给本人。母亲把材料位置告诉他；这只是代办安排，还没有办完或缴费。','弟弟说这个时段抽不开身，没有答应代办。原来的手续和缴费时间都还在。'],
  'deadline-change':['分别问清截止时间','两边都在催。你把尚未过期的非急务列出来，问经办人哪些能够延后。临床处置和急救缴费不在这张清单里。','联系清单内的经办人，申请延后一天','经办人同意清单内的事项延后一天，等你确认采用新时间。清单以外的工作、急救费用和法定时限都没有改变。','经办人没有同意改期，你仍得在原来的截止时间前办完。'],
  'project-split':['能否保留独立完成的部分','周乔拿出已经核对过的工作记录。要把这部分独立保留，还需要确认资助约定允许拆分，并征得她本人同意。','核对合同范围，征询周乔与项目方的答复','项目方确认约定允许拆分，周乔同意单列自己的实际工作。未归属的报酬和署名必须随撤回部分放弃，已经发生的交换仍保留。','项目方和周乔没有一致同意拆分，合同仍按原约定执行，周乔那部分工作也还不能单列。'],
  'joint-statement':['先问对方怎么签','同一件事的两份记录正在复核。你请另一位亲历者确认是否愿意共同到场，只签自己做过的部分，并完整说明已知差异。','核对各自范围，取得共同签认答复','对方同意共同说明，各自签自己的内容，不隐去已知差异。签认还未进行，原件仍分别保管。','对方没有同意这次共同签认。你可以提交自己的材料，不能替对方作证或签字。'],
  'funding-review':['资助材料里的签字页','核查人员请你核对同一项目的收款凭证、来稿和一份待签责任声明。哪些材料亲自掌握、哪些义务已经承担，需要先按原件分清。','核对两份材料及本次需要说明的范围','收款记录与资料原件核对完成。你收到了待签的责任声明；在签署前，可以分别说明自己实际参与的部分，但不能否认已经知道的实质问题。','款项凭证或资料原件还没收齐，你也没核清要说明哪些事，因此没有签责任声明。还没拿到的材料仍列为缺件。'],
  'privacy-scope':['复核材料的阅读范围','你已经申请不要传播与本次争议无关的私人内容。复核人员把原件和相关片段分列，问你限定的范围及理由。实质证据不能因此隐去。','指出无关私人内容，申请限定接收人员','复核方同意限制无关私人内容的接收范围，原件封存保留。与争议有关的内容继续核对，没有删改材料，也没有替患者同意公开。','复核方没有批准限制阅读范围，在回复里写了理由。原件和待查事项都保留着，目前仍按原来的范围接收材料。'],
 };
 return requests.flatMap(kind=>{
  if(chain.status==='closed'&&kind!=='privacy-scope')return[];
  const id=`${chain.id}:permission:${kind}`;
  if(r.authored?.published[id]&&id!==offeredId||r.committed.some(c=>c.startsWith(`${id}:`))||f.has(PERMISSION_FACTS[kind]))return[];
  if(kind==='loan-terms'&&runRandom(r,`${chain.id}:unconditional-offer`)>=RULES.butterfly.unconditionalOfferChance)return[];
  const [title,opening,label,pass,fail]=text[kind],loan=kind==='loan-terms';
  const deadlines=kind==='deadline-change'?deadlineCandidates(r).map(c=>`${c.family?'家庭出资答复':c.kind==='paper'?'论文提交':'已接受的工作'}：第 ${c.from} 天 → 第 ${c.to} 天`).join('；'):'';
  return[{id,title,text:deadlines?`${opening}\n本次申请：${deadlines}。`:opening,kind:'story' as const,actor:permissionActor(kind),scope:chain.scope,patientId:chain.subjects.patientId,chain:chain.chain,butterflyPermission:{chainStateId:chain.id,kind},options:[
   {id:`${id}:ask`,label,ap:loan?0:1,minutes:loan?0:10,cost:0,effects:{emotion:-1},result:pass,...(loan?{}:{check:{skill:kind==='joint-meeting'?'comfort' as const:'persuade' as const,dc:RULES.butterfly.permissionDc,purpose:'取得这次明确的授权或到场答复',failure:{emotion:-3},failureText:fail}})},
   {id:`${id}:defer`,label:'暂不提出申请，保留原有范围',ap:0,minutes:0,cost:0,effects:{emotion:-2},result:loan?fail:'你没有提出新的申请。原来允许的范围不变，没有新增授权或会谈承诺。'},
  ]}];
 });
}
