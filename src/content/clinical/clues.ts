import type {IntuitionClue} from '../../game/talents';
import type {ClinicalGraph,ClinicalGraphState,GraphCondition} from './types';
import {graphCondition} from './runtime';

export interface ClinicalHiddenClue extends IntuitionClue {
  revealFlags:string[];
  source:string;
}
interface AuthoredClue extends ClinicalHiddenClue {revealed:GraphCondition;when?:GraphCondition;}
const flag=(name:string):GraphCondition=>({flag:name});
const any=(...names:string[]):GraphCondition=>({any:names.map(flag)});
function clue(caseId:string,id:string,text:string,direction:IntuitionClue['direction'],revealFlags:string[],revealed:GraphCondition=any(...revealFlags),when?:GraphCondition):AuthoredClue {
  return {id:`${caseId}:${id}`,text,direction,revealFlags,revealed,when,source:`04_病例库/${caseId}#3-底牌`};
}
/** These are history, carried medication, witness statements or existing records.
 * No unrequisitioned imaging, laboratory result or diagnosis is returned. */
const clues:Record<string,AuthoredClue[]>={
  C001:[clue('C001','groin-history','母亲回忆：右侧大腿根的疙瘩以前哭闹时出现、躺平后消失；昨天下午开始一直没有回去。','history',['hernia_hx'])],
  C002:[clue('C002','alcohol-history','他平时每天饮白酒约 250 毫升，持续 20 年；今天午餐还喝了约 100 毫升。妻子以为他这几天没有喝酒。','history',['alcohol_known'])],
  C003:[clue('C003','exertional-pain','她承认下午上楼时曾上腹发闷、出冷汗，休息约 10 分钟后缓解；因担心家里卧床的老伴无人照顾，一直没有提起。','history',['exertional'])],
  C004:[
    clue('C004','transferred-medication','长期医嘱仍有华法林；入院第 1 天又加用了甲硝唑，此后未复查凝血。需要核对相互作用和当前出血情况。','medication',['interaction_found']),
    clue('C004','black-stool','夜班护理记录写有“大便一次、颜色深”。患者回忆昨夜排黑便，今晨刷牙时牙龈出血。','history',['melena_known']),
    clue('C004','herbal-powder','她入院后仍在服用自购三七粉，并没有服用她所说的铁剂。','medication',['herb_known']),
  ],
  C005:[clue('C005','contraceptive','她已经连续服用复方口服避孕药 3 个月，母亲并不知情；她请求把相关病史作为个人隐私妥善保管。','medication',['ocp_known'])],
  C006:[
    clue('C006','diabetes-card','手机医疗急救卡写着“1 型糖尿病，胰岛素治疗”；随身包中有胰岛素笔和血糖仪。','medication',['dm_known']),
    clue('C006','meal-and-insulin','他晚餐前使用胰岛素后吃得很少，又喝了酒；晚间长效胰岛素已用过，不能当作尚未注射再补一次。','medication',['insulin_known'],flag('insulin_known'),flag('pt_awake')),
  ],
  C007:[clue('C007','true-fever-days','奶奶证实前三天也发热，她一直给孩子服退热药；真正病程已经是第 6 天，而不是第 3 天。','history',['day6_known'])],
  C008:[clue('C008','outside-injection','父亲补充：孩子前天已精神差、吃奶少，昨天在村里诊所打过一针头孢；病程是 3 天，不是 1 天。','medication',['pretreated'])],
  C009:[clue('C009','reported-blood-type','31 床老人记得 3 年前手术输血时，医生说她是 O 型。她的自述必须和这一次标本、配血报告及腕带逐项核对，不能代替本次血型鉴定。','history',['self_type_O'])],
  C010:[
    clue('C010','home-potassium','患者承认晚餐后服过自带的氯化钾缓释片，没有告诉护士；当前用药还包括螺内酯、缬沙坦，需逐项核对。','medication',['potassium_tab']),
    clue('C010','pump-alarm','家属承认输液泵报警后曾自行重启，实际输入量没有被确认。','history',['pump_alarm']),
  ],
  C011:[clue('C011','penicillin-record','既往急诊记录的过敏史栏写着“青霉素（皮疹）”。她小时候打青霉素后起过全身风团，并不是从未有过药物反应。','medication',['allergy_known'])],
  C012:[
    clue('C012','changed-pain','他承认凌晨开始腹痛从一阵一阵变成持续疼痛，位置固定在右下腹；怕给儿子添事，才说自己好多了。','history',['pain_changed']),
    clue('C012','night-analgesia','夜班用药记录有曲马多。镇痛后的主观缓解不能替代重新评估腹部体征。','medication',['tramadol_known']),
  ],
  C013:[clue('C013','stopped-pressure-drug','医保购药记录显示，上次购买的降压药只够用到两周前；他承认药已经吃完，没有续买。','medication',['med_stopped'])],
  C014:[clue('C014','night-alarm','母亲承认孩子夜里睡觉时监护仪响了三次，她把探头摘了。晨间一次清醒血氧不能说明整夜稳定，需要调取真实趋势或复测。','history',['night_alarm_known'],any('night_alarm_known','night_hypoxia'))],
  C015:[clue('C015','prior-antibiotic','随身诊所输液单写着已经使用头孢呋辛 3 天；这段院外用药没有进入入院病史。','medication',['prior_abx'])],
  C016:[clue('C016','medication-discrepancy','药板与购药凭证不支持最初的服药描述，实际服药时间也早于自述；必须立即核实药物暴露并评估中毒风险。','medication',['dose_known'])],
  C017:[
    clue('C017','drain-handover','纸质护理交班写着“引流液由淡红变浑浊”，电子病程没有记录这项变化。','history',['leak_suspected'],flag('leak_suspected'),{variant:'leak'}),
    clue('C017','lung-handover','这位患者的护理交班记有夜间痰量增多与吸氧；引流液仍为淡红色，没有变浑浊的记录。','history',['lung_history_known'],any('lung_history_known','lung_signs'),{variant:'lung_infection'}),
  ],
  C018:[clue('C018','outside-steroid','患者近两天自行加用了外院开具的甲泼尼龙，入院用药表尚未包含这部分剂量。','medication',['steroid_known'])],
  C019:[
    clue('C019','maternal-consciousness','母亲承认在屋里曾短暂失去意识，家属担心因此被要求住院，最初没有讲清楚。','history',['maternal_coma_history'],flag('maternal_coma_history'),{variant:'brief_coma'}),
    clue('C019','child-asthma','家属补充女儿有哮喘，平时使用的吸入药还在车上；当前喘鸣仍需结合暴露与病情重新评估。','medication',['child_asthma_known']),
    clue('C019','scene-safety','家属尚未确认燃气热水器是否关闭，邻居准备再次进入屋内取证件。应先由专业人员确认现场安全。','history',['scene_unconfirmed_known'],any('scene_safe','scene_unconfirmed_known'),{variant:'scene_unconfirmed'}),
  ],
  C020:[
    clue('C020','oral-nursing-report','护士回忆自己在 22:20 口头报告过“胸闷、出冷汗”，但交班单未标注；是否有人听见、当时如何响应仍需核对。','history',['oral_report_known'],any('oral_report_known','timeline_checked')),
    clue('C020','pump-silence','设备事件线索提示输液泵在 22:28 被消音；这不等于已经确定死因，仍需保全设备状态、药液及原始记录。','history',['pump_silence_known'],any('pump_silence_known','evidence_preserved')),
  ],
};

