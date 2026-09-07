import {describe,expect,it} from 'vitest';
import {act,availableEncounters,availableOptions,currentCard,newMeta,publicState,resignationAvailable,assetSaleOffer,grayIncomeOffer,reward,startRun,upgrade} from './engine';
import {createPatient,makeWardCard} from './cards';
import {beginClinical} from './clinical';
import {tribunalEnding} from './endings';
import {encounteredCollections} from './encounters';
import {RULES} from './rules';
import {skimProbability} from './perception';
import {decode,emptySave,encode,migrateLegacyCollapse} from './storage';
import {runSimulation} from '../../scripts/simulate';
import type {Card,Meta,Run} from './types';

const story=(id:string,effects:Record<string,unknown>,ap=0):Card=>({id,kind:'story',title:id,text:id,scope:{kind:'personal',id:'self'},options:[{id:`${id}:go`,label:'go',ap,minutes:0,cost:0,result:'ok',effects}]});
const nightCard=(id:string):Card=>({id,kind:'night',shiftPhase:'夜班',title:'night',text:'night',scope:{kind:'personal',id:'self'},options:[{id:`${id}:go`,label:'go',ap:0,minutes:5,cost:0,result:'ok',effects:{}}]});
const restCard=(r:Run):Card=>({id:`rest:${r.day}`,kind:'rest',scope:{kind:'personal',id:'self'},title:'睡觉',text:'',options:[{id:`rest:${r.day}:sleep`,label:'睡觉',ap:0,cost:0,minutes:0,result:'',effects:{}}]});
function base(seed:string,talents:string[]=['T06','T16','T11']):Run {
  const r=startRun(seed,'程医生',talents);r.cash=20000;r.vitals={stamina:80,san:80,emotion:80};
  delete r.pendingCheck;delete r.roll;delete r.feedback;return r;
}
function settle(r:Run,cards:Card[]):Run {r.phase='play';r.shiftPhase='结算';r.queue=cards;r.cursor=0;delete r.feedback;delete r.pendingCheck;delete r.roll;return r;}
function rest(r:Run):Run {r.phase='play';r.shiftPhase='日终';r.queue=[restCard(r)];r.cursor=0;delete r.feedback;delete r.pendingCheck;delete r.roll;return r;}
function sleep(r:Run):Run {r=act(rest(r),{type:'choose',id:`rest:${r.day}:sleep`});return act(r,{type:'continue'});}
function finishNight(r:Run):Run {
  if(r.phase==='roll')r=act(r,{type:'ack-roll'});
  while(r.phase==='debuff')r=act(r,{type:'debuff',id:r.offered[0]});
  if(r.phase==='feedback')r=act(r,{type:'continue'});
  return r;
}
const cycleDay=(r:Run)=>finishNight(sleep(r));
/** Search stable seeds for a specific day-end die face without touching game data. */
function dayRollWithFace(prefix:string,predicate:(face:number)=>boolean,prepare:(r:Run)=>void=()=>{}):Run {
  const origin=base(prefix,[]);origin.patients=[];prepare(origin);
  for(let i=0;i<600;i++){const r=sleep({...structuredClone(origin),seed:`${prefix}-${i}`});if(r.phase==='roll'&&r.roll&&predicate(r.roll.face))return r;}
  throw new Error(`no seed produced the requested day-end face for ${prefix}`);
}

