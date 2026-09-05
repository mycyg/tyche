import { die, random } from "./random";
import type { Ending, Patient, Run } from "./types";
export function auditScore(r: Run): number {
  return r.hazards.reduce(
    (n, h) =>
      n +
      1 +
      (h.causal ? 1 : 0) +
      (/覆盖|虚假|不实|虚构|利益交换/.test(h.reason) ? 2 : 0),
    0,
  );
}
export function liability(r: Run, p: Patient) {
  const hazards = r.hazards.filter(
    (h) => h.scope.kind === "patient" && h.scope.id === p.uid,
  );
  const R = hazards
    .filter((h) => h.type === "R")
    .reduce((n, h) => n + h.weight, 0);
  const C = hazards
    .filter((h) => h.type === "C")
    .reduce((n, h) => n + h.weight, 0);
  const D = hazards
    .filter((h) => h.type === "D")
    .reduce((n, h) => n + h.weight, 0);
  const L = R + (C + D) / 2 + (r.facts[`tampered:${p.uid}`] ? 20 : 0);
  return {
    R,
    C,
    D,
    L,
    causal: hazards.some((x) => x.causal && x.norm && x.type === "R"),
  };
}
export function chainAnnexes(r: Run): string[] {
  const f = r.facts,
    result: string[] = [];
  if (f["shift-covered"])
    result.push(
      f["li-family-help-done"]
        ? "你替过的班，换来李恂在父亲出院那天到场。委托与签收照片都在。"
        : f["li-favor-used"]
          ? "李恂兑现过一次顶班。人情已经归还，后来每份证言各自承担其内容。"
          : "李恂仍欠你一段时间。轮转结束时，这份人情没有兑现。",
    );
  if (f["li-false-witness"])
    result.push(
      "你替李恂签过未实施的查体证明。那份材料归入同事事件卷宗，不被算到另一名患者身上。",
    );
  if (f["shift-boundary-kept"])
    result.push("钥匙还回去了。你保留人与人之间的帮助，也保留陈述事实的边界。");
  if (r.receivable > 0)
    result.push(
      `借给同事的钱，尚有 ¥${r.receivable.toLocaleString("zh-CN")} 未收回。`,
    );
  if (r.privateDebt > 0)
    result.push(
      `私人借款剩余 ¥${r.privateDebt.toLocaleString("zh-CN")}，与信用借贷分列。尚未到期不被写成已经违约。`,
    );
  if (f["rep-loan-repaid"])
    result.push(
      "那一万元借款已归还。还款记录保留下来，已经发生的其他往来没有被删除。",
    );
  if (f["liaison-job-obtained"])
    result.push("联络岗位已经确认。以后，那些带条件的电话会先打到你这里。");
  else if (f["liaison-job-unconfirmed"])
    result.push("聘用意向没有签署。那份岗位没有落到你名下。");
  if (
    f["family-finance-concealed"] &&
    (f["rep-loan-accepted"] || f["kickback-received"])
  )
    result.push("家里仍不知道其中一笔钱的来源。父亲把缴费单按日期夹在了一起。");
  if (f["recording-exists"])
    result.push(
      f["record-official-received"]
        ? "原始录音已由医务科签收，患者家属仍保留自己的副本。"
        : "家属手里有原始录音。你提供的说明不替代她保存的那一份。",
    );
  if (f["discharge-promise"])
    result.push("录音中保留着“三天内能走”。后续解释没有覆盖这句原话。");
  if (f["record-tampered"])
    result.push("原记录被覆盖后的修改日志，与家属留存材料一起进入复核。");
  if (f["paper-submitted-false"])
    result.push(
      "稿件已提交；你在提交前知道重复样本的问题。后来提供原件能够说明来源，也能够证明知情时间。",
    );
  else if (f["paper-submitted-clean"])
    result.push(
      "修正后的稿件已提交。重复行已剔除，新的结果没有课件中的数字好看。",
    );
  else if (f["seen:research-1"])
    result.push(
      "截至轮转结束，未见你完成稿件提交的记录。持有资料或参与工作不被写成已投稿。",
    );
  if (f["project-role-obtained"])
    result.push("项目任命已经送达；询问、补件和整改随岗位一并交接。");
  if (f["false-invoice"])
    result.push("八百元私人支出使用了不实项目票据报销，列入项目费用核查。");
  if (f["father-missed"])
    result.push("父亲住院那晚，你没有到场。母亲把他的旧衣服洗净，挂回阳台。");
  if (r.depression >= 75)
    result.push(
      r.relations.family >= 2
        ? "家里来人接你。门口的外卖袋被顺手带了下去。"
        : "回到宿舍后，你把群通知关掉。第二天醒来，手机没有新的未接电话。",
    );
  return result;
}
function ending(
  r: Run,
  id: string,
  title: string,
  category: string,
  decision: string,
  epilogue: string,
  court = false,
): Ending {
  return {
    id,
    title,
    category,
    decision,
    epilogue,
    court,
    annexes: chainAnnexes(r),
  };
}
export function earlyEnding(
  r: Run,
  kind: "san" | "stamina" | "emotion" | "interest" | "debt" | "quit",
): Ending {
  const night = r.queue[r.cursor]?.kind === "night";
  if (kind === "san")
    return ending(
      r,
      night ? "X22" : "X21",
      night ? "值班室的窗" : "病假条",
      "精神",
      "当班医师停止本轮工作，由二线接管病区。经评估，安排休息与后续支持。",
      "姜蓉在你旁边坐了一会，把没有填完的表收起来。你醒来时是下午，手机里有一条新的排班通知。",
    );
  if (kind === "stamina")
    return ending(
      r,
      night ? "X20" : "X17",
      night ? "抢救室" : "值班室",
      "身体",
      "当班医师因身体状况停止轮转。未完成诊疗由科室接管。",
      "有人摘下你的胸牌，放进外套口袋。下次听见交班电话时，你在另一张床上。",
    );
  if (kind === "emotion")
    return ending(
      r,
      "X25",
      "解除劳动合同",
      "关系",
      "因再次发生无法继续履职的情绪事件，轮转终止。人事手续另行办理。",
      "门禁卡交回窗口，注销回执只有半页。你把白大褂装进袋子，袋口没有系紧。",
    );
  if (kind === "interest")
    return ending(
      r,
      "X28",
      "利息",
      "债务",
      "连续两日新增收入不足以覆盖当日借贷利息。账户进入清偿程序，本轮工作终止。",
      "还款页面上，利息在第一行。你向下滑，才看到那几笔已经还过的钱。",
    );
  if (kind === "debt")
    return ending(
      r,
      "X29",
      "催收",
      "债务",
      "信用借贷余额超过清偿上限，无法继续垫付工作与生活支出。",
      "电话又响了。你把通讯录里那几个常用号码翻了一遍，没有拨出去。",
    );
  return ending(
    r,
    r.facts["prescriptions-exported"] ? "X32" : "X31",
    r.facts["prescriptions-exported"] ? "离职后的询问" : "提桶",
    "职业",
    "本人申请终止轮转。未结费用与已发生事件另行处理，离职不撤销既有调查。",
    "钥匙放回护士站。你走到医院门口，回头看了一眼亮着灯的那层楼。",
  );
}
export function tribunalEnding(
  r: Run,
  response: "facts" | "admit" | "silent",
): Ending {
  const q = auditScore(r),
    f = r.facts;
  if (
    f["prescriptions-exported"] &&
    random(r.seed, "court:corruption") <
      0.25 + Math.min(0.3, 0.05 * q) + (f["kickback-received"] ? 0.25 : 0)
  ) {
    return ending(
      r,
      "X06",
      "统方",
      "刑事",
      "内部用药明细对外传送及对应收款已查实。有关材料移交司法程序，岗位与执业手续中止。",
      "收款消息和文件发送时间列在同一页。你的手机放在证物袋里，屏幕朝下。",
      true,
    );
  }
  const seeds = r.patients
    .filter((p) => p.damage >= 2)
    .map((p) => ({ p, ...liability(r, p) }))
    .sort((a, b) => b.p.damage - a.p.damage || b.L - a.L);
  const worst = seeds[0];
  if (worst && worst.L >= 50 && worst.causal) {
    const dc = Math.min(
      19,
      Math.max(
        2,
        10 +
          (worst.p.damage === 3 ? 3 : 0) +
          Math.floor(worst.C / 10) +
          Math.min(6, q) -
          (r.reputation >= 70 ? 3 : 0),
      ),
    );
    const face = die(r.seed, "court:case");
    r.roll = {
      id: "court:case",
      kind: "tribunal",
      face,
      modifier: 0,
      dc,
      success: face >= dc,
      label: "立案检定",
    };
    if (face < dc)
      return response === "admit"
        ? ending(
            r,
            "X02",
            "缓刑",
            "刑事",
            `患者发生${worst.p.damage === 3 ? "死亡" : "严重损害"}。经核查，当班处置存在明确过错且与损害相关。本人认罪认罚，判处有期徒刑一年，缓刑一年，并承担后续清偿责任。`,
            "每月报到的路经过医院侧门。你换了一条路。白大褂仍在柜子最上面。",
            true,
          )
        : ending(
            r,
            "X01",
            "一年",
            "刑事",
            `患者发生${worst.p.damage === 3 ? "死亡" : "严重损害"}。当班处置违反明确制度，构成主要以上责任。判处有期徒刑一年，执业登记随判决处理。`,
            "通知寄到家里时，母亲拆开看了。后来她问那件白大褂还要不要留。你说留着。",
            true,
          );
    return ending(
      r,
      "X07",
      "暂停执业",
      "行政",
      "刑事立案检定未通过移交门槛。患者损害与主要责任成立，暂停执业并进入赔付与整改程序。",
      "新的排班表没有你的名字。办公室让你来补签一张培训登记单。",
      true,
    );
  }
  if (
    f["record-tampered"] ||
    f["paper-submitted-false"] ||
    f["research-lied-inquiry"]
  )
    return ending(
      r,
      "X11",
      "原件",
      "行政",
      "原始记录、已知数据问题或核查陈述存在不实，进入专项调查。项目材料不被当作另一名患者的临床伤害。",
      "你交出了原件。原件没有替任何人说话，只留下每一步发生的时间。",
      true,
    );
  if (worst && worst.L >= 15)
    return ending(
      r,
      "X14",
      "调解",
      "民事",
      "临床损害进入民事处理。各项责任按对应患者的行为、伤害与证据分别核查。",
      "调解室的笔写不出字，工作人员换了一支。你在最后一页签了名字。",
      true,
    );
  const fees = r.hazards
    .filter((h) => h.type === "F")
    .reduce((n, h) => n + h.weight, 0);
  if (fees >= 60)
    return ending(
      r,
      "X09",
      "追回",
      "医保",
      "费用申报与实际服务记录存在问题，相关费用被追回。绩效结算扣减，科室要求完成整改。",
      "工资条里多了一列。你把上个月的工资条找出来，叠在下面。",
      true,
    );
  const record = r.hazards.reduce(
    (n, h) => n + (h.type === "D" || h.type === "C" ? h.weight : 0),
    0,
  );
  if (record >= 80 && die(r.seed, "court:review") <= Math.min(18, q))
    return ending(
      r,
      "X07",
      "暂停执业",
      "行政",
      "复核发现多项沟通与记录义务未履行。未从复核中推定新的患者伤害，但履职审查未通过。",
      "档案袋封好后，你问什么时候可以回来。窗口让你等通知。",
      true,
    );
  if (r.depression >= 75)
    return ending(
      r,
      r.relations.family >= 2 ? "X24" : "X26",
      r.relations.family >= 2 ? "接走" : "白噪音",
      "关系",
      "轮转结束，安排停止当前岗位工作并接受后续评估。",
      "手机亮了又暗下去。你在床边坐着，直到门外的人敲第二次门。",
      true,
    );
  if (f["liaison-job-obtained"])
    return ending(
      r,
      "X34",
      "联络人",
      "职业",
      "轮转完成，本人接受院外联络岗位。已存在的私人借款、项目调查与患者争议继续分别处理。",
      "第一天上班，你把医院的门禁卡放进抽屉。新工作群里，有几个熟悉的名字。",
      true,
    );
  if (r.relations.chief <= 1 || r.reputation < 45 || record >= 30)
    return ending(
      r,
      "X35",
      "延期",
      "职业",
      "轮转考核未通过。补充考核、争议复核及岗位安排另行通知。",
      "你打开下个月的排班表。还是那几个床号，日期换了。",
      true,
    );
  if (r.reputation >= 70 && r.relations.chief >= 4 && r.relations.peer >= 3)
    return ending(
      r,
      "X36",
      "带组",
      "职业",
      "本轮考核通过，安排承担下一阶段带组工作。现存事项按原流程继续办理。",
      "新人站在护士站，等你分床。你看着那张空白的交班纸，说先把这个看完。",
      true,
    );
  return ending(
    r,
    "X33",
    "下一站",
    "职业",
    "十四天轮转结束，本轮考核通过。已发生的个案材料按对应程序归档。",
    "你把胸牌从白大褂上摘下来。明天要去的楼，在医院另一头。",
    true,
  );
}
