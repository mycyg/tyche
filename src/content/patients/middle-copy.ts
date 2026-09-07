import type {Option,Scene}from '../../game/types';

interface InvestigationCopy {result:string;label?:string;actor?:NonNullable<Option['mechanics']>['actor'];}
/** This projection describes only the selected investigation. Source history,
 * observed findings and test reports remain separate evidence channels. */
export const INVESTIGATION_COPY:Record<string,InvestigationCopy>={
 'C-029':{result:'静息后复测的血压较初测下降，目前没有胸痛、气促或神经症状。测量前的活动、药物和保健品仍需问清；一次复测不能代替器官损害评估。'},
 'C-031':{result:'静息心电检查未能解释运动时的晕厥。当前平稳不足以开具运动许可，心脏结构和家族史仍需分别核实。'},
 'C-034':{label:'对照护理记录，查报警时间和原始波形',result:'白班把那次报警当作电极脱落，没有保存波形。护理记录却记着患者当时短暂失去反应。那段波形已经找不回来了，发作原因也还没有查清；接下来需要保留新的报警记录，请节律专科评估。'},
 'C-068':{label:'核对随身药盒，并电话追查降糖药与进食经过',actor:'family',result:'同事按你的要求找到格列美脲药盒。电话联系到的家属确认，患者有三年糖尿病史，服用格列美脲，当晚饮酒却没有进食。患者目前不能可靠回答；这些内容分别记录为药盒核对和家属陈述。'},
 'C-070':{result:'心电图可见高尖 T 波、QRS 增宽和窦性心动过缓。当前医嘱含新加的螺内酯及长期使用的缬沙坦；原危急值血钾为 6.8 mmol/L。新的血钾复查还没有结果，目前不能确认血钾是否已经恢复正常。'},
 'C-083':{result:'原尿常规潜血 3+，镜下红细胞只有 0—2/高倍视野；肌酸激酶为 46,000 U/L。尿色变化不能直接按普通血尿解释，现有肌酐 128、血钾 5.2 也需要继续监测。'},
 'C-151':{result:'现有肺炎支原体核酸阳性，胸片右下叶大片实变，血氧饱和度 97%。家长展示的是网上的用药说法，尚不能证明患儿已使用足疗程药物、存在耐药或需要更换方案。'},
 'C-176':{result:'监护记录中胎心基线为 165 次/分，变异减少；子宫张力高并有压痛，即使没有阴道出血也须继续评估。腹部是否受过外伤，仍需本人有独立陈述机会后另行询问。'},
 'C-197':{result:'本次躯体评估尚不能解释全部食欲、睡眠和精神变化，也不能据此断言只是年老。患者是否想过伤害自己、目前能否独处，你需要另行与本人单独评估。'},
};

export function projectInvestigationCopy<T extends Scene>(scene:T,presetId:string,canUpdate:(option:Option)=>boolean=()=>true):T{
 const copy=INVESTIGATION_COPY[presetId];if(!copy)return scene;
 let changed=false;
 const options=scene.options.map(option=>{
  if(!canUpdate(option)||![':investigate:targeted',':decision:second-look',':investigate:all'].some(suffix=>option.id.endsWith(suffix)))return option;
  changed=true;
  const all=option.id.endsWith(':investigate:all');
  const label=copy.label&&!all?(option.id.endsWith(':decision:second-look')?`补做核对：${copy.label}`:copy.label):option.label;
  return {...option,label,result:copy.result+(all?'你加开的检查已记入账单，每个项目仍须说明临床依据。':''),
   ...(copy.actor&&option.mechanics?{mechanics:{...option.mechanics,actor:copy.actor}}:{})};
 });
 return changed?{...scene,options}:scene;
}