describe('acute events reach their endings through act()',()=>{
  it('SAN at zero on the last daytime card of a night day still ends in the daytime ending',()=>{
    for(const seed of ['a','b','c'])for(const suffix of ['E-200-a','E-200-c']){
      let r=settle(base(seed),[story('trigger',{san:-200}),nightCard('n1')]);
      r=act(r,{type:'choose',id:'trigger:go'});
      expect((currentCard(r) as Card&{authoredEventId?:string}).authoredEventId).toBe('E-200');
      const option=availableOptions(r).find(o=>o.id.endsWith(suffix))!;expect(option).toBeDefined();
      let out=act(r,{type:'choose',id:option.id});if(out.phase==='roll')out=act(out,{type:'ack-roll'});
      expect(out.ending?.id).toBe('END-33');expect(out.ending?.annexIds).toContain('X21');expect(out.phase).toBe('ending');
    }
  });
  it('a second stamina collapse opens the body chain instead of closing the day',()=>{
    let r=settle(base('x17'),[story('trigger',{stamina:-200}),nightCard('n1')]);r.exhausted=1;
    r=act(r,{type:'choose',id:'trigger:go'});
    expect(r.ending).toBeUndefined();expect(r.phase).toBe('play');expect(r.exhausted).toBe(2);
    expect(r.emergency?.vital).toBe('stamina');expect(r.facts['dark-chain:stamina']).toBeDefined();
    expect((currentCard(r) as Card&{authoredEventId?:string}).authoredEventId).toBe('E-238');
  });
  it('first SAN collapse offers one dice rescue; the next collapse opens the crisis chain even after saving',()=>{
    let r=settle(base('san-rescue',[]),[story('t1',{san:-200})]);
    r=act(r,{type:'choose',id:'t1:go'});
    const rescue=availableOptions(r).find(o=>o.id.endsWith('E-200-b'))!;expect(rescue).toBeDefined();
    let passed:Run|undefined;
    for(let s=0;s<300&&!passed;s++){let out=act({...r,seed:`san-rescue-${s}`},{type:'choose',id:rescue.id});if(out.phase==='roll')out=act(out,{type:'ack-roll'});if(out.roll?.success)passed=out;}
    expect(passed).toBeDefined();r=passed!;
    expect(r.vitals.san).toBe(15);expect(r.sanBreaks).toBe(1);expect(r.phase).not.toBe('ending');
    if(r.phase==='feedback')r=act(r,{type:'continue'});
    r=decode(encode({...emptySave(),run:r})).run!;
    r.vitals.san=80;r=settle(r,[story('t2',{san:-200})]);
    r=act(r,{type:'choose',id:'t2:go'});
    expect(r.phase).toBe('play');expect(r.ending).toBeUndefined();expect(r.sanBreaks).toBe(2);
    expect(r.facts['dark-chain:san']).toBeDefined();
    expect((currentCard(r) as Card&{authoredEventId?:string}).authoredEventId).toBe('E-230');
  });
  it('the survival talent spends the same single rescue chance',()=>{
    let r=settle(base('t23',['T23']),[story('t1',{san:-200})]);
    r=act(r,{type:'choose',id:'t1:go'});expect(r.vitals.san).toBeGreaterThan(0);expect(r.sanBreaks).toBe(1);expect(r.emergency).toBeUndefined();
    if(r.phase==='feedback')r=act(r,{type:'continue'});
    r.vitals.san=80;r=settle(r,[story('t2',{san:-200})]);
    r=act(r,{type:'choose',id:'t2:go'});
    expect(r.ending).toBeUndefined();expect(r.vitals.san).toBe(0);expect(r.sanBreaks).toBe(2);
    expect(r.facts['dark-chain:san']).toBeDefined();
  });
  it('the second emotional collapse ends the run through act()',()=>{
    let r=settle(base('emotion'),[story('trig1',{emotion:-200})]);
    r=act(r,{type:'choose',id:'trig1:go'});
    expect((currentCard(r) as Card&{authoredEventId?:string}).authoredEventId).toBe('E-203');
    const walkAway=availableOptions(r).find(o=>o.id.endsWith('E-203-b'))!;expect(walkAway).toBeDefined();
    let out=act(r,{type:'choose',id:walkAway.id});if(out.phase==='roll')out=act(out,{type:'ack-roll'});
    if(out.phase==='feedback')out=act(out,{type:'continue'});
    expect(out.emotionalBreaks).toBe(1);expect(out.vitals.emotion).toBe(40);expect(out.skipNextDay).toBe(true);
    out=finishNight(out);out.vitals={stamina:80,san:80,emotion:80};
    out=settle(out,[story('trig2',{emotion:-200})]);
    out=act(out,{type:'choose',id:'trig2:go'});
    expect(out.phase).toBe('ending');expect(out.ending?.id).toBe('END-33');expect(out.ending?.annexIds).toContain('X25');expect(out.emotionalBreaks).toBe(2);
  });
  it('locks other scenes and personal actions while an acute event is open',()=>{
    let r=settle(base('lock',['T01']),[story('trig',{stamina:-200}),story('other',{}),story('third',{})]);
    r=act(r,{type:'choose',id:'trig:go'});
    expect(r.emergency).toBeDefined();expect(availableEncounters(r).map(c=>c.id)).toEqual([r.emergency!.cardId]);
    expect(act(r,{type:'focus',id:'other'})).toBe(r);
    expect(act(r,{type:'choose',id:'other:go'})).toBe(r);
    expect(act(r,{type:'coffee'})).toBe(r);expect(act(r,{type:'nap'})).toBe(r);expect(act(r,{type:'borrow'})).toBe(r);
    expect(act(r,{type:'resign'})).toBe(r);
  });
  it('a settlement effect that empties a vital interrupts before the next period opens',()=>{
    let r=settle(base('settle-zero',[]),[story('last',{})]);
    r.authored!.ledger.pending.push({id:'test:evening-blow',delay:0,due:r.day,phase:'结算',scope:{kind:'personal',id:r.id},effects:{emotion:-200},description:'测试'});
    r=act(r,{type:'choose',id:'last:go'});r=act(r,{type:'continue'});
    expect(r.emergency?.vital).toBe('emotion');expect(r.phase).toBe('play');expect(r.emotionalBreaks).toBe(1);
    expect(currentCard(r)?.id).toBe(r.emergency!.cardId);
  });
});

