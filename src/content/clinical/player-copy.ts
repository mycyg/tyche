import type {ClinicalGraph,ClinicalGraphState,ClinicalNode,GraphCondition} from './types';
import {graphCondition} from './runtime';
import type {Patient} from '../../game/types';

const F=(flag:string):GraphCondition=>({flag});
const C=(choice:string):GraphCondition=>({choice});
const A=(...all:GraphCondition[]):GraphCondition=>({all});
const N=(not:GraphCondition):GraphCondition=>({not});

/** The authoring source is immutable provenance, not a fallback player string. */
export function clinicalNodeText(node:ClinicalNode,state:ClinicalGraphState):string {
  return node.textVariants?.find(v=>graphCondition(v.when,state))?.text??node.text;
}

/** Role-bound references only. The second same-name patient never receives the
 * primary patient's allocated bed. Unrelated numbers and clinical units survive. */
export function projectClinicalText(caseId:string,text:string,p:Pick<Patient,'name'|'bed'> & Partial<Pick<Patient,'clinical'>>):string {
  if(caseId==='C009') {
    if(p.clinical?.variants.includes('different_sex'))text=text.replace(/同病室\s*33\s*床，女，64\s*岁/g,'同病室 33 床，男，64 岁');
    text=text.replace(/31\s*床陈秀英/g,`31 床${p.name}`)
      .replace(/「陈秀英，七十二。/g,`「${p.name}，七十二。`)
      .replace(/33\s*床/g,'另一张同名患者的床');
  }
  const primaryBeds:Record<string,number>={C004:23,C009:31,C010:67,C018:32,C020:37};
  const original=primaryBeds[caseId];
  if(original)text=text.replace(new RegExp(`(?<!\\d)${original}\\s*床`,'g'),p.bed>0?`${p.bed} 床`:'留观区这位患者');
  if(p.bed<=0)text=text.replace(/留观区这位患者\s*患者/g,'留观区这位患者').replace(/留观区这位患者床尾/g,'留观区这位患者的床尾');
  return text;
}

