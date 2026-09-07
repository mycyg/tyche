import {describe,expect,it} from 'vitest';
import {pronounce,spokenNumber,voiceText,hasSpokenContent} from './voice-text';
describe('spoken clinical and game copy',()=>{
  it('includes numeric-only clinical reports while excluding empty symbols',()=>{
    expect(hasSpokenContent('WBC 18.6……PLT 486……CRP 98……ALT 88……')).toBe(true);
    expect(hasSpokenContent('T 38.6℃，HR 104，BP 118/74，RR 18，SpO2 98%。')).toBe(true);
    expect(hasSpokenContent('¥1,800')).toBe(true);
    expect(hasSpokenContent('—')).toBe(false);
    expect(hasSpokenContent(undefined)).toBe(false);
  });
  it('keeps comparison signs and the information between them',()=>{
    expect(voiceText('血糖 <3，血钾 >5。')).toBe('血糖 <3，血钾 >5。');
  });
  it('expands electrolyte superscripts without repeating adjacent report values',()=>{
    expect(pronounce('WBC 22.4……CRP 142……Na⁺ 131……')).toBe('WBC 二十二点四……CRP 一百四十二……钠离子 一百三十一……');
    expect(pronounce('K⁺ 4.2，Cl⁻ 102，HCO₃⁻ 18 mmol/L。')).toBe('钾离子 四点二，氯离子 一百零二，碳酸氢根 十八 毫摩尔每升。');
  });
  it.each([['0','零'],['10','十'],['14','十四'],['1001','一千零一'],['5000','五千'],['10020','一万零二十'],['120000','十二万'],['0.45','零点四五']])('reads %s as %s',(value,result)=>expect(spokenNumber(value)).toBe(result));
  it('uses spoken units and medicine names rather than broken letter sequences',()=>{
    const text=pronounce('0.45% NaCl，HbA1c，3 mOsm/kg，100 mg/kg/d，5–15 min。');
    expect(text).toBe('百分之零点四五 氯化钠，糖化血红蛋白，三 毫渗透摩尔每千克，一百 毫克每千克每天，五到十五 分钟。');
    expect(pronounce('不支付 ¥5,000')).toBe('不支付 五千元');
  });
  it('reads oxygen and infusion rates before expanding their individual units',()=>{
    expect(pronounce('面罩吸氧 10 L/min，输注 0.05μg/kg/min，补液 2mL/kg/h。')).toBe('面罩吸氧 十 升每分钟，输注 零点零五微克每千克每分钟，补液 二毫升每千克每小时。');
  });
  it('recognizes units adjacent to numbers and preserves a negative balance',()=>{
    expect(pronounce('给药5mg，体重60kg；余额 −2100元。')).toBe('给药五毫克，体重六十千克；余额 减二千一百元。');
  });
  it('speaks actual blood pressure, comparison signs and scientific counts without losing digits',()=>{
    expect(pronounce('血压186/108mmHg，血糖＜3.9，白细胞12×10^9/L。')).toBe('血压一百八十六比一百零八毫米汞柱，血糖小于三点九，白细胞十二乘以十的九次方每升。');
  });
  it('does not let an unexpanded quantity or infusion unit lose its milli prefix',()=>{
    expect(pronounce('不超过 20 mmol/h，总量 100 mmol；血钾 3.5 mmol/L。')).toBe('不超过 二十 毫摩尔每小时，总量 一百 毫摩尔；血钾 三点五 毫摩尔每升。');
    expect(pronounce('直径2cm、层厚5mm；2g，1L，3h，10s。')).toBe('直径二厘米、层厚五毫米；二克，一升，三小时，十秒。');
    expect(pronounce('10mg，12×10^9/L，5mg/kg/min，V3导联。')).toBe('十毫克，十二乘以十的九次方每升，五毫克每千克每分钟，V三导联。');
    expect(pronounce('0.4g qd，1g q8h，0.5g q6 小时；2g/kg。')).toBe('零点四克 每日一次，一克 每八小时，零点五克 每六小时；二克每千克。');
  });
});
