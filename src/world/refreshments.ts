import type {Run} from '../game/types';
import {costTuning} from '../game/costs';
import {talentCoffee,talentNap} from '../game/talents';
import {talentContext,liveCap} from '../game/traits';
import {RULES} from '../game/rules';
export function worldCoffeeOffering(r:Run){
 const tuning=costTuning(r),serving=talentCoffee(talentContext(r),r.coffee),limit=tuning.coffeeLimit??3;
 const busy=r.phase!=='play'||!!r.emergency;
 const allowed=!busy&&serving.allowed&&r.coffee<limit,price=tuning.coffeePrice??RULES.coffeeCost;
 const recovery=r.coffee===0&&tuning.coffeeFirst!==undefined?tuning.coffeeFirst:serving.stamina;
 const stamina=Math.max(0,Math.min(liveCap(r,'stamina')-r.vitals.stamina,recovery));
 const reputation=Math.max(0,r.reputation+serving.reputation)-r.reputation;
 return {allowed,price,stamina,reputation,remaining:Math.max(0,limit-r.coffee),label:allowed?`咖啡 · ¥${price} · 体力 +${stamina}${reputation?` · 声望 ${reputation}`:''}`:busy?'咖啡 · 先处理当前事项':'咖啡 · 今日已用完',text:allowed?`你买这杯咖啡要付 ¥${price}，喝完恢复 ${stamina} 点体力${reputation?`，声望 ${reputation} 点`:''}。今日还可购买 ${Math.max(0,limit-r.coffee)} 杯。`:busy?'当前事项尚未处理完，现在不能离开去买咖啡。':'今日的咖啡份数已用完。'};
}
export function worldNapOffering(r:Run){
 const nap=talentNap(talentContext(r),r.nap),inWindow=r.shiftPhase==='结算',allowed=nap.allowed&&r.ap>=nap.ap&&inWindow&&!r.emergency&&r.phase==='play';
 const stamina=Math.max(0,Math.min(liveCap(r,'stamina')-r.vitals.stamina,nap.stamina));
 return {...nap,allowed,stamina,label:r.nap?'午睡 · 今天已用过':`午睡 · ${nap.ap} 行动 · 体力 +${stamina}`,
  text:r.nap?'你今天已经午睡过了，明天才能再午睡。':!inWindow?'门诊结束、进入结算时段后，可以回值班室午睡；交班、查房和夜班时不能使用。':r.ap<nap.ap?`午睡需要 ${nap.ap} 点行动，当前只有 ${r.ap} 点；不能用午睡透支行动。`:`消耗 ${nap.ap} 点行动，体力恢复 ${stamina} 点。不扣个人余额。`};
}
