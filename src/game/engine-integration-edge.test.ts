import {describe,it,expect} from 'vitest';
import {act,availableOptions,currentCard,startRun} from './engine';
import {createPatient} from './cards';
import {beginClinical,visibleClinicalReports} from './clinical';
import {decode,encode,emptySave} from './storage';
import {TALENTS} from './catalog';
import {PATIENT_ENTITIES,CASE_PRESETS,compatibleEntities,instantiatePreset} from '../content/patients';
import {patientRefusalFlag,patientProfile} from './patient-director';
import {optionCosts} from './costs';
import {nightClinicalCharge}from './night-costs';
import {random,die} from './random';
import type {Card,Option,Run} from './types';
function fixture(talents:string[],caseId='C003',seed='talent-edge'):Run {
  const r=startRun(seed,'程医生',talents),p=createPatient(r,caseId,'edge');r.patients.push(p);
  const card=beginClinical(r,p)!;card.shiftPhase='查房';r.queue=[card];r.cursor=0;r.phase='play';r.shiftPhase='查房';
  r.ap=20;r.cash=20000;r.vitals={stamina:80,san:80,emotion:80};delete r.pendingCheck;delete r.roll;delete r.feedback;
  return r;
}
const patient=(r:Run)=>r.patients.find(p=>p.uid===currentCard(r)?.patientId)!;
function choose(r:Run,id:string):Run {const pending=act(r,{type:'choose',id});return pending.phase==='roll'?act(pending,{type:'ack-roll'}):pending;}
function ability(r:Run,name:NonNullable<Option['talentAction']>):Option {const o=availableOptions(r).find(o=>o.talentAction===name);expect(o,`${name} must be offered`).toBeDefined();return o!;}
const reload=(r:Run)=>decode(encode({...emptySave(),run:r})).run!;
describe('real engine talent boundaries',()=>{
  it.each(TALENTS.map(t=>t.id))('%s can execute a concrete clinical action without a placeholder or duplicated commit',id=>{
    const r=fixture([id]),o=availableOptions(r).find(o=>o.clinicalChoice==='s1_meds')!;expect(o).toBeDefined();
    const result=choose(r,o.id);expect(result.committed.filter(x=>x===o.id)).toHaveLength(1);expect(patient(r).clinical!.choices).toHaveLength(0);
    expect(result.patients.find(p=>p.uid===patient(r).uid)!.clinical!.choices).toContain('s1_meds');expect(act(result,{type:'choose',id:o.id})).toBe(result);
  });
  it('T02 consumes exactly 2 action points and reveals one genuine history clue without consuming the current node',()=>{
    const r=fixture(['T02'],'C004'),p=patient(r),o=ability(r,'chart-review'),before=structuredClone(p.clinical!);
    const result=choose(r,o.id),updated=result.patients.find(q=>q.uid===p.uid)!;
    expect(result.ap).toBe(r.ap-2);expect(result.cursor).toBe(r.cursor);expect(updated.clinical!.nodeId).toBe(before.nodeId);expect(updated.clinical!.choices).toEqual(before.choices);
    expect(updated.clinical!.flags.length).toBeGreaterThan(before.flags.length);expect(result.talentMemory!.chartClues[p.uid]).toHaveLength(1);
    expect(result.feedback!.text).not.toMatch(/再问一段病史|尚未发现的线索/);expect(reload(result)).toEqual(result);
  });
  it('T05 costs 3 stamina and 10 real minutes, revealing only an already obtained report',()=>{
    const r=fixture(['T05'],'C009'),p=patient(r);r.queue[r.cursor].kind='night';r.queue[r.cursor].shiftPhase='夜班';r.shiftPhase='夜班';r.nightMinutes=100;
    const reports=visibleClinicalReports(r,p);expect(reports.length).toBeGreaterThan(0);const o=ability(r,'full-review'),result=choose(r,o.id);
    expect(result.vitals.stamina).toBe(77);expect(result.nightMinutes).toBe(90);expect(result.talentMemory!.reviewedPatients).toContain(p.uid);expect(result.talentMemory!.fullReviewsUsed).toBe(1);
    for(const report of reports)expect(result.feedback!.text).toContain(report.full);
    expect(result.patients.find(q=>q.uid===p.uid)!.clinical!.minutes).toBe(p.clinical!.minutes+10);
    const resumed=act(result,{type:'continue'});expect(availableOptions(resumed).some(o=>o.talentAction==='full-review')).toBe(false);
  });
  it('T10 quotes this patient’s actual norm without advancing care or fabricating evidence',()=>{
    const r=fixture(['T10']),p=patient(r),o=ability(r,'norm-quote'),result=choose(r,o.id);
    expect(result.cursor).toBe(r.cursor);expect(result.patients.find(q=>q.uid===p.uid)!.clinical!.choices).toEqual(p.clinical!.choices);
    expect(result.talentMemory!.quotedPatients).toContain(p.uid);expect(result.feedback!.text.length).toBeGreaterThan(5);expect(result.hazards).toEqual(r.hazards);
  });
  it('T25 borrows 10000 once, preserving its private debt and one family relationship cost',()=>{
    const r=fixture(['T25']);r.queue=[{id:'family-edge',kind:'story',actor:'family',title:'家里来电',text:'家人接起电话。',scope:{kind:'personal',id:r.id},options:[{id:'family-close',label:'继续通话',ap:0,minutes:0,cost:0,result:'电话还没有挂断。',effects:{}}]}];
    const o=ability(r,'relative-loan'),result=choose(r,o.id);expect(result.cash).toBe(r.cash+10000);expect(result.privateDebt).toBe(r.privateDebt+10000);expect(result.income).toBe(r.income);expect(result.relations.family).toBe(Math.max(0,r.relations.family-1));
    expect(result.cursor).toBe(0);expect(act(result,{type:'choose',id:o.id})).toBe(result);expect(reload(result)).toEqual(result);
  });
  it('T25 halves the actual natural daily cash-pressure decay',()=>{
    const r=fixture(['T25']);r.authored!.pressure=20;r.authored!.ledger.pending=[];r.authored!.ledger.modifiers=[];r.queue=[];r.cursor=0;r.shiftPhase='日终';r.phase='feedback';r.feedback={title:'交班',text:'当班结束',changes:[],next:'check'};
    const result=act(r,{type:'continue'});expect(result.authored!.pressure).toBe(18.5);
  });
  it('T17 advertises the exact integer stamina cost that the night action actually charges',()=>{
    const r=fixture(['T17']);r.vitals.stamina=60;const c=r.queue[r.cursor];c.kind='night';c.shiftPhase='夜班';r.shiftPhase='夜班';r.nightMinutes=100;delete c.clinicalGraph;
    const o:Option={id:'night-effort-edge',label:'完成床旁处置',ap:0,cost:0,minutes:5,result:'床旁处置已完成。',effects:{stamina:-3},mechanics:{operation:'treatment',quality:'correct'}};c.options=[o];c.last=false;
    const operation=optionCosts(r,o,c).stamina,baseline=nightClinicalCharge(r,c,o),result=choose(r,o.id);
    expect(operation).toBe(2);expect(baseline.stamina).toBe(8);
    expect(r.vitals.stamina-result.vitals.stamina).toBe(operation+baseline.stamina);
    expect(nightClinicalCharge(result,c,o).stamina).toBe(0);
  });
  it('T27 reloads a dynamic pending ability, transfers only after acceptance and keeps all historical hazards',()=>{
    let r=fixture(['T27']);const p=patient(r);r.hazards.push({id:'previous-risk',choiceId:'past',choice:'既往遗漏',day:1,type:'R',weight:30,reason:'既往实际遗漏',norm:'规范',causal:true,scope:{kind:'patient',id:p.uid}});
    const o=ability(r,'transfer');for(let i=0;i<200;i++){const seed=`transfer-${i}`;if(die(seed,`check:${o.id}`)===20){r.seed=seed;break;}}
    const pending=act(r,{type:'choose',id:o.id});expect(pending.phase).toBe('roll');expect(pending.patients.find(q=>q.uid===p.uid)!.active).toBe(true);
    const result=act(reload(pending),{type:'ack-roll'}),after=result.patients.find(q=>q.uid===p.uid)!;
    expect(after.active).toBe(false);expect(after.inpatient).toBe(false);expect(result.hazards.find(h=>h.id==='previous-risk')).toEqual(r.hazards.find(h=>h.id==='previous-risk'));
    expect(result.facts[`local-care-transferred:${p.uid}`]).toBeDefined();expect(result.talentMemory!.transferredPatients).toContain(p.uid);
  });
  it('a refused T27 transfer leaves care active and retains the real time spent negotiating',()=>{
    const r=fixture(['T27']),p=patient(r),o=ability(r,'transfer');for(let i=0;i<200;i++){const seed=`transfer-refused-${i}`;if(die(seed,`check:${o.id}`)===1){r.seed=seed;break;}}
    const result=choose(r,o.id),after=result.patients.find(q=>q.uid===p.uid)!;expect(after.active).toBe(true);expect(result.talentMemory!.transferredPatients).not.toContain(p.uid);expect(result.facts[`local-care-transferred:${p.uid}`]).toBeUndefined();
    expect(after.clinical!.minutes).toBeGreaterThan(p.clinical!.minutes);expect(result.ap).toBeLessThan(r.ap);
  });
  it('T30 suppresses escalation by recording one scoped concealment, without erasing the injury',()=>{
    const r=fixture(['T30']),p=patient(r);p.damage=1;const o=ability(r,'conceal'),result=choose(r,o.id);
    expect(result.patients.find(q=>q.uid===p.uid)!.damage).toBe(1);expect(result.talentMemory!.concealedPatients[p.uid]).toBe(1);
    const concealment=result.hazards.filter(h=>h.reason.includes('报平安'));expect(concealment).toHaveLength(1);expect(concealment[0].scope).toEqual({kind:'patient',id:p.uid});expect(concealment[0].weight).toBe(15);
    expect(result.facts[`complaint-suppressed:${p.uid}`]).toBeDefined();expect(act(result,{type:'choose',id:o.id})).toBe(result);
  });
  it('T01 first contact spends SAN once across focus, refresh and actual selection',()=>{
    const r=fixture(['T01']),p=patient(r);for(let i=0;i<100;i++){const seed=`intuition-${i}`;if(random(seed,`intuition:${p.uid}`)<.2){r.seed=seed;break;}}
    const first=act(r,{type:'focus',id:currentCard(r)!.id});expect(first.vitals.san).toBe(75);expect(first.talentMemory!.intuitionReady).toContain(p.uid);
    const second=act(reload(first),{type:'focus',id:currentCard(first)!.id});expect(second.vitals.san).toBe(75);expect(second.talentMemory!.firstContacts.filter(x=>x===p.uid)).toHaveLength(1);
    const o=availableOptions(second).find(o=>o.clinicalChoice==='s1_history')!,pending=act(second,{type:'choose',id:o.id});
    expect(pending.talentMemory!.intuitionReady).toContain(p.uid);const result=act(reload(pending),{type:'ack-roll'});expect(result.vitals.san).toBe(75);expect(result.talentMemory!.intuitionReady).not.toContain(p.uid);
    expect(result.journal.filter(j=>j.title==='初次接触'&&j.scope.id===p.uid)).toHaveLength(1);
  });
});

