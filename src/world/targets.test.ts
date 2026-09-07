import {describe,it,expect} from 'vitest';
import {worldTargets} from './WorldStage';
import {startRun} from '../game/engine';
describe('world event routing',()=>{
 it('routes a director-only patient to a real staffed interaction instead of dereferencing an absent bed',()=>{
  const r=startRun('event-patient-route','医生',[]);r.phase='play';r.cursor=0;delete r.shiftPhase;
  r.queue=[{id:'event-only',kind:'story',patientId:'event-patient',title:'来院核查',text:'护理站来电。',scope:{kind:'patient',id:'event-patient'},options:[{id:'talk',label:'核查',ap:0,minutes:0,cost:0,effects:{},result:'已核查。'}]}];
  expect(()=>worldTargets(r)).not.toThrow();expect(worldTargets(r).find(t=>t.id==='nurse')?.cards?.map(c=>c.id)).toContain('event-only');
 });
 it.each(['father','mother'])('%s is reached via the existing corridor phone, not a standing character',actor=>{
  const r=startRun('phone-route','程医生',[]);r.phase='play';r.cursor=0;r.queue=[{id:'family-call',kind:'story',actor,title:'来电',text:'电话响了。',scope:{kind:'personal',id:r.id},options:[{id:'answer-call',label:'接电话',ap:0,minutes:0,cost:0,effects:{},result:'电话接通。'}]}];
  delete r.shiftPhase;const targets=worldTargets(r),phone=targets.find(t=>t.id==='phone')!;expect(phone.cards?.map(c=>c.id)).toContain('family-call');expect(targets.filter(t=>t.id===actor)).toHaveLength(0);expect(phone).toMatchObject({x:54,y:270});
 });
 it('names the rest encounter as the end of day rather than shift handover',()=>{
  const r=startRun('rest-route','程医生',[]);r.phase='play';r.cursor=0;r.queue=[{id:'rest-card',kind:'rest',title:'日终',text:'当日工作结束。',scope:{kind:'personal',id:r.id},options:[{id:'rest-choice',label:'休息',ap:0,minutes:0,cost:0,effects:{},result:'收好病历。'}]}];
  delete r.shiftPhase;expect(worldTargets(r).find(t=>t.id==='day-end')?.label).toBe('日终 · 休息与结算');
 });
});