describe('action points, overtime and caps through act()',()=>{
  it('clips the current value to the lowered cap before charging overtime stamina',()=>{
    let r=startRun('clip','程医生',[]);r.cash=20000;r.ap=0;settle(r,[story('ot',{},1)]);
    r=act(r,{type:'choose',id:'ot:go'});
    const cap=100-RULES.overtimeCapLoss;
    expect(r.caps.stamina).toBe(cap);expect(r.vitals.stamina).toBe(cap-RULES.overtimeStamina);expect(r.caps.san).toBe(cap);expect(r.overtime).toBe(1);
  });
  it('borrowed points are deducted from tomorrow and each borrow lowers the three caps',()=>{
    let r=startRun('borrow','程医生',[]);r.cash=20000;r.patients=[];settle(r,[story('x',{})]);
    r=act(r,{type:'borrow'});r=act(r,{type:'continue'});r=act(r,{type:'borrow'});r=act(r,{type:'continue'});
    expect(r.borrowed).toBe(2);expect(r.caps.stamina).toBe(100-2*RULES.borrowCapLoss);
    r=cycleDay(r);
    expect(r.day).toBe(2);expect(r.ap).toBe(RULES.ap-2);expect(r.borrowed).toBe(0);
  });
  it('depression at fifty lowers the caps once and the next day starts with one point less',()=>{
    let r=startRun('dep','程医生',[]);r.cash=20000;r.patients=[];r.depression=48;r.vitals.emotion=10;
    const cap=r.caps.san;r=cycleDay(r);
    expect(r.depression).toBeGreaterThanOrEqual(50);expect(r.caps.san).toBe(cap-5);expect(r.ap).toBe(RULES.ap-1);expect(r.facts['depression-cap']).toBeDefined();
    const again=r.caps.san;r=cycleDay(r);expect(r.caps.san).toBe(again);
  });
  it('a nap is only possible after the clinic period with enough action points',()=>{
    const r=base('nap',[]);r.phase='play';r.shiftPhase='查房';r.ap=5;
    expect(act(r,{type:'nap'})).toBe(r);
    r.shiftPhase='结算';const napped=act(r,{type:'nap'});
    expect(napped).not.toBe(r);expect(napped.nap).toBe(true);expect(napped.ap).toBe(4);
    expect(act({...napped,phase:'play'},{type:'nap'})).toEqual({...napped,phase:'play'});
    r.ap=0;expect(act(r,{type:'nap'})).toBe(r);
  });
  it('coffee is limited to three cups and costs reputation from the second cup',()=>{
    let r=base('coffee',[]);r.phase='play';r.shiftPhase='门诊';r.vitals.stamina=40;const reputation=r.reputation;
    const cups=[15,8,3];
    for(let i=0;i<3;i++){const before=r.vitals.stamina;r=act(r,{type:'coffee'});expect(r.vitals.stamina).toBe(before+cups[i]);r=act(r,{type:'continue'});}
    expect(r.coffee).toBe(3);expect(r.reputation).toBe(reputation-4);expect(r.cash).toBe(20000-3*RULES.coffeeCost);
    expect(act(r,{type:'coffee'})).toBe(r);
  });
});

