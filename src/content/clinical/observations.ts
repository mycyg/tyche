import type {ClinicalGraph} from './types';

/** Immediate bedside findings, reviewed against each case's presentation,
 * revelation rules and option row. This is not a second diagnostic report.
 * Unspecified normal findings/values are deliberately not invented. */
const observations:Record<string,Record<string,string>>={
 C001:{s1_feeding:'母亲确认：先吐奶，后来吐黄绿色液体，今天没有大便，也没有放屁。昨天中午第一次喂过虾。',s1_allergy:'母亲说孩子以前“没生过什么病”。她没有提供可核对的出生记录或既往药物反应资料，药物过敏史仍需留意。'},
 C002:{s1_symptoms:'他咳的是黄痰，右侧胸部在咳嗽时疼痛。发热已经三天，自服感冒药两天没有缓解。'},
 C003:{s1_meds:'既往服用氨氯地平与二甲双胍，今晚自行服过奥美拉唑和铝碳酸镁，腹痛没有缓解。既往胃镜诊断慢性胃炎，否认药物过敏和手术史。',s2_abd_only:'上腹痛仍未缓解。腹部检查已经安排，淀粉酶与超声回报需另行核对；此次没有取得心电图。'},
 C004:{s1_review:'长期医嘱同时列着华法林和甲硝唑。甲硝唑在入院第一天加用，此后没有复查凝血；两药的相互作用需要立即复核。',s1_nursing:'夜班护理记录写着“大便一次，颜色深”。交班本的“病情平稳”没有提到这条记录。',s1_brief:'交班摘要只有“肺脓肿，抗感染治疗中，病情平稳”，未列全部用药，也没有夜间排便情况。'},
 C005:{s1_redflags:'她确认头痛持续五天，晨起最重，咳嗽和弯腰时加重；昨天呕吐，今晨开始视物模糊。布洛芬只能暂时缓解。',s2_vitals_only:'血压 128/82 mmHg。此次没有完成神经系统与眼底检查，视物模糊的原因仍未明确。'},
 C007:{s1_rash:'母亲说躯干红疹已有两天，今天眼睛发红。眼部没有分泌物，口唇红裂，手背绷得发亮。发热的完整起始时间仍需核对照护者记录。',s2_lymph:'右颈可触及约 2 cm 的肿大淋巴结。'},
 C009:{s1_indication:'血红蛋白 58 g/L，心率 104 次/分，血压 102/64 mmHg。胃镜套扎后暂未再呕血，嘴唇苍白，输血指征仍在；血型尚未取得可靠鉴定。',s4_ask_history:'患者说三年前手术时输过血，当时医生告诉她是 O 型。自述血型记下后，仍须与本次标本和配血报告逐项核对。'},
 C011:{s1_record:'2019 年急诊病历的过敏史栏写着“青霉素（皮疹）”，与今天分诊单的“否认”不一致。',s1_exam:'双侧扁桃体Ⅱ度肿大，表面有白色渗出；颈部可触及肿大淋巴结。'},
 C012:{s1_night:'夜班记录：02:10 因腹痛使用曲马多，随后患者入睡。胃管引流液被记为“同前”，没有重新描述颜色；“睡着了”不能说明腹痛病因已经解除。'},
 C014:{s1_trend:'监护仪存储曲线显示，夜间 01:00—04:00 血氧多次低于 90%，最低 88%。这与护理记录中的单次 94% 并不相同。',s1_chart:'护理记录写着今晨 07:00 血氧 94%，当时孩子清醒、安静。记录里没有完整的睡眠血氧趋势。'},
 C015:{s1_score:'CURB-65 评分 0 分：意识清，尿素氮正常，呼吸 22 次/分，血压 128/80 mmHg，58 岁。现有资料没有重症标准，也没有耐药菌高风险依据。',s1_bag:'随身单据显示，他已在小区诊所连续三天输注头孢呋辛，与先前“没用过抗菌药”的自述不符。'},
 C016:{s1_exam:'患者能清楚回答，仍有恶心、呕吐。血压 118/76 mmHg，血氧 99%；现有体征不能排除药物相关损伤，服药经过仍需核对。'},
 C017:{s2_lung_only:'肺部听诊已经完成，但没有评估腹部防御，也没有复核引流液变化。发热的来源仍未明确。'},
 C018:{s1_medlist:'核对处方后发现，除原有泼尼松与羟氯喹外，她近两天还自行加用了外院开具的甲泼尼龙；这部分先前没有报给病区。',s1_chart:'入院记录为系统性红斑狼疮活动、肾脏受累待排。患者近一周发热、尿量减少，免疫学、尿液与肾功能检查尚待补齐。',s1_call:'原主管的口头意见没有补上适应证、支付范围和用药安全资料，现有记录仍不足以决定进口药方案。',s2_exam:'血压 146/92 mmHg，体温 37.8℃，心率 104 次/分。近期尿量减少，感染情况与肾脏受累仍需结合后续检查判断。'},
 C019:{s2_father:'父亲仍有头痛、恶心和步态不稳，心率 108 次/分，血压 118/72 mmHg，已接入心电监护。普通脉搏血氧 99% 不能代替一氧化碳相关评估。',s2_child:'女儿嗜睡，床旁血糖 2.9 mmol/L，呼吸 26 次/分。低血糖尚未纠正，需要继续处理与复测。',s2_one:'父亲有头痛、恶心与步态不稳。母亲和女儿仍在等候，尚未完成各自的意识、呼吸与血糖分级。',s4_ob:'父亲心电图有 ST-T 改变，肌钙蛋白轻度升高，乳酸 4.8 mmol/L。重症团队结合神经与心脏情况继续评估。'},
};
export function applyBedsideObservations(graph:ClinicalGraph):void {
 const option=(id:string)=>{const o=graph.nodes.flatMap(n=>n.options).find(o=>o.id===id);if(!o)throw new Error(`${graph.id}: missing bedside observation ${id}`);return o;};
 for(const [id,text] of Object.entries(observations[graph.id]??{}))option(id).result=text;
 if(graph.id==='C017'){
  for(const id of ['s1_nursing','s2_drain'])option(id).resultVariants=[
   {when:{variant:'leak'},text:id==='s1_nursing'?'夜班交班纸记录引流液由淡红转为浑浊，电子病程没有这条变化。':'引流液浑浊、量少。追问后，患者承认夜间腹痛加重，排气减少。'},
   {when:{variant:'lung_infection'},text:'引流液淡红，没有进行性浑浊。患者夜间咳嗽与痰量增加，腹痛没有继续加重，仍有少量排气。'},
  ];
  option('s2_exam').resultVariants=[{when:{variant:'leak'},text:'腹部有防御，引流液浑浊，切口敷料干燥。异常不仅限于肺部，需要继续评估腹腔来源。'},{when:{variant:'lung_infection'},text:'左下肺有细湿啰音，腹部柔软、无肌紧张，引流液淡红，没有进行性浑浊。'}];
 }
 if(graph.id==='C018'){
  option('s2_ask').successText='她补充：近两天自行加用了外院开的甲泼尼龙，没有告诉病区医生。';
  option('s2_ask').check!.failureText='她仍说“按医生说的吃”，没有讲清是否另外加药。';
  option('s2_bag').successText='你核对了药袋和服法，确认她原来在用泼尼松和羟氯喹。她没带另用的甲泼尼龙原盒，该药的包装和批号还需要核实。';
  option('s2_bag').check!.failureText='药袋上的信息不完整，这次未能可靠辨认剂量与批号；仍可继续规范评估。';
 }
 if(graph.id==='C019')option('s2_mother').resultVariants=[
  {when:{variant:'brief_coma'},text:'母亲胎心监护出现短暂变异减少，产科已收到联络；复核经过时确认她曾短暂意识不清。'},
  {when:{not:{variant:'brief_coma'}},text:'母亲胎心监护出现短暂变异减少，产科已收到联络，母体意识与胎儿情况需要分别观察。'},
 ];
 // Remove only explicit graph/node IDs, never clinical qualifiers such as
 // “室内空气”, “吸氧后” or measurements in parentheses.
 const titles:Record<string,string>={
  '输血反应复核（s6_verify 后 40 分钟）':'输血反应复核（40 分钟后）',
  '皮试（s2_pen_test → s3）':'皮试结果',
  '血常规（s1_exam 可选加做，¥22）':'血常规',
  '心电监护（s4_epi_iv 后）':'用药后心电监护',
  '痰培养（s1_culture，第 3 天）':'痰培养（第 3 天）',
  '对乙酰氨基酚血药浓度（s2_labs，采血 00:52，60 分钟后回报）':'药物浓度（采血 00:52，60 分钟后回报）',
  '肝功、凝血、肾功、血气（s2_labs，入院时）':'肝功、凝血、肾功、血气（入院时）',
  '尸检／病理结果（s4_autopsy 后的变体回报）':'尸检与病理结果',
 };
 for(const report of graph.reports)report.title=titles[report.title]??report.title.replace(/[（(]\s*s\d+[a-z\d_]*(?:\s*[/、，,]\s*s\d+[a-z\d_]*)*\s*[）)]/gi,'').trim();
}
