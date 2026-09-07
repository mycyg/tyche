import {describe,expect,it} from 'vitest';
import * as t from './talents';
import {DEBUFF_DEFINITIONS,TALENT_DEFINITIONS} from '../content/talents';
import type {Effects,Hazard,HazardInput} from './types';

const ctx=(talents:string[]=[],debuffs:string[]=[],memory=t.initialTalentMemory(),day=1):t.TalentContext=>({talents,debuffs,memory,day});
const check=(operation:t.TalentOperation,actor:t.TalentActor='patient',extra:Partial<t.TalentCheckContext>={}):t.TalentCheckContext=>({operation,actor,...extra});
const day={emotion:60,san:70,reputation:50,relations:{chief:2,nurse:2,peer:2,family:2},debt:1,fullSleep:true,coffeeCount:0};
const hazard=(type:HazardInput['type'],weight=100):HazardInput=>({type,weight,reason:'本次处置',norm:'相应规范',causal:true});
const costs:t.TalentCosts={ap:1,minutes:10,cost:100,stamina:3};
const action:t.TalentCostContext={operation:'treatment',clinical:true,isNight:false,quality:'correct'};
function advanceDay(s:t.TalentContext,summary=day):t.TalentContext {
  const out=t.talentDayEnd(s,summary);return {...s,day:s.day+1,memory:out.memory,debuffs:s.debuffs.filter(id=>!out.removeDebuffs.includes(id))};
}

describe('complete talent and state definitions',()=>{
  it('contains all 30 original IDs and all 24 state IDs with prices and recovery',()=>{
    expect(TALENT_DEFINITIONS.map(x=>x.id)).toEqual(Array.from({length:30},(_,i)=>`T${String(i+1).padStart(2,'0')}`));
    expect(DEBUFF_DEFINITIONS.map(x=>x.id)).toEqual(Array.from({length:24},(_,i)=>`B${String(i+1).padStart(2,'0')}`));
    for(const talent of TALENT_DEFINITIONS){expect(talent.benefit.length).toBeGreaterThan(5);expect(talent.price.length).toBeGreaterThan(5);expect(talent.detail.length).toBeGreaterThan(10);expect(talent.source).toContain(talent.id);}
    for(const debuff of DEBUFF_DEFINITIONS){expect(debuff.recovery.length).toBeGreaterThan(5);expect(debuff.weight).toBeGreaterThan(0);}
  });
  it('validates rarity pool, duplicate selections, unlocked fourth slot and family limit',()=>{
    expect(t.validateTalentSelection(['T01','T06','T11'])).toEqual([]);
    expect(t.validateTalentSelection(['T01','T02','T03']).join()).toContain('最多选择 2');
    expect(t.validateTalentSelection(['T01','T01']).join()).toContain('重复');
    expect(t.validateTalentSelection(['T01','T06','T11','T16'])).not.toEqual([]);
    expect(t.validateTalentSelection(['T01','T06','T11','T16'],true)).toEqual([]);
    expect(t.drawTalentPool(()=>0,9)).toHaveLength(9);
    expect(new Set(t.drawTalentPool(()=>.5,30)).size).toBe(30);
  });
});

