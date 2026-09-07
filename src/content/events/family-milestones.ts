import type {Card,Run}from '../../game/types';
import type {EventCard}from './types';
import {RULES}from '../../game/rules';
import {runRandom}from '../../game/run-random';

export function weddingDayCard(r:Run):Card|undefined {
  const appointment=r.authored?.activeFacts['wedding-due'];
  if(!appointment||appointment.day>r.day||r.day>RULES.days)return;
  const id=`${r.id}:wedding-day:${appointment.day}`;
  if(r.authored?.published[id])return;
  const going=appointment.source.endsWith('E-106-a');
  return {id,kind:'story',shiftPhase:'交班',actor:'mother',scope:{kind:'personal',id:`${r.id}:family`},title:'婚礼当天',
    text:going?'今天的临床班已经换出。母亲一早发来定位，说桌上给你留了位置，弟弟在门口等你。':'母亲发来婚宴的照片，桌牌上还有你的名字。今天你留在医院，没有赶回去。',
    options:going?[
      {id:`${id}:attend`,label:'赶到婚宴，和家里人坐一桌',ap:0,minutes:0,cost:0,effects:{emotion:5,flags:['家庭-婚礼已到','wedding-attended']},result:'弟弟从门口迎过来，把你带到母亲旁边。上菜时他又过来添了一把椅子，说晚点一起拍张照。'},
      {id:`${id}:absent`,label:'临时不回去，打电话说明',ap:0,minutes:0,cost:0,effects:{emotion:-10,relations:{family:-1},flags:['家庭-婚礼未到','wedding-absent']},result:'你没有回去。母亲听完说了句知道了，电话那头有人催着开席。已经换出的班和付过的路费没有退回。'},
    ]:[{id:`${id}:absent`,label:'看完照片，给家里回消息',ap:0,minutes:0,cost:0,effects:{flags:['家庭-婚礼未到','wedding-absent']},result:'你回了一句祝福。照片里家人坐满了一桌，原来写着你名字的桌牌被挪到旁边。'}]};
}
/** Clinical care or a decision about money does not choose a parent's outcome.
 * The death variant is a separate course event and stops future ICU charges. */
export function familyDeathVariant(r:Run,card:EventCard):EventCard|undefined {
  if(card.authoredEventId!=='E-102'||runRandom(r,'family:icu-course')>=RULES.family.deathChance)return;
  const shared={flags:['家庭-丧亲','father-deceased'],clear:['家庭-车祸-ICU中','家庭-出院']};
  const labels=['请假回去，和家里人一起办理后事','先把钱转回家，请弟弟安排','留在医院，电话与家里核对后事'];
  const texts=['主任批了假。你把病区交接单写完，给母亲回电话，问她现在在哪栋楼。','你转出三千元。弟弟把收款截图发来，随后问父亲那件外套放在哪里。','你把母亲说的事项记下来，逐项打电话联系。直到接班的人来敲门，你才发现饭盒还没有打开。'];
  return {...card,title:'家里的电话',text:'ICU 医生打来电话，说父亲病情再次恶化，抢救没有成功。母亲接过电话，问你什么时候能回去。',
    onEnter:{san:-RULES.family.bereavementSan,depression:RULES.family.bereavementDepression,...shared},
    options:card.options.map((o,i)=>({...o,label:labels[i],result:texts[i],ap:0,minutes:0,cost:0,check:undefined,chanceCheck:undefined,failureTotal:undefined,failureDeferred:[],failureModifiers:[],deferred:[],
      modifiers:i===0?[{id:`${o.id}:bereavement-leave`,kind:'leave' as const,value:2,description:'请假两天回家，由同事接管临床工作。'}]:[],
      effects:{...shared,...(i===0?{relations:{family:1,chief:-1}}:i===1?{cash:-3000,emotion:-5}:{emotion:-10,relations:{family:-1}})},emittedFacts:shared.flags,hint:i===0?'明日起停诊休息两天，仍需处理私人账单。':i===1?'转给家里 3000 元，情绪减少 5。':'情绪减少 10，家人关系减少 1。'}))};
}
