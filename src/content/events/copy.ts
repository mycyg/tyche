/** Player-facing vocabulary. Exact source formulas stay on the content object. */
export function eventPlayerText(text: string): string {
  return text.replace(/某某药业/g, '南桐药业').replace(/某银行/g, '南屏银行')
    .replace(/\s*HIS(?: 系统)?\s*/g, '院内医嘱系统')
    .replace(/DIP 费用/g, '本病组诊疗费用').replace(/DIP 超支/g, '病组预算超支')
    .replace(/SAN/g, '精神').replace(/deadline/g, '截止日期');
}

/** Summarize only the action and its observed outcome, withholding hidden risk scores. */
export function eventPlayerOutcome(label: string, consequences: string, failed = false): string {
  const clauses = consequences.split(/[；;]/).map(c => c.trim()).filter(Boolean).flatMap(c => {
    if (/写入|清除|flag|候选|种子|概率|权重|引擎|掷 d20|检定|同上|转[①②③]|DC|AP|分钟|上限|恢复到|睡眠恢复|按 01|刑拘|结局|三上限|现金压力|\+1\s*$|只记此次|须有玩家|不可用|不自动|余额\s*[−-]\s*（/.test(c)) return [];
    const p = c.replace(/[RDCF]\s*[+−-]\s*\d+(?:（[^）]*）)?/g, '')
      .replace(/(?:无[ RDCF]*隐患|隐患保留|无事|无收益|无代价|无隐患)/g, '')
      .replace(/(?:余额|负债|绩效|体力|SAN|情绪|抑郁|声望|主任关系|护士长关系|同年住院医关系|同事关系|家人关系)\s*[+−-]\s*¥?[\d,]+/g, '')
      .replace(/(?:^[，,\s]+|[，,\s]+$)/g, '').replace(/（[^）]*）/g, '').trim();
    if (!p || /^[、，。；：,;:\s\d.%+−-]+$/.test(p) || /^(?:次日|D\+|D\d|每日|三日|两日|局终)/.test(p)) return [];
    return [p.replace(/^[：:]/, '').replace(/[。；，]+$/, '') + '。'];
  });
  if (clauses.length) return eventPlayerText([...new Set(clauses)].join(''));
  if (failed) return '对方没有同意，谈话结束时这件事仍未解决。';
  const short: Record<string, string> = {
    收: '你收下了这笔款，保留了来往记录。', 收下: '你收下了对方送来的东西。', 拒绝: '你说明了自己的决定，没有接受这个请求。', 不管: '你没有介入，继续处理手头的事。',
    不去: '你回复了不能到场。', 去: '你按约到场。', 签: '你在文件上签下了自己的名字。', 不签: '你没有签字，把文件交回对方。',
    沉默: '你没有回答，对方说完后等着你开口。', 不问: '你没有再问，把手头的事情接着做完。',
    拒签: '你没有签字，向对方说明了自己的职责范围。', 放弃: '你结束了这次安排。', 不回应: '你没有回复这条消息。',
    借: '你转出约定的款项，留下金额和归还日期。', 不借: '你没有转账，说明了自己眼下的开支。', 借一半: '你转出约定的一半，留下金额和归还日期。',
    不回复: '你没有回复来信，仍需在原期限前处理。', 不回: '你没有回复这条消息。', 同意: '你答应了这项安排。', 接受: '你确认接受这项安排。',
  };
  return eventPlayerText(short[label] ?? `${label.replace(/[。]+$/, '')}。`);
}

export function eventPlayerHint(raw: string): string {
  const parts = raw.split(/[；;]/).map(p => p.trim()).filter(p => /(?:\d+\s*AP|AP\s*[+−=\-]|夜班\s*\d+|余额|负债|绩效|体力|SAN|情绪|抑郁|声望|关系|睡眠恢复|现金压力|次日|D\+\d+\s*结算)/.test(p));
  return eventPlayerText(parts.filter(p=>!/不可用|不自动|写不实|引擎|按 0\d|§|权重|D\d+\s*结算|已收总额|DC|检定/.test(p)).map(p => p.replace(/`[^`]+`/g, '').replace(/[RDCF]\s*[+−-]\s*\d+(?:（[^）]*）)?/g, '')
    .replace(/写入.*$/, '').replace(/引擎掷 d20[^；]*$/, '').replace(/（按 01[^）]*）/g, '').replace(/\bAP\b/g, '行动值').replace(/^[，；\s]+|[，；\s]+$/g, '')).filter(Boolean).join('；'));
}