describe('opening and day boundaries',()=>{
  it('T11/T14/T16/T24 modify only their authored opening resources and cannot double apply',()=>{
    const s=ctx(['T11','T14','T16','T24']);const r=t.talentStart(s);
    expect(r.effects).toEqual({caps:{stamina:20},cash:5000,reputation:-10,relations:{peer:-1}});
    expect(t.talentStart({...s,memory:r.memory}).effects).toEqual({});
  });
  it('T04, B03 and post-night action penalties compose, while T17 cancels only post-night AP',()=>{
    expect(t.talentBaseAp(ctx(['T04'],['B03']),12,true)).toBe(8);
    expect(t.talentBaseAp(ctx(['T04','T17'],['B03']),12,true)).toBe(10);
  });
  it('T17 daytime cap returns at night and post-night fatigue is starting stamina, not a lower cap',()=>{
    const s=ctx(['T17','T16']);expect(t.talentStaminaCap(s,120,false)).toBe(105);expect(t.talentStaminaCap(s,120,true)).toBe(120);
    expect(t.talentWakingStamina(s,105,true)).toBe(90);expect(t.talentStaminaCap(s,120,false)).toBe(105);
    expect(t.talentWakingStamina(ctx(),100,true)).toBe(70);
    expect(t.talentWakingStamina(ctx([],['B01']),100,false)).toBe(70);
  });
  it('T24 and B17 add percentage points; T25 halves only natural pressure decay',()=>{
    expect(t.talentInterestRate(ctx(['T24'],['B17']))).toBeCloseTo(.05);
    expect(t.talentPressureDecay(ctx(['T25']))).toBe(1.5);
  });
  it('T09 pays once every night, never daytime or repeated render',()=>{
    const s=ctx(['T09']);const r=t.talentNightStart(s);expect(r.effects.stamina).toBe(-3);
    expect(t.talentNightStart({...s,memory:r.memory}).effects).toEqual({});
    expect(t.talentNightStart({...s,day:3,memory:r.memory}).effects.stamina).toBe(-3);
  });
  it('T19 daily reward and fee stop only when stomach pain is active',()=>{
    expect(t.talentDayEnd(ctx(['T19','T10'],['B09']),day).effects).toMatchObject({emotion:-6,cash:-60});
    expect(t.talentDayEnd(ctx(['T19'],['B03']),day).effects).toEqual({emotion:0});
    expect(t.talentFoodPositive(ctx(['T19']))).toBe(true);expect(t.talentFoodPositive(ctx(['T19'],['B03']))).toBe(false);
  });
  it('T20 permanent B03 begins on day 8, survives gastroscopy and natural-20 removal',()=>{
    expect(t.talentDayStart(ctx(['T20'],[],undefined,7)).addDebuffs).toEqual([]);
    const r=t.talentDayStart(ctx(['T20'],[],undefined,8));expect(r.addDebuffs).toEqual(['B03']);expect(r.memory.permanentStomach).toBe(true);
    const s=ctx(['T20'],['B03'],r.memory,8);expect(t.talentRecover(s,'gastroscopy').removeDebuffs).toEqual([]);expect(t.talentRemovableDebuffs(s)).toEqual([]);
  });
});

describe('actor- and operation-specific check contract',()=>{
  it('T04/B02/B07 apply to observation, not patient history or actual treatment efficacy',()=>{
    const s=ctx(['T04'],['B02','B07']);expect(t.talentCheck(s,check('observe')).modifier).toBe(-2);
    expect(t.talentCheck(s,check('history')).modifier).toBe(0);expect(t.talentCheck(s,check('treatment')).modifier).toBe(0);
    expect(t.talentCheck(s,check('observe','patient',{archiveMatched:true})).modifier).toBe(1);
    expect(t.talentCheck(ctx(),check('observe','patient',{archiveMatched:true})).modifier).toBe(2);
  });
  it('T11 improves comfort only, B11 adds disadvantage, T15 is specific to relatives',()=>{
    const s=ctx(['T11','T15'],['B11']);expect(t.talentCheck(s,check('comfort','family'))).toMatchObject({modifier:2,advantage:false,disadvantage:false});
    expect(t.talentCheck(s,check('history','family'))).toMatchObject({advantage:true,disadvantage:false});
    expect(t.talentCheck(s,check('history','patient'))).toMatchObject({advantage:false,disadvantage:true});
    expect(t.talentCheck(s,check('persuade','family'))).toMatchObject({modifier:0,advantage:false,disadvantage:false});
  });
  it('T14/B13 affect only persuasion of the chief, and T29 needs matching actual chief knowledge',()=>{
    let s=ctx(['T14','T29'],['B13']);expect(t.talentCheck(s,check('persuade','chief'))).toMatchObject({modifier:2,dcDelta:2});
    expect(t.talentCheck(s,check('persuade','family'))).toMatchObject({modifier:0,dcDelta:0});
    const research=t.talentResearch(s,'paper-A');s={...s,memory:t.talentChiefLearns({...s,memory:research.memory},'paper-B')};
    expect(t.talentCheck(s,check('persuade','chief')).modifier).toBe(2);
    s={...s,memory:t.talentChiefLearns(s,'paper-A')};expect(t.talentCheck(s,check('persuade','chief')).modifier).toBe(0);
  });
  it('T08 consultation DC is not a bonus to all persuasion and halves only arrival waiting',()=>{
    const s=ctx(['T08']);expect(t.talentCheck(s,check('consult','peer')).dcDelta).toBe(-3);
    expect(t.talentCheck(s,check('persuade','peer')).dcDelta).toBe(0);
    expect(t.talentCosts(s,costs,{...action,operation:'consult-wait'}).minutes).toBe(5);
    expect(t.talentCosts(s,costs,action).minutes).toBe(10);
  });
  it('T07 signs records without forcing patient agreement and still pays one AP',()=>{
    const s=ctx(['T07']);expect(t.talentCheck(s,check('consent')).signatureAutomatic).toBe(true);
    expect(t.talentCheck(s,check('persuade')).signatureAutomatic).toBe(false);
    expect(t.talentCosts(s,{...costs,ap:0},{...action,operation:'refusal-signature'}).ap).toBe(1);
    expect(t.talentCosts(s,costs,{...action,operation:'consent'}).ap).toBe(1);
    expect(t.talentHazards(s,[hazard('C')],{unsignedConsent:true})[0].weight).toBe(0);
    expect(t.talentHazards(s,[hazard('C')])[0].weight).toBe(100);
  });
  it('T21 end-of-day cost applies only if T01 is absent',()=>{
    expect(t.talentCheck(ctx(['T21']),check('day-end')).dcDelta).toBe(1);
    expect(t.talentCheck(ctx(['T21','T01']),check('day-end')).dcDelta).toBe(0);
  });
  it('T22 rerolls are daily, cannot reopen settled effects, and 1/2 are critical failures',()=>{
    let s=ctx(['T22']);expect(t.talentRerollsRemaining(s)).toBe(1);expect(t.useTalentReroll(s,false)).toBeNull();
    s={...s,memory:t.useTalentReroll(s,true)!};expect(t.useTalentReroll(s,true)).toBeNull();expect(t.talentRerollsRemaining({...s,day:2})).toBe(1);
    expect(t.talentRollOutcome(s,2,100,1)).toEqual({success:false,critical:'failure'});
    expect(t.talentRollOutcome(ctx(),2,100,1)).toEqual({success:true,critical:null});
    expect(t.talentRollOutcome(s,20,-100,100)).toEqual({success:true,critical:'success'});
  });
});

