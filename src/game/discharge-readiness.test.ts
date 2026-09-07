import {it,expect}from 'vitest';
import {startRun,availableOptions,currentCard}from './engine';
import {createPatient,makeWardCard}from './cards';
import {dischargeReadiness}from './discharge-readiness';
import {getClinicalGraph,initialGraphState}from '../content/clinical';

// State-boundary regressions; these fixtures are not natural-route evidence.
it('does not turn an unfinished clinical workup into safe discharge through stability alone',()=>{
 const r=startRun('unfinished-discharge','程医生',[]),p=createPatient(r,'C010');
 p.stability=20;p.settled=true;p.clinical=initialGraphState(getClinicalGraph('C010')!,'workup');
 expect(dischargeReadiness(p).ready).toBe(false);
 const card=makeWardCard(r,p),choice=card.options.find(o=>o.id.endsWith(':discharge'))!;
 expect(choice.effects.plannedDischarge).toBeUndefined();expect(choice.effects.hazards?.[0].causal).toBe(true);
 expect(card.text).toContain('尚未完成');expect(card.text).not.toContain('已达到出院');
});
it('checks unresolved preset work and damage separately from recovery',()=>{
 const r=startRun('preset-discharge','程医生',[]),p=createPatient(r,'C010');p.settled=true;p.stability=2;
 p.presetNode='active-work';p.presetResolved=false;expect(dischargeReadiness(p).ready).toBe(false);
 p.presetResolved=true;p.damage=2;p.mitigated=1;expect(dischargeReadiness(p).ready).toBe(false);
 p.mitigated=2;expect(dischargeReadiness(p).ready).toBe(true);
 p.damage=3;p.mitigated=3;expect(dischargeReadiness(p).ready).toBe(false);
});
it('refreshes a morning discharge quote after an intervening clinical change',()=>{
 const r=startRun('live-discharge','程医生',[]),p=createPatient(r,'C010','readiness');r.patients.push(p);p.settled=true;p.stability=2;
 const card=makeWardCard(r,p);r.queue=[card];r.cursor=0;r.phase='play';r.shiftPhase='查房';
 expect(card.options.find(o=>o.id.endsWith(':discharge'))?.effects.plannedDischarge).toBe(true);
 p.clinical=initialGraphState(getClinicalGraph('C010')!,'new-workup');
 const live=availableOptions(r).find(o=>o.id.endsWith(':discharge'))!;
 expect(live.label).toContain('风险未排除');expect(live.effects.plannedDischarge).toBeUndefined();
 expect(currentCard(r).text).toContain('本次诊疗评估尚未完成');
 expect(card.options.find(o=>o.id.endsWith(':discharge'))?.effects.plannedDischarge).toBe(true);
});
