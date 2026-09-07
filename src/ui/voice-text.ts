import { hash } from '../game/random';

export function voiceText(text: string): string {
  return text.replace(/<\/?[a-z][a-z0-9]*(?:\s[^>]*)?>/gi, '').replace(/[*#_`]/g, '').replace(/[「」“”]/g, '')
    .replace(/[▸▤◇▦⌕■✓→←]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function voiceKey(text: string, speaker = 'narrator'): string {
  const line = `${speaker}\n${voiceText(text)}`;
  return `v-${hash(line).toString(16).padStart(8, '0')}${hash(`tyche-voice:${line}`).toString(16).padStart(8, '0')}`;
}
export function voiceSentences(text: string): string[] {
  return text.split(/\n+/).flatMap(line=>voiceText(line).match(/[^。！？!?]+[。！？!?]?/g)?.map(s => s.trim()).filter(Boolean)??[]);
}
/** A report can contain only abbreviations and numbers but still be spoken in Chinese. */
export function hasSpokenContent(text: unknown): text is string {
  return typeof text === 'string' && /[\p{Script=Han}]/u.test(pronounce(text));
}
export function pronounce(text: string): string {
  return voiceText(text).replace(/SAN/gi, '精神状态').replace(/\bAP\b/gi, '行动值')
    .replace(/d20/gi, '二十面骰').replace(/DRG/gi, '病组付费').replace(/DIP/gi, '病种分值付费')
    .replace(/¥\s*([\d,]+)/g, (_, value: string) => `${value.replaceAll(',', '')}元`)
    .replace(/\bPICU\b/g,'儿童重症监护室').replace(/\bNICU\b/g,'新生儿重症监护室').replace(/\bICU\b/g, '重症监护室')
    .replace(/HbA1c/gi,'糖化血红蛋白').replace(/NaCl/gi,'氯化钠').replace(/SpO2/gi,'血氧饱和度')
    .replace(/Na⁺/g,'钠离子').replace(/K⁺/g,'钾离子').replace(/Cl⁻/g,'氯离子').replace(/HCO₃⁻/g,'碳酸氢根')
    .replace(/\bMRI\b/g,'磁共振').replace(/\bCTA\b/g,'CT血管成像').replace(/\bECG\b/g,'心电图')
    .replace(/\bC\s*肽/g,'西肽').replace(/mOsm\s*\/\s*kg/gi,'毫渗透摩尔每千克')
    .replace(/[μµu]g\s*\/\s*kg\s*\/\s*min/gi,'微克每千克每分钟')
    .replace(/mg\s*\/\s*kg\s*\/\s*min/gi,'毫克每千克每分钟')
    .replace(/mL\s*\/\s*kg\s*\/\s*h\b/gi,'毫升每千克每小时')
    .replace(/(?<![a-z])L\s*\/\s*min/gi,'升每分钟').replace(/[μµu]g\s*\/\s*min/gi,'微克每分钟')
    .replace(/mmol\s*\/\s*L/gi,'毫摩尔每升').replace(/[μµu]mol\s*\/\s*L/g,'微摩尔每升')
    .replace(/mmol\s*\/\s*h\b/gi,'毫摩尔每小时').replace(/(?<![a-z])mmol(?![a-z])/gi,'毫摩尔')
    .replace(/mg\s*\/\s*kg\s*\/\s*d\b/gi,'毫克每千克每天').replace(/mg\s*\/\s*kg/gi,'毫克每千克')
    .replace(/mL\s*\/\s*kg/gi,'毫升每千克').replace(/mL\s*\/\s*h\b/gi,'毫升每小时')
    .replace(/(?<![a-z])g\s*\/\s*kg/gi,'克每千克')
    .replace(/ng\s*\/\s*mL/gi,'纳克每毫升').replace(/mg\s*\/\s*dL/gi,'毫克每分升').replace(/mg\s*\/\s*L/gi,'毫克每升')
    .replace(/g\s*\/\s*L/gi,'克每升').replace(/U\s*\/\s*L/g,'单位每升')
    .replace(/mmHg/gi,'毫米汞柱').replace(/(?<![a-z])mg(?![a-z])/gi,'毫克').replace(/(?<![a-z])mL(?![a-z])/gi,'毫升')
    .replace(/(?<![a-z])[μµu]g(?![a-z])/gi,'微克').replace(/(?<![a-z])kg(?![a-z])/gi,'千克')
    .replace(/(?<![a-z])min(?![a-z])/gi,'分钟')
    .replace(/(\d+(?:\.\d+)?)\s*(cm|mm|g|L|h|s)(?![a-zA-Z/])/g,(_,value:string,unit:string)=>value+({cm:'厘米',mm:'毫米',g:'克',L:'升',h:'小时',s:'秒'} as Record<string,string>)[unit])
    .replace(/\bq(\d+)\s*小时/gi,'每$1小时').replace(/\bqd\b/gi,'每日一次')
    .replace(/(\d+(?:\.\d+)?)\s*[×x]\s*10\^(\d+)\s*\/\s*L/gi,'$1乘以十的$2次方每升')
    .replace(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g,'$1比$2')
    .replace(/(\d+(?:\.\d+)?)\s*%/g,'百分之$1').replace(/℃/g,'摄氏度')
    .replace(/≥/g,'大于或等于').replace(/≤/g,'小于或等于').replace(/[>＞]/g,'大于').replace(/[<＜]/g,'小于')
    .replace(/(\d)\s*[—–~～]\s*(\d)/g,'$1到$2').replace(/＋|\+/g,'加').replace(/−/g,'减')
    .replace(/\d+(?:,\d{3})*(?:\.\d+)?/g,value=>spokenNumber(value.replaceAll(',','')));
}

export function spokenNumber(value:string):string {
  const digits='零一二三四五六七八九',parts=value.split('.'),integer=Number(parts[0]);
  const small=(n:number):string=>{
    if(n===0)return digits[0];let result='',zero=false;
    for(const [power,unit] of [[1000,'千'],[100,'百'],[10,'十'],[1,'']] as const){
      const digit=Math.floor(n/power)%10;
      if(digit){if(zero)result+='零';result+=digits[digit]+unit;zero=false;}else if(result)zero=true;
    }return result;
  };
  const whole=(n:number):string=>{
    if(n<10000)return small(n);
    const divisor=n>=100000000?100000000:10000,unit=n>=100000000?'亿':'万',remainder=n%divisor;
    return whole(Math.floor(n/divisor))+unit+(remainder?(remainder<divisor/10?'零':'')+whole(remainder):'');
  };
  const head=Number.isSafeInteger(integer)&&integer<1e12?whole(integer).replace(/^一十/,'十'):[...parts[0]].map(d=>digits[+d]).join('');
  return head+(parts[1]?'点'+[...parts[1]].map(d=>digits[+d]).join(''):'');
}