describe('patient-specific knowledge, never diagnosis reroll',()=>{
  const clue:t.IntuitionClue={id:'allergy',text:'旧病历有过敏记录。',direction:'medication'};
  it('T01 first contact is once per patient, scope-bound, and T04 gives direction',()=>{
    const s=ctx(['T01','T04']);const r=t.firstTalentContact(s,'patient-A',clue,0);
    expect(r.effects.san).toBe(-5);expect(r.hint).toContain('用药');expect(r.memory.intuitionReady).toEqual(['patient-A']);
    expect(t.firstTalentContact({...s,memory:r.memory},'patient-A',clue,0).effects).toEqual({});
    expect(t.talentCheck({...s,memory:r.memory},check('history','patient',{patientId:'patient-B'})).advantage).toBe(false);
    const mem=t.commitTalentCheck({...s,memory:r.memory},check('history','patient',{patientId:'patient-A'}));expect(mem.intuitionReady).toEqual([]);
  });
  it('T01/T21/B07 chance composes before first-contact roll, and failed hint cannot be retried',()=>{
    const s=ctx(['T01','T21'],['B07']);expect(t.talentIntuitionChance(s)).toBe(.25);
    const r=t.firstTalentContact(s,'A',clue,.3);expect(r.effects).toEqual({});expect(r.clue).toBeUndefined();
    expect(t.firstTalentContact({...s,memory:r.memory},'A',clue,0).clue).toBeUndefined();
    expect(t.firstTalentContact(s,'B',undefined,0).effects).toEqual({});
  });
  it('T02 reveals a real unseen clue for 2 AP, never duplicates or manufactures facts',()=>{
    const s=ctx(['T02']);const r=t.talentChartReview(s,'A',[clue]);expect(r.clue?.id).toBe('allergy');expect(r.effects.ap).toBe(-2);
    expect(t.talentChartReview({...s,memory:r.memory},'A',[clue]).clue).toBeUndefined();
    expect(t.talentChartReview(s,'B',[]).effects).toEqual({});
  });
  it('T03 needs an authored scent and charges emotion once per patient',()=>{
    const s=ctx(['T03']);const r=t.talentSmell(s,'A',{kind:'ketone',text:'呼气有酮味。'});expect(r.effects.emotion).toBe(-2);
    expect(t.talentSmell({...s,memory:r.memory},'A',{kind:'ketone',text:'呼气有酮味。'}).effects).toEqual({});
    expect(t.talentSmell(s,'B',undefined).effects).toEqual({});
  });
  it('T05 has exactly five whole-run uses, first-node only and no unread report',()=>{
    let s=ctx(['T05']);expect(t.talentFullReview(s,'A',false,true).allowed).toBe(false);expect(t.talentFullReview(s,'A',true,false).allowed).toBe(false);
    for(let i=0;i<5;i++){const r=t.talentFullReview(s,String(i),true,true);expect(r.allowed).toBe(true);expect(r.extraMinutes).toBe(10);expect(r.effects.stamina).toBe(-3);s={...s,memory:r.memory};}
    expect(t.talentFullReview(s,'sixth',true,true).allowed).toBe(false);expect(t.talentFullReview(s,'0',true,true).allowed).toBe(false);
  });
  it('T10 exposes the supplied actual norm once per patient',()=>{
    const s=ctx(['T10']);const r=t.talentNormQuote(s,'A','核对患者身份。');expect(r.quote).toBe('核对患者身份。');
    expect(t.talentNormQuote({...s,memory:r.memory},'A','核对患者身份。').quote).toBeUndefined();
  });
});

