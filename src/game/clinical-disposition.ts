import type {Patient} from './types';
import {getClinicalGraph} from '../content/clinical';

export interface ClinicalDisposition {
  kind:'stay'|'transfer'|'home'|'self-transfer'|'death-review';
  destination?:string;
  planned?:boolean;
  sourceOptions:string[];
  basis:string;
}
type Rule={kind:'transfer'|'home'|'self-transfer';destination:string;planned?:boolean;options:string[];flags?:string[];outcomes?:string[];variants?:string[]};
/** Exact source actions, not prose/label matching. A consultation request,
 * transfer discussion or future-day outcome narration cannot release a bed. */
export const CLINICAL_DISPOSITION_RULES:Readonly<Record<string,readonly Rule[]>>={
 C001:[
  {kind:'transfer',destination:'接收医院小儿外科',options:['s6_transfer'],flags:['transferred']},
  {kind:'self-transfer',destination:'儿童医院（家属自行前往）',options:['s6_self'],flags:['self_transfer'],planned:false},
  {kind:'home',destination:'家中',options:['s5_discharge'],flags:['discharged'],planned:false},
 ],
 C002:[],
 C003:[{kind:'transfer',destination:'外院 PCI 中心',options:['s4_transfer_far'],flags:['far_transfer']}],
 C004:[],
 C005:[
  {kind:'home',destination:'家中',options:['s3_ct_home'],flags:['ct_only_home'],planned:false},
  {kind:'home',destination:'家中',options:['s4_outpatient'],flags:['sent_home'],planned:false},
  {kind:'home',destination:'家中',options:['s1_migraine'],flags:['treated_as_migraine'],outcomes:['o_delay','o_worst'],planned:false},
 ],
 C006:[
  {kind:'home',destination:'家中',options:['s3_discharge'],flags:['early_discharge'],planned:false},
  {kind:'home',destination:'家中',options:['s4_observe'],flags:['pt_awake'],outcomes:['o_good'],planned:true},
 ],
 C007:[
  {kind:'home',destination:'家中',options:['s4_abx_home'],flags:['sent_home_abx'],planned:false},
  {kind:'home',destination:'家中',options:['s1_scarlet'],flags:['treated_as_scarlet'],outcomes:['o_missed','o_worst'],planned:false},
  {kind:'home',destination:'家中',options:['s4_observe_3d'],flags:['observe_3d'],outcomes:['o_delay'],planned:false},
  {kind:'self-transfer',destination:'其他医院（家属自行离院，未完成接收交接）',options:['s5_inform'],flags:['refusal_persisted'],outcomes:['o_refuse'],planned:false},
 ],
 C008:[
  {kind:'transfer',destination:'上级医院儿科监护',options:['s5_transfer'],flags:['transferred']},
  {kind:'home',destination:'家中',options:['s3_discharge'],flags:['discharged'],planned:false},
  {kind:'home',destination:'家中',options:['s5_home_tomorrow'],flags:['sent_home'],planned:false},
 ],
 C009:[],C010:[],
 C011:[
  ...['s2_azith','s3_positive','s3_cef_test'].map(id=>({kind:'home' as const,destination:'离院后门诊随访',options:[id],outcomes:['o_good'],planned:true})),
  {kind:'home',destination:'离院后自行前往车站',options:['s5_observe30'],flags:['early_discharge'],outcomes:['o_biphasic'],planned:false},
 ],
 C012:[],
 C013:[
  {kind:'transfer',destination:'上级医院血管外科',options:['s5_transfer'],flags:['transferred']},
  {kind:'self-transfer',destination:'上级医院（家属自驾）',options:['s5_self'],flags:['self_transport'],planned:false},
  {kind:'home',destination:'家中',options:['s2_none'],flags:['sent_home'],planned:false},
  {kind:'home',destination:'家中',options:['s1_ortho'],outcomes:['o_home'],planned:false},
 ],
 C014:[
  {kind:'home',destination:'家属带离医院',options:['s4_ama'],flags:['ama_signed'],planned:false},
  ...['s1_agree','s3_discharge_dip','s3_transfer_op','s4_ama_oral'].map(id=>({kind:'home' as const,destination:'家中或门诊继续就诊',options:[id],flags:['discharged_unmet'],planned:false})),
 ],
 C015:[{kind:'home',destination:'社区继续输液',options:['s4_discharge_abx']}],
 C016:[{kind:'home',destination:'家中',options:['s4_discharge_now'],flags:['early_discharge'],planned:false}],
 C017:[],C018:[],
 C019:[
  {kind:'transfer',destination:'有高压氧舱的接收医院',options:['s5_hbo_yes','s6_handoff'],flags:['hbo_arranged','handoff_done'],variants:['no_chamber']},
  {kind:'home',destination:'家中',options:['s5_discharge'],flags:['premature_discharge'],planned:false},
 ],
 C020:[],
};