export function unrevealedGraphClues(graph:ClinicalGraph,state:ClinicalGraphState):ClinicalHiddenClue[] {
  return (clues[graph.id]??[]).filter(c=>graphCondition(c.when,state)&&!graphCondition(c.revealed,state)).map(({revealed:_revealed,when:_when,...c})=>structuredClone(c));
}
/** Revealing a history does not fabricate an examination, test or treatment. */
export function revealGraphClue(graph:ClinicalGraph,state:ClinicalGraphState,clueId:string):ClinicalGraphState {
  const chosen=unrevealedGraphClues(graph,state).find(c=>c.id===clueId);if(!chosen)return state;
  return {...structuredClone(state),flags:[...new Set([...state.flags,...chosen.revealFlags])]};
}
export function unrevealedGraphScent(graph:ClinicalGraph,state:ClinicalGraphState):{kind:'alcohol';text:string;revealFlags:string[]}|undefined {
  if(graph.id==='C002'&&!state.flags.includes('alcohol_signs'))return {kind:'alcohol',text:'他的呼气里有酒味。',revealFlags:['alcohol_signs']};
  if(graph.id==='C006'&&!state.flags.includes('alcohol_smell_known'))return {kind:'alcohol',text:'他的呼气有酒味，但这不能解释全部意识障碍。',revealFlags:['alcohol_smell_known']};
  return undefined;
}
export function registerClinicalClueConsumers(graph:ClinicalGraph):void {
  for(const c of clues[graph.id]??[])for(const flag of c.revealFlags){graph.flagConsumers[flag]??=[];graph.flagConsumers[flag].push({kind:'record',id:c.id});}
}