describe('cost and effect transforms',()=>{
  it('T06/B08/B22 times, T26/B20 case charges and T17 night stamina multiply exactly once',()=>{
    const s=ctx(['T06','T26','T17'],['B08','B20','B22']);const out=t.talentCosts(s,costs,{...action,isNight:true});
    expect(out.minutes).toBeCloseTo(11*1.15*1.2);expect(out.cost).toBeCloseTo(138);expect(out.stamina).toBeCloseTo(2.1);
    expect(t.talentCosts(s,costs,{...action,clinical:false}).cost).toBe(100);
    expect(t.talentCosts(ctx([],['B22']),costs,{...action,quality:'neutral'}).minutes).toBe(8);
  });
  it('T12 full exam costs 4 stamina, B02 adds 1, while only completed scoped exams earn trust',()=>{
    const s=ctx(['T12'],['B02']);expect(t.talentCosts(s,costs,{...action,operation:'full-exam'}).stamina).toBe(5);
    const r=t.talentAfterAction(s,{id:'a',operation:'full-exam',patientId:'A'});expect(r.patientTrust).toBe(3);expect(r.complaintDelta).toBe(-1);
    expect(t.talentAfterAction({...s,memory:r.memory},{id:'a',operation:'full-exam',patientId:'A'}).patientTrust).toBe(0);
    expect(t.talentAfterAction(s,{id:'b',operation:'observe',patientId:'B'}).patientTrust).toBe(0);
  });
  it('T06+T09, T10, T26, B08, B14 and B20 adjust the correct new hazard categories',()=>{
    const s=ctx(['T06','T09','T10','T26'],['B08','B14','B20']);const out=t.talentHazards(s,['D','R','C','F'].map(type=>hazard(type as HazardInput['type'])));
    expect(out.map(x=>x.weight)).toEqual([100*.7*.9*.9,100*.85*.6*.8,120,208]);
    expect(out.every(x=>x.causal)).toBe(true);
  });
  it('T08 adds F=5 per actual consultation and B21 adds AP=1, not on ordinary persuasion',()=>{
    const s=ctx(['T08'],['B21']);expect(t.talentCosts(s,costs,{...action,operation:'consult'}).ap).toBe(2);
    expect(t.talentAfterAction(s,{id:'a',operation:'consult',patientId:'A'}).effects.hazards?.[0].weight).toBe(5);
    expect(t.talentAfterAction(s,{id:'b',operation:'persuade',patientId:'A'}).effects.hazards).toBeUndefined();
  });
  it('T16 halves random rewards only; T13 reduces dispute harm but not patient death',()=>{
    const e:Effects={cash:1000,emotion:10,reputation:10,san:-10};
    expect(t.talentEffects(ctx(['T16']),e,{randomEvent:true})).toMatchObject({cash:500,emotion:5,reputation:5,san:-10});
    expect(t.talentEffects(ctx(['T16']),e,{correctCare:true})).toEqual(e);
    expect(t.talentEffects(ctx(['T13']),{san:-10,emotion:-8,reputation:20},{dispute:true})).toEqual({san:-5,emotion:-4,reputation:17});
    expect(t.talentEffects(ctx(['T13']),{san:-15},{ownPatientDeath:true}).san).toBe(-15);
  });
  it('B10 applies only to notices and B12 consumes only correct-care reward/death cost',()=>{
    const s=ctx([],['B10','B12']);expect(t.talentEffects(s,{emotion:-10},{departmentNotice:true}).emotion).toBe(-15);
    expect(t.talentEffects(s,{emotion:-10},{dispute:true}).emotion).toBe(-10);
    expect(t.talentEffects(s,{emotion:5},{correctCare:true}).emotion).toBe(0);
    expect(t.talentEffects(s,{emotion:5},{}).emotion).toBe(5);
    expect(t.talentEffects(s,{san:-15},{ownPatientDeath:true}).san).toBe(-5);
    expect(t.talentDayEnd(s,day).effects.depression).toBe(2);
  });
  it('T18 nap cost/recovery, T20 coffee, B04 tolerance and B15 penalties retain base rules',()=>{
    expect(t.talentNap(ctx(['T18']),false)).toEqual({allowed:true,stamina:15,ap:2});expect(t.talentNap(ctx(['T18']),true).allowed).toBe(false);
    expect([0,1,2].map(i=>t.talentCoffee(ctx(),i).stamina)).toEqual([15,8,3]);
    expect(t.talentCoffee(ctx([],['B15']),1).reputation).toBe(-3);
    expect(t.talentCoffee(ctx(['T20'],['B15']),2)).toEqual({allowed:true,stamina:15,reputation:0});
    expect(t.talentCoffee(ctx(['T20'],['B04']),0).stamina).toBe(5);expect(t.talentCoffee(ctx(),3).allowed).toBe(false);
    expect(t.talentOvertime(ctx([],['B15'])).reputation).toBe(-1);
  });
  it('T23 revives once without waiving subsequent SAN/depression consequences',()=>{
    const s=ctx(['T23']);const r=t.talentSurvival(s,'stamina',120);expect(r.rescued).toBe(true);expect(r.value).toBe(90);expect(r.effects).toEqual({san:-10,depression:10});
    expect(t.talentSurvival({...s,memory:r.memory},'san',100).rescued).toBe(false);
  });
});