describe('money, debt and funding through act()',()=>{
  it('applies three percent interest, ignores a day off, and resets the uncovered count when income covers it',()=>{
    let r=base('interest',[]);r.patients=[];r.debt=1000;r.skipNextDay=true;
    r=cycleDay(r);
    expect(r.day).toBe(2);expect(r.debt).toBe(1030);expect(r.uncoveredDays).toBe(1);expect(r.facts['leave:2']).toBeDefined();
    r=cycleDay(r);
    expect(r.day).toBe(3);expect(r.uncoveredDays).toBe(1);expect(r.ending).toBeUndefined();expect(r.debt).toBe(1061);
    r.day=7;r=cycleDay(r);
    expect(r.debt).toBe(0);expect(r.uncoveredDays).toBe(0);expect(r.ending).toBeUndefined();
    r.debt=1000;r=cycleDay(r);expect(r.uncoveredDays).toBe(0);expect(r.debt).toBe(1030);
  });
  it('credit debt above the ceiling ends the run at the next interruption',()=>{
    const r=base('ceiling',[]);r.phase='play';r.shiftPhase='结算';r.debt=RULES.debtMax+1;
    const out=act(r,{type:'borrow'});expect(out.phase).toBe('ending');expect(out.ending?.id).toBe('END-26');
  });
  it('living costs can open funding from the day-end roll and credit resumes that roll',()=>{
    let r=base('roll-funding',[]);r.patients=[];r.cash=10;
    r=sleep(r);
    expect(r.phase).toBe('funding');expect(r.pendingResume).toBe('roll');expect(r.roll?.kind).toBe('day');
    r=act(r,{type:'fund',method:'credit'});
    expect(r.phase).toBe('roll');expect(r.debt).toBe(30);expect(r.cash).toBe(0);expect(r.pendingResume).toBeUndefined();
    expect(r.authored?.pressure).toBe(RULES.creditPressure);
    r=act(r,{type:'ack-roll'});expect(['feedback','debuff']).toContain(r.phase);
  });
  it('asset sales use the event offer first, then the default equipment once',()=>{
    const r=base('asset',[]);r.phase='funding';r.cash=-1000;
    expect(assetSaleOffer(r)?.amount).toBe(RULES.assetSale);
    r.facts['asset-offer:car:12000']={day:1,source:'卖掉那辆车',sequence:0};
    expect(assetSaleOffer(r)).toMatchObject({id:'car',amount:12000});
    let out=act(r,{type:'fund',method:'asset'});
    expect(out.cash).toBe(11000);expect(out.facts['asset-sold:car']).toBeDefined();expect(out.facts['asset-sold']).toBeUndefined();
    expect(assetSaleOffer(out)?.id).toBe('equipment');
    out.cash=-100;out.phase='funding';out=act(out,{type:'fund',method:'asset'});
    expect(out.cash).toBe(RULES.assetSale-100);expect(assetSaleOffer(out)).toBeUndefined();
    out.cash=-100;out.phase='funding';expect(act(out,{type:'fund',method:'asset'})).toBe(out);
  });
  it('gray income needs a director offer and records the kickback',()=>{
    const r=base('gray',[]);r.phase='funding';r.cash=-1000;
    expect(grayIncomeOffer(r)).toBeUndefined();expect(act(r,{type:'fund',method:'gray'})).toBe(r);
    r.facts['gray-income-offer:3000']={day:1,source:'E-146',sequence:0};
    const out=act(r,{type:'fund',method:'gray'});
    expect(out.cash).toBe(2000);expect(out.facts['kickback-received']).toBeDefined();expect(out.facts['gray-income-accepted']).toBeDefined();
    expect(grayIncomeOffer(out)).toBeUndefined();
  });
  it('stopping at the funding page ends the run as a resignation',()=>{
    const r=base('stop',[]);r.phase='funding';r.cash=-1000;
    const out=act(r,{type:'fund',method:'stop'});expect(out.phase).toBe('ending');expect(out.ending?.id).toBe('END-33');expect(out.ending?.annexIds).toContain('X31');
  });
  it('a negative performance reduces cash without touching credit debt',()=>{
    let r=settle(base('neg',[]),[story('neg',{income:-200})]);r.debt=1000;r.cash=500;
    r=act(r,{type:'choose',id:'neg:go'});expect(r.debt).toBe(1000);expect(r.cash).toBe(300);expect(r.income).toBe(-200);
  });
  it('weekly settlement notices follow the charged total',()=>{
    for(const [amounts,event] of [[[2000,1500],'E-159'],[[5000,3500],'E-160']] as const){
      let r=base(`dip-${event}`,[]);r.day=7;r.patients=[];
      r.budgetCharges=amounts.map((amount,i)=>({day:3+i,amount,patientId:`p${i}`,source:`charge:${i}`}));
      const emotion=r.vitals.emotion,reputation=r.reputation;
      r=sleep(r);
      const delivered=r.queue.slice(r.cursor).map(c=>(c as Card&{authoredEventId?:string}).authoredEventId);
      expect(delivered).toContain(event);expect(r.phase).toBe('play');
      if(event==='E-159'){expect(delivered).not.toContain('E-160');expect(r.vitals.emotion).toBe(emotion-RULES.weeklyOverspend.emotion-Math.ceil(RULES.pressure[6]/2));expect(r.reputation).toBe(reputation-RULES.weeklyOverspend.reputation);}
    }
  });
});