export const CLINICAL_DISPOSITION_AUDIT:Record<string,string>={
 C001:'监护转运、自行前往儿童医院、明确离院各有独立选择；术前准备本身不证明出院。',
 C002:'普通处方和复診建议不把住院者自动赶走；原门诊者按非住院结算结束。后续返院与ICU叙述不提前改今天位置。',
 C003:'只有已执行的外院转运清除本院床位；导管室启动、溶栓后联系转运、收CCU或床旁交接均不冒充外院已接收。',
 C004:'继续住院与后续胃镜、ICU观察；未有已执行离院选择。',
 C005:'明确开药回家与住院抗凝分开；两周后出院的结局预述不提前结束今天住院。',
 C006:'提前放行与观察后完成签字离院分开；护理补救或白班接手仍留观。',
 C007:'口服回家、约三日后复诊和拒绝后自行离院各留原事实；IVIG住院不因六周复查叙述清床。',
 C008:'医护陪同外院转运与拒绝后放行分开；收PICU/监护床属于继续住院，不把第14天出院预述当今天离院。',
 C009:'输血后继续住院；复苏后ICU与第九天转回病房属于后续病程。',
 C010:'申请ICU、候床和床旁肾内会诊不是完成转院；血液净化与监护继续属于住院照护。',
 C011:'替代用药后明确离院与过早结束观察分开；抢救后监护不视为离院。',
 C012:'协调手术与签署拒绝均不等于离院；本院手术及后续ICU不把患者写成外院转走。',
 C013:'救护车监护转运必须有实际s5_transfer和transferred；仅告知签字或明日再转仍留本院。',
 C014:'仅签署并办理自动出院或明确按低标准放行才离院；建议再住48小时继续占床。',
 C015:'明确出院带静脉药物去社区才结束本院照护；第七天出院或三个月后飞检是叙事预述。',
 C016:'明确提前出院才放行；精神科会诊及后续转科同意不等于已经交接离院。',
 C017:'引流、再手术评估、呼吸支持和源控制继续属于住院治疗。',
 C018:'继续独立处方、肾内科评估和线索上报不等于临床离院。',
 C019:'本院无舱且已安排转运并完成交接才转外院；本院高压氧、产儿科和监护仍在院；提前放行单列。',
 C020:'死亡确认和遗体移送按死亡调查流程处理，绝不记为出院康复或临床转院。',
};

export function clinicalDisposition(p:Pick<Patient,'caseId'|'clinical'|'damage'>):ClinicalDisposition {
 const state=p.clinical;
 const stay=():ClinicalDisposition=>({kind:'stay',sourceOptions:[],basis:CLINICAL_DISPOSITION_AUDIT[p.caseId]??'没有明确完成离院或外院接收的记录。'});
 if(!state||state.caseId!==p.caseId||!state.outcomeId||!getClinicalGraph(p.caseId)?.outcomes.some(o=>o.id===state.outcomeId))return stay();
 if(p.damage>=3)return {kind:'death-review',sourceOptions:state.choices.filter(id=>p.caseId==='C020'&&['s1_confirm','s4_morgue','s7_handoff'].includes(id)),basis:'已经存在的死亡状态保持不变，善后与临床转诊分别处理。'};
 for(const rule of CLINICAL_DISPOSITION_RULES[p.caseId]??[]){
  if(!rule.options.every(id=>state.choices.includes(id))
   ||(rule.flags&&!rule.flags.every(flag=>state.flags.includes(flag)))
   ||(rule.outcomes&&!rule.outcomes.includes(state.outcomeId))
   ||(rule.variants&&!rule.variants.every(v=>state.variants.includes(v))))continue;
  return {kind:rule.kind,destination:rule.destination,planned:rule.planned,sourceOptions:[...rule.options],basis:CLINICAL_DISPOSITION_AUDIT[p.caseId]};
 }
 return stay();
}