function entityFixture(flag?:string):Run {
  const r=fixture([]),base=patient(r),entity=PATIENT_ENTITIES.find(e=>flag?e.flags.includes(flag):e.payment.includes('欠费'))!,preset=CASE_PRESETS.find(c=>compatibleEntities(c).some(e=>e.id===entity.id))!;
  base.entityId=entity.id;base.caseId=preset.id;base.name=entity.name;base.preset=instantiatePreset(preset,entity,base.uid);base.presetNode=base.preset.steps[0].id;delete base.clinical;
  const option:Option={id:'exam-edge',label:'完成必要影像检查',ap:1,minutes:10,cost:200,result:'检查完成。',effects:{flags:['edge-exam-complete']},mechanics:{operation:'exam',quality:'correct'}};
  r.queue=[{id:'entity-edge',kind:'clinical',last:false,shiftPhase:'查房',title:'床旁评估',text:'等待患者的决定。',scope:{kind:'patient',id:base.uid},patientId:base.uid,caseId:base.caseId,options:[option]}];return r;
}
describe('patient consent and departure engine boundaries',()=>{
  it('T12 full examination improves trust and temporarily lowers this patient’s complaint tendency',()=>{
    const r=entityFixture('自媒体');r.talents=['T12'];const p=patient(r),o=currentCard(r)!.options[0],before=patientProfile(r,p)!;o.cost=0;o.effects={stamina:-3};o.mechanics={operation:'full-exam',quality:'correct'};
    const result=choose(r,o.id),after=result.patients.find(q=>q.uid===p.uid)!;expect(after.patience).toBe(Math.min(100,p.patience+3));expect(patientProfile(result,after)!.complaintTendency).toBe(Math.max(0,before.complaintTendency-1));
  });
  it('does not execute or charge a refused exam before or after signing its refusal',()=>{
    const r=entityFixture(),p=patient(r),o=currentCard(r)!.options[0],gate=act(r,{type:'choose',id:o.id});
    expect(currentCard(gate)).toHaveProperty('patientGate');expect(gate.cash).toBe(r.cash);expect(gate.ap).toBe(r.ap);expect(gate.patients.find(q=>q.uid===p.uid)!.spent).toBe(p.spent);expect(gate.committed).not.toContain(o.id);
    const signed=availableOptions(gate).find(o=>o.id.endsWith(':signed'))!,result=choose(reload(gate),signed.id);
    expect(result.patients.find(q=>q.uid===p.uid)!.spent).toBe(p.spent);expect(result.cash).toBe(r.cash);expect(result.facts['edge-exam-complete']).toBeUndefined();expect(result.facts[patientRefusalFlag(p,o)]).toBeDefined();
    const resumed=act(result,{type:'continue'});expect(availableOptions(resumed).some(x=>x.id===o.id)).toBe(false);expect(resumed.patients.find(q=>q.uid===p.uid)!.active).toBe(true);
  });
  it('records departure after failed comfort as leaving, never as a successful transfer',()=>{
    const r=entityFixture('精神障碍史'),p=patient(r),o=currentCard(r)!.options[0];Object.assign(o,{id:'comfort-edge',cost:0,check:{skill:'comfort',dc:100,purpose:'说明安排',failure:{},failureText:'沟通没有完成。'},mechanics:{operation:'comfort',actor:'patient',quality:'neutral'}});
    for(let i=0;i<500;i++){const seed=`departure-${i}`;if(random(seed,`${p.uid}:left-after-comfort:${o.id}`)<.1&&die(seed,`check:${o.id}`)!==20){r.seed=seed;break;}}
    const result=choose(r,o.id),after=result.patients.find(q=>q.uid===p.uid)!;expect(after.active).toBe(false);
    expect(result.facts[`patient:${p.uid}:left-without-completing-care`]).toBeDefined();expect(result.facts[`local-care-ended:${p.uid}`]).toBeDefined();expect(result.facts[`local-care-transferred:${p.uid}`]).toBeUndefined();
    expect(result.talentMemory!.transferredPatients).not.toContain(p.uid);expect(result.queue.some(c=>c.title.includes('自行离院'))).toBe(true);
  });
});