describe('day-end check through act()',()=>{
  it('a failed check offers three states and one pick; a natural one costs SAN and two picks',()=>{
    const failed=dayRollWithFace('fail',face=>face>1&&face<8,r=>{r.day=14;r.talents=[];});
    let r=act(failed,{type:'ack-roll'});
    expect(r.phase).toBe('debuff');expect(r.offered).toHaveLength(3);expect(r.debuffPicks).toBe(1);
    r=act(r,{type:'debuff',id:r.offered[0]});expect(r.debuffs).toHaveLength(1);expect(r.phase).toBe('feedback');
    const one=dayRollWithFace('nat1',face=>face===1),san=one.vitals.san;
    const picked=act(one,{type:'ack-roll'});
    expect(picked.vitals.san).toBe(san-RULES.critical.sanLoss);expect(picked.debuffPicks).toBe(2);
  });
  it('a natural twenty removes one existing state and three successes lift the mood',()=>{
    const twenty=dayRollWithFace('nat20',face=>face===20,r=>{r.debuffs=['B02'];r.streak=2;});
    const emotion=twenty.vitals.emotion;
    const r=act(twenty,{type:'ack-roll'});
    expect(r.debuffs).toEqual([]);expect(r.streak).toBe(3);expect(r.vitals.emotion).toBe(Math.min(r.caps.emotion,emotion+5));expect(r.feedback?.text).toContain('已解除');
  });
  it('applies the fixed daily pressure to SAN and emotion',()=>{
    let r=base('pressure',[]);r.patients=[];r.day=10;const san=r.vitals.san,emotion=r.vitals.emotion;
    r=sleep(r);
    const loss=RULES.pressure[9];
    expect(r.vitals.san).toBe(san-loss);expect(r.vitals.emotion).toBe(emotion-Math.ceil(loss/2));
  });
});