describe('story, responsibility and evidence remain scoped',()=>{
  it('event weight modifiers target the relevant family; B16 does not penalize all checks',()=>{
    const s=ctx(['T14','T21'],['B13','B16']);expect(t.talentEventWeight(s,10,{positive:true})).toBe(15);
    expect(t.talentEventWeight(s,10,{chiefResponsibility:true})).toBe(20);expect(t.talentEventWeight(s,10,{peerNegative:true})).toBe(12);
    expect(t.talentEventWeight(s,10,{chiefCallout:true})).toBe(20);expect(t.talentEventWeight(s,10,{peerMeal:true})).toBe(0);
    expect(t.talentCheck(s,check('day-end')).modifier).toBe(0);
  });
  it('all authored story synergies expose actual numeric gates',()=>{
    expect(t.talentDisputeSettlement(ctx(['T11','T13']),2)).toBe(true);expect(t.talentDisputeSettlement(ctx(['T11','T13']),1)).toBe(false);
    expect(t.talentForcedAudit(ctx(['T26','T28']))).toBe(true);expect(t.talentNotPresentThreshold(ctx(['T27','T30']),6)).toBe(4);
  });
  it('T25 relative loan is recorded once per event, without daily phantom cash',()=>{
    const s=ctx(['T25']);const r=t.talentRelativeLoan(s,'family-2');expect(r.effects).toEqual({cash:10000,privateDebt:10000,relations:{family:-1}});
    expect(t.talentRelativeLoan({...s,memory:r.memory},'family-2').allowed).toBe(false);
  });
  it('T28 doubles representative pressure relief and statistics probability without exempting other SAN harm',()=>{
    const s=ctx(['T28']);expect(t.talentRepresentative(s,15,.25)).toEqual({pressureRelief:30,statisticsProbability:.5,canHandOver:false,sanExempt:true});
    expect(t.talentEffects(s,{san:-10},{representativeBenefit:true}).san).toBe(0);expect(t.talentEffects(s,{san:-10},{dispute:true}).san).toBe(-10);
  });
  it('T27 refusal does not discharge, accepted transfer pays once and never alters prior hazards',()=>{
    const s=ctx(['T27']);const prior=[hazard('R')];const original=structuredClone(prior);
    expect(t.talentTransfer(s,'A',false).transferred).toBe(false);
    const r=t.talentTransfer(s,'A',true);expect(r.effects.reputation).toBe(-5);expect(r.notPresentDelta).toBe(1);
    const next={...s,memory:r.memory};expect(t.talentTransfer(next,'A',true).transferred).toBe(false);
    expect(t.talentHazards(next,prior,{patientId:'A',newAfterTransfer:true})).toEqual([]);
    expect(t.talentHazards(next,prior,{patientId:'B',newAfterTransfer:true})).toEqual(prior);expect(prior).toEqual(original);
  });
  it('T29 completes only this project with .40 risk and explicit colleague knowledge',()=>{
    const s=ctx(['T29']);const r=t.talentResearch(s,'paper-A');expect(r.automatic).toBe(true);expect(r.retractionProbability).toBe(.4);expect(r.colleagueKnows).toBe(true);
    expect(r.effects.flags).toContain('beautified:paper-A');expect(r.effects.stamina).toBeUndefined();expect(r.effects.cash).toBeUndefined();
    expect(t.talentResearch({...s,memory:r.memory},'paper-A').automatic).toBe(false);
    expect(t.talentResearch({...s,memory:r.memory},'paper-B').automatic).toBe(true);
  });
  it('T30 adds scoped C15 and doubles only this patients concealment entries after actual death',()=>{
    const s=ctx(['T30']);const r=t.talentConceal(s,'A','action-A');expect(r.suppressEscalation).toBe(true);expect(r.effects.hazards?.[0].weight).toBe(15);
    const h:Hazard={...r.effects.hazards![0],id:'h1',day:1,scope:{kind:'patient',id:'A'},choiceId:'action-A',choice:'隐瞒'};
    const log=[h,{...h,id:'h2',scope:{kind:'patient' as const,id:'B'}},{...h,id:'h3',reason:'其他告知问题'}];
    const death=t.talentConcealDeath({...s,memory:r.memory},'A',log);expect(death.effects.hazards).toHaveLength(1);expect(death.effects.hazards?.[0].weight).toBe(15);
    expect(log[0].weight).toBe(15);expect(t.talentConcealDeath({...s,memory:death.memory},'A',log).effects).toEqual({});
  });
});

