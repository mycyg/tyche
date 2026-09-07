import {describe,it,expect}from 'vitest';
import {startRun}from '../../game/engine';
import {buildAuthoredEvents,afterAuthoredChoice}from '../../game/director';
import {eventToCard,EVENT_BY_ID}from './catalog';
import {eventFactNotes}from './fact-records';
import {documentedEnding}from './ending-adapter';
describe('visible historical records',()=>{
 it('keeps the ECG and actual family disclosure in ending annexes, not invented later care',()=>{
  let r=startRun('paper-record','程医生',['T06','T11','T16']);r.authored=buildAuthoredEvents(r,'交班').patch.authored;
  const card=eventToCard(EVENT_BY_ID['E-212'],{scope:{kind:'personal',id:r.id},day:13,phase:'结算',instanceId:'report'});
  r={...r,...afterAuthoredChoice(r,card,card.options[2],true).patch};r.authored!.activeFacts['纸带']={day:5,source:'E-199-b'};
  const notes=eventFactNotes(r);expect(notes.some(s=>s.includes('纸带'))).toBe(true);expect(notes.some(s=>s.includes('家里'))).toBe(true);expect(notes.some(s=>s.includes('完成就诊'))).toBe(false);
  r.day=15;r.authored!.endNotes=['寄来的回信还没有回复。','寄来的回信还没有回复。'];const ending=documentedEnding(r,'X33');
  expect(ending.annexes.filter(s=>s==='寄来的回信还没有回复。')).toHaveLength(1);expect(ending.annexes).toEqual(expect.arrayContaining(notes));
 });
});