describe('checks, criticals and perception through act()',()=>{
  const askCard=(r:Run):Card=>({id:'ask',kind:'clinical',title:'问诊',text:'',scope:{kind:'patient',id:r.patients[0].uid},patientId:r.patients[0].uid,
    options:[{id:'ask:go',label:'问',ap:1,minutes:5,cost:0,result:'ok',effects:{},mechanics:{operation:'history',actor:'patient'},check:{skill:'observe',dc:12,failure:{},failureText:'fail'}}]});
  function rollWith(prefix:string,face:number):Run {
    const origin=settle(base(prefix,[]),[]);origin.queue=[askCard(origin)];
    for(let s=0;s<600;s++){const out=act({...origin,seed:`${prefix}-${s}`},{type:'choose',id:'ask:go'});if(out.phase==='roll'&&out.roll?.face===face)return out;}
    throw new Error('no seed produced the face');
  }
  it('a natural one fails and leaves a hazard; a natural twenty reveals a genuine clue',()=>{
    const one=act(rollWith('one',1),{type:'ack-roll'});
    expect(one.hazards.map(h=>`${h.type}${h.weight}`)).toContain(`R${RULES.critical.R}`);
    const twenty=act(rollWith('twenty',20),{type:'ack-roll'});
    expect(twenty.feedback?.text).toContain('补充线索');expect(twenty.hazards).toHaveLength(0);
  });
  it('relationship four gives advantage and one gives disadvantage on the matching check',()=>{
    const chiefCard=(r:Run):Card=>({id:'chief',kind:'story',actor:'chief',title:'主任',text:'',scope:{kind:'personal',id:r.id},options:[{id:'chief:ask',label:'说服',ap:0,minutes:0,cost:0,result:'ok',effects:{},check:{skill:'persuade',dc:12,failure:{},failureText:'fail'}}]});
    const r=settle(base('relation',[]),[]);r.queue=[chiefCard(r)];
    r.relations.chief=4;expect(act(r,{type:'choose',id:'chief:ask'}).roll?.advantage).toBe(true);
    r.relations.chief=1;const low=act(r,{type:'choose',id:'chief:ask'}).roll!;expect(low.advantage).not.toBe(true);expect(low.second).toBeDefined();
  });
  it('a hallucination option costs one action and five minutes and nothing else',()=>{
    let r=settle(base('halluc',[]),[]);r.vitals.san=40;r.ap=6;const card=r.queue[0]??askCard(r);r.queue=[askCard(r)];
    const option=availableOptions(r).find(o=>o.interaction==='hallucination')!;expect(option).toBeDefined();expect(card).toBeDefined();
    const before={...r.vitals};r=act(r,{type:'choose',id:option.id});
    expect(r.ap).toBe(6-RULES.perception.hallucinationAp);expect(r.vitals).toEqual(before);expect(r.cursor).toBe(0);
    expect(r.facts[`perception-checked:${r.patients[0].uid}`]).toBeDefined();
    expect(availableOptions({...r,phase:'play'}).some(o=>o.interaction==='hallucination')).toBe(false);
  });
  it('skim probability follows fatigue, distortion and B05',()=>{
    const r=base('skim',[]);
    expect(skimProbability(r)).toBe(0);
    r.vitals.stamina=49;expect(skimProbability(r)).toBeCloseTo(.3);
    r.vitals.stamina=29;expect(skimProbability(r)).toBeCloseTo(.6);
    r.vitals.stamina=80;r.vitals.san=49;expect(skimProbability(r)).toBeCloseTo(.4);
    r.debuffs=['B05'];expect(skimProbability(r)).toBeCloseTo(.6);
  });
  it('charges the night baseline once per new emergency',()=>{
    const r=base('night',[]);const p=createPatient(r,'C012','night-known');r.patients.push(p);
    const card=beginClinical(r,p)!;card.kind='night';card.shiftPhase='夜班';r.queue=[card];r.cursor=0;r.phase='play';r.shiftPhase='夜班';r.nightMinutes=200;r.nightBudget=200;
    const option=availableOptions(r).find(o=>o.clinicalChoice&&!o.check)!;expect(option).toBeDefined();
    const out=act(r,{type:'choose',id:option.id});
    expect(80-out.vitals.stamina).toBeGreaterThanOrEqual(RULES.nightIncident.stamina);expect(80-out.vitals.san).toBeGreaterThanOrEqual(RULES.nightIncident.san);
    expect(Object.keys(out.facts).some(k=>k.startsWith('night-baseline:'))).toBe(true);
  });
});

describe('leaving work for tomorrow',()=>{
  it('is offered only without action points and records the two hazards',()=>{
    const r=base('defer',[]);r.phase='play';r.shiftPhase='门诊';const card=r.queue.find(c=>['clinical','quick'].includes(c.kind))!;r.queue=[card];r.cursor=0;
    r.ap=1;expect(availableOptions(r).some(o=>o.interaction==='defer')).toBe(false);
    r.ap=0;const defer=availableOptions(r).find(o=>o.interaction==='defer')!;expect(defer).toBeDefined();
    const out=act(r,{type:'choose',id:defer.id});
    expect(out.hazards.map(h=>`${h.type}${h.weight}`)).toEqual([`R${RULES.deferredPatient.R}`,`D${RULES.deferredPatient.D}`]);
    expect(out.deferredWork).toHaveLength(1);expect(out.queue.some(c=>c.id===card.id)).toBe(false);
    const next=cycleDay(out);
    expect(next.day).toBe(2);expect(next.queue.some(c=>c.patientId===card.patientId)).toBe(true);
    expect(next.journal.some(e=>e.title.endsWith('的延期处置'))).toBe(true);
  });
});