describe('all status recovery contracts',()=>{
  it('B01/B05/B07/B04 require two, two, two and three consecutive days respectively',()=>{
    let s=ctx([],['B01','B05','B07','B04']);s=advanceDay(s);expect(s.debuffs).toEqual(['B01','B05','B07','B04']);
    s=advanceDay(s);expect(s.debuffs).toEqual(['B04']);s=advanceDay(s);expect(s.debuffs).toEqual([]);
    let interrupted=ctx([],['B01','B05','B07']);interrupted=advanceDay(interrupted);interrupted=advanceDay(interrupted,{...day,emotion:59,san:69,fullSleep:false});interrupted=advanceDay(interrupted);expect(interrupted.debuffs).toHaveLength(3);
  });
  it('acquiring a state resets its recovery streak and day-end cannot count twice',()=>{
    const memory=t.initialTalentMemory();memory.emotionalNights=5;const r=t.talentGainDebuff(ctx([],[],memory),'B01');expect(r.memory.emotionalNights).toBe(0);
    const first=t.talentDayEnd(ctx([],['B01'],r.memory),day);const repeated=t.talentDayEnd(ctx([],['B01'],first.memory),day);expect(repeated.memory.emotionalNights).toBe(1);
  });
  it('B06/B13/B14/B15/B16/B17 recover at the exact snapshot thresholds',()=>{
    const s=ctx([],['B06','B13','B14','B15','B16','B17']);expect(t.talentAutomaticRecovery(s,{san:70,reputation:70,relations:{chief:4,nurse:4,peer:3},debt:0})).toEqual(s.debuffs);
    expect(t.talentAutomaticRecovery(s,{san:69,reputation:69,relations:{chief:3,nurse:3,peer:2},debt:1})).toEqual([]);
  });
  it('B08/B12/B24 and T20 permanent stomach are excluded from natural-20 removals',()=>{
    expect(t.talentRemovableDebuffs(ctx([],['B08','B12','B24','B01']))).toEqual(['B01']);
  });
  it('B18/B19 are one-off exchanges, not permanent status or invented credit interest',()=>{
    const r=t.talentGainDebuff(ctx(),'B18');expect(r.addDebuffs).toEqual([]);expect(r.effects).toEqual({cash:2000,relations:{family:-1}});expect(r.pressureDelta).toBe(10);
    expect(t.talentGainDebuff(ctx(),'B19').effects.cash).toBe(-500);
  });
  it('B20 expires after seven full days, not the next week boundary',()=>{
    const gained=t.talentGainDebuff(ctx([],[],undefined,5),'B20');expect(t.talentDayStart(ctx([],['B20'],gained.memory,11)).removeDebuffs).not.toContain('B20');
    expect(t.talentDayStart(ctx([],['B20'],gained.memory,12)).removeDebuffs).toContain('B20');
  });
  it('B21 needs three proactive consultations; B22 needs three actual correct actions',()=>{
    let s=ctx([],['B21','B22']);const passive=t.talentAfterAction(s,{id:'passive',operation:'consult',patientId:'A'});expect(passive.memory.proactiveConsults).toBe(0);
    for(let i=1;i<=3;i++){const r=t.talentAfterAction(s,{id:String(i),operation:'consult',patientId:'A',proactive:true,correctCare:true});expect(r.removeDebuffs).toEqual(i===3?['B21','B22']:[]);s={...s,memory:r.memory};}
    expect(t.talentTransferFirst(s)).toBe(true);
  });
  it('B23 rolls only on progress records, T09 immunizes, due records retain patient and record IDs',()=>{
    const s=ctx([],['B23']);expect(t.talentDelayedRecord(s,'A','a','treatment',0).delayed).toBe(false);
    expect(t.talentDelayedRecord(ctx(['T09'],['B23']),'A','a','progress-record',0).delayed).toBe(false);
    const r=t.talentDelayedRecord(s,'A','a','progress-record',.19);expect(r.delayed).toBe(true);expect(r.effects.hazards?.[0].weight).toBe(10);
    expect(t.talentDueRecords({...s,memory:r.memory,day:2})).toEqual([{patientId:'A',recordId:'a',dueDay:2}]);
    expect(t.talentCompleteDelayedRecord({...s,memory:r.memory},'a').delayedRecords).toEqual([]);
  });
  it('B24 shows the real difference and increases only personal over-budget charge',()=>{
    const s=ctx([],['B24']);expect(t.talentShowBudget(s)).toBe(true);expect(t.talentBudgetCharge(s,500)).toBe(600);
    expect(t.talentCosts(s,costs,action).cost).toBe(100);
  });
  it('all active recovery actions have exact scope and explicit gastroscopy price',()=>{
    const s=ctx([],['B01','B02','B03','B06','B09','B10','B11','B23']);
    expect(t.talentRecover(s,'counselling').removeDebuffs).toEqual(['B01','B06']);
    expect(t.talentRecover(s,'day-off').removeDebuffs).toEqual(['B02','B23']);
    expect(t.talentRecover(s,'gastroscopy')).toMatchObject({removeDebuffs:['B03'],apCost:2,cashCost:600,effects:{ap:-2,cash:-600}});
    expect(t.talentRecover(s,'family-clear',false).removeDebuffs).toEqual([]);expect(t.talentRecover(s,'family-clear').removeDebuffs).toEqual(['B09']);
    expect(t.talentRecover(s,'leave-group')).toMatchObject({removeDebuffs:['B10'],effects:{relations:{chief:-1}}});
    expect(t.talentRecover(s,'dispute-ended').removeDebuffs).toEqual(['B11']);
  });
  it('weighted draws double only debt/money, after-night/physical and low-SAN/sensory families',()=>{
    const weights=t.talentDebuffWeights(ctx(['T09']),{debt:1,afterNight:true,san:49});
    expect(weights.find(x=>x.id==='B01')?.weight).toBe(6);expect(weights.find(x=>x.id==='B05')?.weight).toBe(4);expect(weights.find(x=>x.id==='B17')?.weight).toBe(6);
    expect(weights.find(x=>x.id==='B09')?.weight).toBe(2);expect(weights.find(x=>x.id==='B23')).toBeUndefined();
    expect(new Set(t.drawTalentDebuffs(ctx(),{debt:1,afterNight:true,san:49},()=>.5)).size).toBe(3);
  });
  it('B05 skim probability clamps, and B06 night loss is charged by the night baseline rather than an action hook',()=>{
    expect(t.talentSkimChance(ctx([],['B05']),.9)).toBe(1);
    const s=ctx([],['B06']);expect(t.talentAfterAction(s,{id:'arrival-A',operation:'other'}).effects).toEqual({});
  });
});
