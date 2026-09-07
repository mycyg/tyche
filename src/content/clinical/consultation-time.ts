import type { ClinicalGraph, GraphOption } from './types';

/** Design 01 §6 consultation ledger. Values are explicit source-local metadata,
 * not runtime label matching. Zero means no separately elapsed arrival wait.
 * Source C001/C012 state additional arrival waits outside the option table. */
export const CONSULTATION_TIMES: Record<string, Record<string, {wait:number; active?:number; reason:string}>> = {
  C001:{s5_consult:{wait:20,active:15,reason:'申请15分钟；下一节原文另列到场20分钟'}},
  C003:{s4_gi_consult:{wait:30,reason:'总40分钟中保留10分钟申请与评估'}},
  C004:{s5_gi:{wait:5,reason:'预约胃镜不在本次等待内'},s5_cardio:{wait:5,reason:'保留5分钟讨论抗凝计划'}},
  C005:{s4_neurosurg:{wait:10,reason:'保留10分钟评估与意见'}},
  C007:{s4_cardio:{wait:20,reason:'保留10分钟专科评估'}},
  C010:{s5_nephro:{wait:5,reason:'保留10分钟评估与协调'},s5_icu:{wait:0,reason:'电话申请床位，无到场等待'}},
  C011:{s5_airway:{wait:0,reason:'团队呼叫与气道准备并行，12分钟主动处置'}},
  C012:{s3_urgent:{wait:12,active:10,reason:'申请10分钟；下一节原文另列到场12分钟'},s3_phone:{wait:0,reason:'电话咨询，无到场等待'},s3_routine:{wait:0,reason:'仅开单，普通会诊延迟保留原临床后果'},s4_second:{wait:30,reason:'保留15分钟高级医师评估'}},
  C015:{s2_mero_approved:{wait:25,reason:'保留15分钟审批讨论与开立方案'},s2_pharmacist:{wait:5,reason:'保留5分钟药师核对'}},
  C016:{s3_psych:{wait:15,reason:'保留15分钟精神状态评估'}},
  C017:{s4_cxr:{wait:0,reason:'胸片与联络同步，没有额外等待'},s5_npo:{wait:0,reason:'补液监护与联络并行，没有额外等待'}},
  C018:{s3_renal:{wait:10,reason:'保留10分钟专科讨论'},s5_defer:{wait:0,reason:'医保支付政策说明，不是临床会诊'}},
  C019:{s2_mother:{wait:0,reason:'主动评估母体与胎心，联络并行'},s4_hbo:{wait:4,reason:'保留8分钟评估三人'},s4_obst:{wait:0,reason:'转入产科共同评估，非等待到场'},s4_ped:{wait:0,reason:'转科监护与纠正低血糖，非等待到场'}},
};

export function applyConsultationTime(graph:ClinicalGraph,option:GraphOption):void {
  const spec=CONSULTATION_TIMES[graph.id]?.[option.id];
  if(!spec)return;
  option.mechanics!.consultWaitMinutes=spec.wait;
  if(spec.active!==undefined)option.minutes=spec.active+spec.wait;
  if(graph.id==='C012'&&option.id==='s3_urgent') {
    const busy=option.modifiers?.find(m=>'variant'in m.when&&m.when.variant==='surgeon_busy');
    if(busy)busy.minutes=50;
    option.mechanicsVariants=[...(option.mechanicsVariants??[]),{when:{variant:'surgeon_busy'},mechanics:{consultWaitMinutes:40}}];
  }
  if(graph.id==='C010'&&option.id==='s5_nephro')
    option.mechanicsVariants=[...(option.mechanicsVariants??[]),{when:{variant:'no_dialysis'},mechanics:{consultWaitMinutes:5}}];
  if(graph.id==='C016'&&option.id==='s3_psych')
    option.mechanicsVariants=[...(option.mechanicsVariants??[]),{when:{variant:'no_night_psych'},mechanics:{consultWaitMinutes:0}}];
}
