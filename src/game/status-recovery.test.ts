import {describe,it,expect}from 'vitest';
import {act,startRun}from './engine';
import {decode,emptySave,encode}from './storage';
describe('status recovery is visible and follows the actual recovery rules',()=>{
 it('records a debt-free bill-day recovery once at the next morning',()=>{
  let r=startRun('debt-free-recovery','程医生',[]);r.debuffs=['B17'];r.debt=0;
  r.phase='feedback';r.feedback={title:'交班完成',text:'休息。',changes:[],next:'day'};
  r=act(r,{type:'continue'});
  expect(r.day).toBe(2);expect(r.debuffs).not.toContain('B17');
  const notices=r.journal.filter(e=>e.id.startsWith('status-recovery:'));
  expect(notices).toHaveLength(1);expect(notices[0].result).toContain('信用债已清零');
  const restored=decode(encode({...emptySave(),run:r})).run!;
  expect(restored.journal.filter(e=>e.id.startsWith('status-recovery:'))).toEqual(notices);
 });
 it('does not claim recovery while credit debt remains',()=>{
  let r=startRun('debt-still-due','程医生',[]);r.debuffs=['B17'];r.debt=2000;
  r.phase='feedback';r.feedback={title:'交班完成',text:'休息。',changes:[],next:'day'};
  r=act(r,{type:'continue'});
  expect(r.debuffs).toContain('B17');expect(r.journal.filter(e=>e.id.startsWith('status-recovery:'))).toHaveLength(0);
 });
 it('does not invent a cured condition on a natural twenty when none is held',()=>{
  let r=startRun('critical-no-recovery','程医生',[]);r.phase='roll';r.debuffs=[];
  r.roll={id:'day:1',kind:'day',face:20,modifier:0,dc:9,success:true,critical:'success',label:'日终'};
  r=act(r,{type:'ack-roll'});
  expect(r.feedback!.text).toContain('当前没有可解除的持续状态');
  expect(r.feedback!.text).not.toContain('一个可恢复的不适消退');
  expect(r.journal.filter(e=>e.id.startsWith('status-recovery:'))).toHaveLength(0);
 });
});
