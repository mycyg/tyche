import type {ClinicalGraph} from './types';
import type {Option} from '../../game/types';

/** Missing source failure prose gets explicit, case-specific narration. These
 * additions never revoke unconditional treatment/consent/report flags. */
const missing:Record<string,Record<string,string>>={
 C003:{s4_inform_lysis:'患者与家属尚未接受溶栓安排，这次没有取得治疗同意。'},
 C012:{s4_escalate:'你已把情况报给科主任和医务科，继续协调手术。几方仍没有谈拢。',s5_refuse_signed:'家属仍拒绝手术，并在拒绝记录上签了字。你没有劝动他们。'},
 C013:{s2_bedside_us:'床旁超声已经完成，但这次观察未能确认主动脉根部与心包的细节，仍需核对影像回报。',s5_inform:'病情与转诊风险已告知并签字。患者与家属仍有顾虑，这次谈话没有让他们安心。'},
 C014:{s1_exam:'本次查体未能确认呼吸费力与肺部体征的变化，尚不能据此判断已经达到出院条件。',s4_head:'主任或护士长参与了谈话，家属仍未接受继续住院的安排。',s6_dip_note:'病情依据已提交，但这次单议申请没有获批，原预算未改变。'},
 C015:{s1_ask:'患者没有讲清近期院外用药，实际用过哪些药仍待核实。',s5_backfill:'审批单已事后补填，但这次沟通没有消除补办程序上的争议。'},
 C016:{s1_bag:'你核对了药板和购药凭证，仍没能查清完整的服药经过，还需要继续问。',s3_mse:'这次访谈没有明确近期情绪、睡眠与就诊经过，仍需继续精神状态评估。'},
};

export function operationCheckPurpose(o:Option):string {
 if(o.check?.purpose)return o.check.purpose;
 const operation=o.mechanics?.checkOperation??o.mechanics?.operation;
 if(o.mechanics?.operation==='consent'&&operation==='comfort')return '能否让患者或家属理解处置并明确表达意愿';
 if(o.mechanics?.operation==='refusal-signature'&&operation==='comfort')return '能否在记录拒绝意见时重新达成治疗同意';
 if(operation==='history')return '能否问清这段病史';
 if(operation==='observe')return '能否识别并核实眼前的细节';
 if(operation==='record'||operation?.endsWith('-record')||operation==='refusal-signature')return '能否把这次处置和沟通完整记入文书';
 if(operation==='consult'||operation==='consult-wait')return '能否明确会诊意见与接手安排';
 if(operation==='comfort')return '能否让对方理解说明并回应当前安排';
 if(operation==='persuade')return '能否就这项请求达成一致';
 return ({observe:'能否核实眼前的信息',clinical:'能否按计划完成这项处置',record:'能否完整记录并通过审核',comfort:'能否缓解对方顾虑',persuade:'对方是否接受这项请求',endure:'能否承受这一轮压力'} as const)[o.check?.skill??'observe'];
}

export function applyClinicalCheckCopy(graph:ClinicalGraph){
 for(const node of graph.nodes)for(const o of node.options){
  if(!o.check)continue;
  if(o.check.failureText==='对方没有补充更多信息。'){
   const replacement=missing[graph.id]?.[o.id];
   if(!replacement)throw new Error(`Missing authored check failure narration: ${graph.id}/${o.id}`);
   o.check.failureText=replacement;
  }
  o.check.purpose=operationCheckPurpose(o);
  if(graph.id==='C013'&&o.id==='s5_inform')o.check.purpose='能否在告知并签字后缓解患者与家属的顾虑';
  if(graph.id==='C012'&&o.id==='s4_escalate')o.check.purpose='能否顺利协调手术安排';
  // Source weights remain in the effects ledger, not in patient dialogue.
  const original=o.check.failureText;
  o.check.failureText=original.replace(/\bD\s*\d+(?:\.\d+)?\s*[（(]([^）)]+)[）)]/g,'记录仍有缺项：$1')
   .replace(/\bD\s*\d+(?:\.\d+)?/g,'你还没有把这次处置记录完整。')
   .replace(/\bC\s*\d+(?:\.\d+)?/g,'你还没有把需要告知的内容解释完整。')
   .replace(/[、，；]?\s*(?:informed_failed|consent_attempted|note_incomplete)\b/g,'')
   .replace(/[，、；]+$/,'').trim();
  if(graph.id==='C018'&&o.id==='s5_signature')o.check.failureText='费用与风险已解释，但书面确认仍有缺项，尚未完成签署。';
  if(graph.id==='C018'&&o.id==='s7_complete')o.check.failureText='这次病程记录仍有缺项，需要继续核对处置、告知与线索流转的经过。';
  if(graph.id==='C020'&&o.id==='s3_family')o.check.failureText='家属仍未接受这份说明，谈话没有平息疑问。你需要继续交代已经确认的事实与尚待核实的事项。';
  if(graph.id==='C017'&&o.id==='s7_family')o.check.failureText='家属仍对病情和升级处置有疑问。这次谈话让你感到疲惫，病程记录仍可继续完成。';
 }
 graph.normalizationNotes.push('检定目的按原操作区分问诊、观察、安抚、说服与文书；原文未写失败对白处补充相应叙述，不撤销原无条件执行的治疗、告知、签字或报告。失败隐患数值保留在结算字段，玩家文案只说明实际缺项。');
}