/** Source-specific projections. Only text metadata changes; choices, costs and rules do not. */
export function applyClinicalPlayerCopy(g:ClinicalGraph):void {
  const node=(id:string)=>g.nodes.find(n=>n.id===id)!;
  const op=(id:string)=>g.nodes.flatMap(n=>n.options).find(o=>o.id===id)!;
  // Arrival gestures are already public in the source presentation. Absolute
  // authoring clocks and waiting-room counts are not the current game's clock.
  const openings:Record<string,string>={
    C001:'母亲把孩子放在诊床上，他立刻蜷起腿。',
    C002:'男人手里攥着病历本，外套没脱。妻子站在他身后，一只手放在椅背上。',
    C003:'护士已经量完血压，把单子放在桌上。老人坐在轮椅上，两手按着上腹，额头有汗。',
    C004:'老人靠在摇高的床头上，手里拿着一只保温杯。床头柜上有一小袋褐色粉末，用橡皮筋扎着口。',
    C005:'她把帆布包放在膝盖上，两手压着包口。母亲站在旁边，替她把病历本递过来。',
    C006:'护士已接上监护。年轻人躺在平车上，衬衫领口和后背湿透，额头有一层汗。',
    C007:'孩子趴在母亲身上，两只眼睛的白眼球通红，没有眼屎。嘴唇红，下唇有一道裂口。',
    C008:'婴儿躺在父亲臂弯里，眼睛闭着。叫她名字时，眼皮动了一下，没有睁开。哭声短而尖。',
    C014:'孩子坐在床上玩一只塑料勺，鼻翼随呼吸动。母亲的行李已经收好放在床尾，拉链拉上了。',
    C016:'他的背包放在腿上，拉链拉着。室友站在床尾看手机。',
  };
  if(openings[g.id])g.nodes[0].text=openings[g.id];
  if(g.id==='C001')node('s6').text='母亲拎着那个装满换洗衣服的袋子，等着手术或转诊的安排。';
  if(g.id==='C002'){
    node('s4').text='他攥着病历本。发热、咳嗽已经三天，自服的「感冒药」没有起效。';
    const prescription='莫西沙星片 400 mg，每日一次口服，7 天。';
    op('s4_moxi').result=prescription;
    op('s4_moxi').resultVariants=[{when:A(F('alcohol_known'),F('lft_hint')),text:prescription+'肝功能轻度异常，非禁忌，3 天后复查肝功能。'}];
  }
  if(g.id==='C003'){
    node('s3').text='护士问要不要做个心电图。';
    node('s3').textVariants=[{when:F('stemi_known'),text:'心电图已经送到。护士把心电图纸放到你手边。'}];
    node('s4').text='女儿陪在旁边。来院前，老人还坚持说这次疼痛和以前的「胃痛」一样。';
  }
  if(g.id==='C005'){
    node('s4').text='她来诊时说，头痛已持续 5 天，今晨看电脑屏幕时字迹模糊。';
    node('s4').textVariants=[
      {when:F('mrv_done'),text:'MRV 回报已经送到。'},
      {when:F('ctv_done'),text:'CT 静脉成像回报已经送到。'},
    ];
  }
  if(g.id==='C006'){
    node('s2').text='监护已经接上。送诊的同事说，凌晨一点在 KTV 的沙发上发现他叫不醒。';
    node('s2').textVariants=[
      {when:C('s3_nurse_glucose'),text:'护士补测指尖血糖为 1.4 mmol/L。'},
      {when:F('hypo_known'),text:'指尖血糖为 1.9 mmol/L。'},
    ];
    const awake='15 分钟后复测指尖血糖为 6.8 mmol/L，GCS 升至 14 分。他能回答姓名，说：「我有糖尿病，别告诉他们。」';
    op('s2_d50').result=`已给予 50% 葡萄糖 40 mL 静推。${awake}`;
    node('s3').text='他仍没有清醒，护士继续监护。你还没有查明昏迷原因，需要重新评估，不能只听送诊同事说他喝过酒。';
    node('s3').textVariants=[{when:F('pt_awake'),text:awake}];
    op('s3_nurse_glucose').result='留观 1 小时后，他仍未清醒。护士补测指尖血糖为 1.4 mmol/L。';
    node('s4').text='监护继续。血糖与意识的变化需要连续记录，是否补做代谢检查和头部评估也还需要决定。';
    node('s4').textVariants=[{when:F('pt_awake'),text:'他已经能够回答姓名。刚才的血糖回升已有记录，接下来还要决定观察、进食后复评和其他必要检查。'}];
    node('s5').text='你需要记下本次处置和后续观察安排。要向同事说明他的病史，还得先确认他本人同意告诉谁、可以说哪些事。';
    node('s5').textVariants=[{when:F('consent_disclose'),text:'他已经同意让一名同事知道病情。告知限于授权的对象与夜间观察要点，后续血糖记录和复诊仍需交代。'},
      {when:F('pt_privacy_request'),text:'他刚才说过：「我有糖尿病，别告诉他们。」你需要先向本人解释本次情况，再确认他是否愿意让一名同事知道观察要点。'}];
  }
  if(g.id==='C008'){
    node('s4').text='腰穿尚未取得同意。来院时，家属把这次抽搐当成了普通的发热反应。';
    node('s4').textVariants=[{when:F('lp_consented'),text:'家属已同意腰穿。安排在首剂抗菌药物前完成；若腰穿预计延迟超过 30 分钟，先用抗菌药物。'}];
    // The source gives a combined plan, but mannitol is a separately selectable
    // action. Keep this result confined to the three drugs named by this action.
    op('s4_empiric').result='本次经验性治疗医嘱：头孢曲松 800 mg 静滴，每日一次（100 mg/kg/d）；万古霉素 120 mg 静滴 1 小时以上，每 6 小时一次（60 mg/kg/d），第 3 剂前测谷浓度；地塞米松 0.15 mg/kg（1.2 mg）静注，每 6 小时一次，共 2–4 天，首剂在首剂抗菌药物前 10–20 分钟或同时给予。';
  }
  if(g.id==='C009'){
    node('s2').text='治疗车上有一支贴好标签的紫帽管。标签上打印着姓名与住院号。';
    op('s3_phone_type').result='输血科接听电话，核对了血型鉴定与配血报告。';
    op('s4_two_person').result='两人在床旁核对患者身份、血型与血袋标识，并询问输血史。';
    node('s5').text='输血开始。滴速 20 滴/分。';
    const early='输入约 50 mL 时，她说腰疼。她的手在被子下面攥着床单。体温 38.9℃，脉搏 128 次/分，血压 82/50 mmHg。尿袋里的尿变成酱油色。';
    const late='护士在走廊喊你。你回到病室时血袋输了将近一半。她已经不说话了，眼睛半开着，尿袋里是深褐色。';
    node('s6').text='输血中的异常需要立即处理。';
    node('s6').textVariants=[
      {when:F('reaction_late'),text:late},
      {when:A(F('wbit'),N(F('redraw'))),text:early},
    ];
    op('s5_observe').resultVariants=[{when:F('reaction_seen'),text:early}];
    op('s5_observe').result='你在开始输注后的 15 分钟内完成了床旁观察和生命体征测量，未发现输血反应。这次复测的具体读数没有附在记录里，晨间读数不能代替本次结果。';
    op('s5_leave').resultVariants=[{when:F('reaction_late'),text:late}];
    node('s7').text='现在需要按实际核对、输注和观察经过完成记录。是否发生反应、做过哪些处置，应与已经取得的资料一致。';
    op('s7_note').label='记录核对过程、输血起止时间、有无反应及实际处置，按要求上报';
    op('s7_note').result='已记录实际核对过程、输血起止时间与观察情况；发生反应时另记出现时间及实际处置。';
    op('s7_return_bag').label='按实际输注情况填写回报单，送回血袋与输血器';
    op('s7_return_bag').result='血袋与输血器送回输血科，回报单按实际观察填写有无输血反应。';
    op('s7_inform').label='告知家属本次输血经过、实际观察与后续注意事项';
    op('s7_inform').result='向家属说明本次输血的实际经过。';
  }
  if(g.id==='C011'){
    node('s5').text='5 分钟后，监护仪上血压数字换了一次。';
    node('s5').textVariants=[
      {when:F('arrhythmia_treated'),text:'室性心律失常已经处理，抢救团队继续复评血压、心律与气道。'},
      {when:F('airway_supported'),text:'血氧读数为 84%。气道团队已经到床旁接手评估与插管准备，复苏继续。'},
      {when:F('epi_iv'),text:'监护仪显示室性心动过速，心率 186 次/分。需要处理心律失常，持续复评血压与气道。'},
      {when:F('epi_delayed'),text:'血氧饱和度降至 84%，需要气道评估与插管准备。'},
    ];
    op('s5_observe30').resultVariants=[
      {when:A(F('epi_delayed'),N(F('airway_supported'))),text:'你选择结束观察，但低氧仍未解决，患者未能离院，抢救继续。'},
      {when:A(F('epi_iv'),N(F('arrhythmia_treated'))),text:'你选择结束观察，但室性心律失常仍未处理，患者未能离院，抢救继续。'},
    ];
  }
  if(g.id==='C012'){
    node('s4').text='外科医生仍建议再观察 4 小时，复查乳酸。你需要核对已经取得的检查资料，再决定是否接受这个建议。';
    node('s4').textVariants=[{when:F('ct_done'),text:'外科医生看过 CT 片，问家属在不在。\n外科医生：「七十六了，刀口一开就是大手术。CT 上这个强化减弱也不是绝对的。要不再观察四个小时，复查个乳酸？」'}];
    op('s4_argue').successText='外科同意安排急诊手术。';
    op('s4_argue').resultVariants=[{when:A(F('labs_done'),F('surgery_agreed')),text:'外科医生说：「行，乳酸都 4.2 了，我不跟你争了。你去跟家属谈手术，我去安排手术台。」'}];
    node('s5').textVariants=[{when:{variant:'son_away'},text:'儿子仍在外地，知情同意需要电话确认并录音。'}];
    node('s6').text='你还需要核对手术和后续处置的安排。';
    node('s6').textVariants=[{when:F('surgery_agreed'),text:'手术室打来电话，说 40 分钟后接患者。'}];
  }
  if(g.id==='C013'){
    node('s6').text='你还需要写完这次处置记录。';
    node('s6').textVariants=[{when:F('transferred'),text:'转运车已经到了楼下，你还需要写完这次处置和转运记录。'}];
  }
  if(g.id==='C017'){
    g.nodes[0].text=g.presentation.appearance;
    // The variant is hidden until the player actually examines the patient.
    node('s2').text='护士交班时说，痰比昨天多。床旁痰杯有少量黄白色痰，腹部切口敷料干燥。';
    delete node('s2').textVariants;
    node('s6').text='CT 显示局限积液且可安全介入时，可由外科、介入或重症团队评估引流；弥漫性腹膜炎、休克或引流不可行时需评估手术源控制。';
    g.outcomes.find(o=>o.id==='o_worst')!.text='夜间病情恶化，接班团队继续抢救。';
  }
  if(g.id==='C018'){
    node('s1').text='患者要求「今天就用进口药」，家属在旁询问费用。'+g.presentation.appearance;
    node('s2').text='患者说：「我吃国产药，胃不舒服。」她近一周发热，尿量减少。你还需要问清近七日全部用药，并重新查体，入院记录里的信息还不够。';
    node('s3').text='入院诊断为系统性红斑狼疮活动，肾脏受累待排。原计划补充免疫学、尿液与肾功能检查，患者仍在等今天的用药安排。';
    node('s4').text='床头的进口药宣传折页上，有人用荧光笔圈出了药名。你需要根据她已经取得的检查结果和实际用药，核对说明书的限制，不能凭宣传材料判断她是否适合用药。';
    node('s5').text='患者希望用进口药，家属关心自己要付多少钱。你需要讲清实际药价和医保支付范围，再说明还有哪些方案可选。签字前，还得确认他们是否听明白了。';
    node('s6').text='患者手机上的科室群截图写着：「这款药效果好，按盒算有支持」。药品折页背面还有药代手机号。你还需要核实这张截图。截图里写了这些话，不等于已经证明谁收了回扣。患者的处方仍由你根据病情独立决定。';
    node('s7').text='接班医生需要知道患者实际接受了什么诊疗，也要知道你怎样保存药品宣传和截图、把材料交给了谁。你应按实际经过记录，不能把尚未用药、尚未告知或尚未举报的事写成已经完成。';
  }
  if(g.id==='C020')g.nodes[0].text=g.presentation.appearance;
  if(g.id==='C019')node('s7').title='收尾';
  for(const report of g.reports)if(REPORT_TITLES[report.id])report.title=REPORT_TITLES[report.id];
}

// Explicit IDs avoid destroying legitimate clinical parentheses, C3/C4 or numeric units.
const REPORT_TITLES:Record<string,string>={
  C001_r4:'全腹 CT 平扫',C002_r4:'胸部 CT 平扫',C003_r3:'腹部超声',
  C004_r4:'腹部 CT 平扫',C007_r4:'胸部 CT',C009_r2:'血型鉴定与交叉配血报告',
  C010_r2:'床旁血气与复查电解质',C010_r3:'心电图',C016_r4:'第 3 天返院记录',
  C017_r1:'血常规、乳酸、肝肾功能与血培养',C017_r2:'痰培养、血气与床旁胸片',
  C017_r3:'腹盆腔增强 CT',C017_r4:'床旁胸片',C017_r5:'腹盆腔增强 CT 回报',
  C018_r2:'药学部目录与支付核对',C020_r1:'监护与护理记录',C020_r2:'电子病历审计导出',
};