describe('tribunal, endings and rewards',()=>{
  it('testify rolls the filing die and ack-roll reaches the ending',()=>{
    const r=base('court',[]);r.day=15;r.phase='tribunal';r.queue=[];r.cursor=0;
    const p=r.patients[0];p.damage=3;r.hazards=[{id:'h',type:'R',weight:60,reason:'未查',norm:'规范',causal:true,day:3,scope:{kind:'patient',id:p.uid},choiceId:'x',choice:'x'}];
    let out=act(r,{type:'testify',response:'facts'});
    expect(out.phase).toBe('roll');expect(out.roll?.kind).toBe('tribunal');expect(out.ending).toBeDefined();
    out=act(out,{type:'ack-roll'});expect(out.phase).toBe('ending');
  });
  it('keeps documented priority when several endings apply',()=>{
    const r=startRun('order','程医生',[]);r.day=15;r.phase='tribunal';r.patients=r.patients.slice(0,1);r.patients[0].damage=0;r.hazards=[];r.facts={};r.committed=[];r.queue=[];
    r.depression=80;r.relations.family=3;r.uncoveredDays=2;r.debt=0;delete r.authored;
    const ending=tribunalEnding(r,'facts');expect(ending.id).toBe('END-23');expect(ending.annexIds).toContain('X24');
  });
  it('rewards follow the documented formula and insight purchases have prices',()=>{
    const r=base('reward',['T06']);r.day=15;r.phase='ending';r.journal=[];
    r.ending={id:'X33',title:'下一站',category:'职业',decision:'',epilogue:'',annexes:[],court:false};
    const {cases,entities}=encounteredCollections(r),entries=cases.length+entities.length;
    const meta=reward(newMeta(),r);
    expect(meta.xp).toBe(3+2+entries+1);expect(meta.insight).toBe(2+entries+2);expect(meta.runs).toBe(1);
    let m:Meta={...meta,insight:100,xp:10};
    m=upgrade(m,'fourth-slot');expect(m.fourthSlot).toBe(true);expect(m.insight).toBe(60);
    m=upgrade(m,'reroll-token');expect(m.rerollToken).toBe(true);expect(m.insight).toBe(50);
    m=upgrade(m,'attending');expect(m.attendingUnlocked).toBe(true);expect(m.insight).toBe(30);
    for(let i=0;i<6;i++)m=upgrade(m,'redraw');expect(m.extraRedraws).toBe(5);expect(m.insight).toBe(15);
    m=upgrade(m,'depression');m=upgrade(m,'depression');m=upgrade(m,'depression');expect(m.depressionRank).toBe(2);expect(m.xp).toBe(4);
    expect(startRun('dep-rank','程医生',[],m).depression).toBe(0);
  });
  it('rounds experience to halves',()=>{
    const r=base('half',['T06']);r.day=15;r.phase='ending';r.difficulty='attending';
    r.ending={id:'X33',title:'下一站',category:'职业',decision:'',epilogue:'',annexes:[],court:false};
    expect(reward(newMeta(),r).xp*2).toBe(Math.round(reward(newMeta(),r).xp*2));
  });
});

describe('resignation from the settlement page',()=>{
  it('publishes the locker-room scene and ends through the existing quit ending',()=>{
    let r=settle(base('resign',['T06']),[story('x',{})]);
    expect(resignationAvailable({...r,shiftPhase:'查房'})).toBe(false);expect(resignationAvailable(r)).toBe(true);
    r=act(r,{type:'resign'});
    expect(r.phase).toBe('play');expect((currentCard(r) as Card&{authoredEventId?:string}).authoredEventId).toBe('E-209');
    expect(r.facts['resign-requested']).toBeDefined();expect(availableOptions(r)).toHaveLength(2);
    expect(act(r,{type:'resign'})).toBe(r);
    expect(decode(encode({...emptySave(),run:r})).run).toEqual(r);
    const clean=act(r,{type:'choose',id:availableOptions(r)[0].id});
    expect(clean.phase).toBe('ending');expect(clean.ending?.id).toBe('END-33');expect(clean.ending?.annexIds).toContain('X31');expect(clean.facts['quit-confirmed']).toBeDefined();
    r.facts['kickback-received']={day:1,source:'test',sequence:0};
    // The airport page (END-08) needs the interception fact of the dark chain; without it the quit lands by remaining state.
    const corrupt=act(r,{type:'choose',id:availableOptions(r)[1].id});
    expect(corrupt.ending?.id).toBe('END-33');expect(corrupt.ending?.annexIds).not.toContain('X31');
  });
  it('is also offered at the day-end summary before the check',()=>{
    let r=base('resign-evening',['T06']);r=act(rest(r),{type:'choose',id:`rest:${r.day}:sleep`});
    expect(r.phase).toBe('feedback');expect(r.feedback?.next).toBe('check');expect(resignationAvailable(r)).toBe(true);
    r=act(r,{type:'resign'});
    expect(r.phase).toBe('play');expect(currentCard(r)?.kind).toBe('story');
    expect(availableOptions(r).every(o=>o.id.includes('E-209'))).toBe(true);
    const out=act(r,{type:'choose',id:availableOptions(r)[0].id});
    expect(out.ending?.id).toBe('END-33');expect(out.ending?.annexIds).toContain('X31');
  });
});

