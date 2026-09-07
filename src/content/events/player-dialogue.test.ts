import {describe,it,expect} from 'vitest';
import {EVENT_DIALOGUE,eventOptionLabel} from './player-dialogue';
import {EVENT_BY_ID,eventToCard,eventWeight} from './catalog';
import type {EventBinding,EventContext} from './types';

describe('colloquial dialogue is presentation, not a rules rewrite',()=>{
 for(const id of Object.keys(EVENT_DIALOGUE))it(`${id}: retains choices, costs, checks and source`,()=>{
  const event=EVENT_BY_ID[id],snapshot=structuredClone(event);
  const binding:EventBinding={instanceId:`copy:${id}`,scope:event.scopeKind==='patient'?{kind:'patient',id:'copy-patient'}:event.scopeKind==='project'?{kind:'project',id:'copy-project'}:{kind:'personal',id:'copy-run'},
   ...(event.scopeKind==='patient'?{patientId:'copy-patient'}:{}),day:6,phase:'查房'};
  const context:EventContext={day:6,phase:'查房',facts:{},reputation:10};
  const weight=eventWeight(event,context),card=eventToCard(event,binding);
  expect(card.options).toHaveLength(id==='E-209'?2:event.options.length);
  card.options.forEach((o,index)=>{
   const original=event.options[index];
   expect(o.id).toBe(`${binding.instanceId}:${original.id}`);
   expect(o.label).toBe(EVENT_DIALOGUE[id].labels![index]);
   const {id:instanceId,label,effects,hint,...rest}=o;
   const {id:sourceId,label:sourceLabel,effects:sourceEffects,hint:sourceHint,...sourceRest}=original;
   expect(instanceId).toContain(sourceId);expect(label).not.toBe('');expect(sourceLabel).not.toBe('');
   expect(rest).toEqual(sourceRest);
   expect(hint??'').toBe(sourceHint??'');
   expect(effects).toEqual({...sourceEffects,flags:[...(sourceEffects.flags??[]),`event-seen:${id}`]});
  });
  expect(event).toEqual(snapshot);expect(eventWeight(event,context)).toBe(weight);
 });
 it('does not match another event or an unknown letter by accident',()=>{
  expect(eventOptionLabel('E-041','E-042-a','原选项')).toBe('原选项');
  expect(eventOptionLabel('E-041','E-041-f','原选项')).toBe('原选项');
 });
 it('keeps context-bound ICU charges authoritative',()=>{
  const event=EVENT_BY_ID['E-100'];
  const card=eventToCard(event,{instanceId:'fee',scope:{kind:'personal',id:'run'},day:6,phase:'结算'},
   {day:6,phase:'结算',facts:{'family-icu-daily-fee':2000}});
  expect(card.text).toContain('2,000');expect(card.options[0].label).toContain('2,000');
  expect(card.options[0].effects.cash).toBe(-2000);
 });
 it('never offers an ending condition as a packing choice',()=>{
  const event=EVENT_BY_ID['E-209'];
  const binding:EventBinding={instanceId:'packing',scope:{kind:'personal',id:'run'},day:14,phase:'结算'};
  for(const context of [undefined,{day:14,phase:'结算',facts:{'统方':true}}]as const){
   const card=eventToCard(event,binding,context);
   expect(card.options.map(o=>o.id)).toEqual(['packing:E-209-a','packing:E-209-b']);
  }
 });
 it('keeps source formulas out of event hints',()=>{
  for(const event of Object.values(EVENT_BY_ID))for(const option of event.options){
   expect(option.hint??'').not.toMatch(/引擎|按 01|§|已收总额/);
  }
 });
 it('reports whether the department actually pays the page charge',()=>{
  const event=EVENT_BY_ID['E-182'];
  const binding:EventBinding={instanceId:'page-fee',scope:{kind:'project',id:'paper'},day:8,phase:'结算'};
  const declined=eventToCard(event,binding,{day:8,phase:'结算',facts:{}}).options[2];
  const paid=eventToCard(event,binding,{day:8,phase:'结算',facts:{'药代-科室账':true}}).options[2];
  expect(declined.result).toContain('没报成');expect(paid.result).toContain('不用你个人付');
 });
});