describe('run identity and talent validation',()=>{
  it('the same seed replays the same daily action sequence regardless of when it starts',()=>{
    const a=runSimulation('replay-seed','careful'),b=runSimulation('replay-seed','careful');
    expect(a.r.id).toBe(b.r.id);expect(a.steps).toBe(b.steps);
    expect(a.r.journal.map(e=>`${e.day}:${e.id}`)).toEqual(b.r.journal.map(e=>`${e.day}:${e.id}`));
    expect(JSON.stringify(a.r)).toBe(JSON.stringify(b.r));
  },120000);
  it('startRun rejects unknown, duplicated and over-represented talents',()=>{
    expect(()=>startRun('bad','程医生',['ZZZ'])).toThrow();
    expect(()=>startRun('bad','程医生',['T01','T01'])).toThrow();
    expect(()=>startRun('bad','程医生',['T01','T02','T03'])).toThrow('最多选择 2 项');
  });
});

describe('legacy saves',()=>{
  it('migrates the retired collapse phase and rejects unreachable phases',()=>{
    const r=base('legacy',[]);r.vitals.stamina=0;
    const legacy={...r,phase:'collapse',pendingResume:'play'} as unknown as Record<string,unknown>;
    migrateLegacyCollapse(legacy);expect(legacy.phase).toBe('play');expect(legacy.pendingResume).toBeUndefined();
    const restored=decode(encode({...emptySave(),run:{...r,phase:'collapse' as Run['phase'],pendingResume:'play'}})).run!;
    expect(restored.phase).toBe('play');
    const next=act(restored,{type:'borrow'});expect(next.emergency?.vital).toBe('stamina');
    expect(()=>decode(encode({...emptySave(),run:{...r,phase:'bogus' as Run['phase']}}))).toThrow();
    expect(act(restored,{type:'collapse',method:'report'})).toBe(restored);
  });
});

describe('transferred inpatients and visible budgets',()=>{
  it('C004 keeps the stated fifth hospital day across the bed card, billing and overstay',()=>{
    const r=base('c004',[]);r.day=3;r.patients=[];
    const p=createPatient(r,'C004','handover0');r.patients.push(p);
    expect(r.day-p.admitted+1).toBe(5);expect(p.expectedDays).toBeGreaterThanOrEqual(6);
    expect(makeWardCard(r,p).text).toContain('第 5 天');
    p.expectedDays=5;p.inpatient=true;p.bed=5;p.settled=true;
    let out=cycleDay(r);
    const later=out.patients.find(x=>x.uid===p.uid)!;
    expect(out.day-later.admitted+1).toBe(6);expect(out.facts[`budget-cut:${p.uid}`]).toBeUndefined();
    out.day=4;out=cycleDay(out);
    expect(out.facts[`budget-cut:${p.uid}`]).toBeDefined();
  });
  it('B24 exposes the current patient budget gap to the projection',()=>{
    const r=base('b24',[]);r.phase='play';const card=r.queue.find(c=>c.patientId)!;r.queue=[card];r.cursor=0;
    expect(publicState(r).budget).toBeUndefined();
    r.debuffs=['B24'];const p=r.patients.find(p=>p.uid===card.patientId)!;
    expect(publicState(r).budget).toEqual({patientId:p.uid,spent:p.spent,budget:p.budget,gap:p.budget-p.spent});
  });
  it('T27 drops new hazards for a patient already transferred',()=>{
    const r=settle(base('t27',['T27']),[]);const p=r.patients[0];
    r.talentMemory={...r.talentMemory!,transferredPatients:[p.uid]};
    r.queue=[{id:'late',kind:'story',title:'',text:'',scope:{kind:'patient',id:p.uid},patientId:p.uid,options:[{id:'late:go',label:'x',ap:0,minutes:0,cost:0,result:'',effects:{hazards:[{type:'R',weight:10,reason:'r',norm:'n',causal:false}]}}]}];
    expect(act(r,{type:'choose',id:'late:go'}).hazards).toHaveLength(0);
  });
});
