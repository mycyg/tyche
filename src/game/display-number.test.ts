import {describe,expect,it}from 'vitest';
import {displayNumber}from './display-number';
import {act,startRun}from './engine';
import {makeWardCard}from './cards';

describe('resource number presentation',()=>{
 it('keeps meaningful fractions and removes arithmetic noise',()=>{
  expect(displayNumber(0.8500000000000014)).toBe('0.85');
  expect(displayNumber(-0.8500000000000014)).toBe('-0.85');
  expect(displayNumber(50.849999999999994)).toBe('50.85');
  expect(displayNumber(13)).toBe('13');
  expect(displayNumber(-0)).toBe('0');
 });
 it('formats the actual recording-insensitive talent reward without rounding stored reputation',()=>{
  let r=startRun('display-number','程医生',['T13']);
  const patient=r.patients.find(p=>p.stability>=2)!;
  const card=makeWardCard(r,patient);r.queue=[card];r.cursor=0;
  const prior=r.reputation;
  r=act(r,{type:'choose',id:card.options.find(o=>o.effects.plannedDischarge)!.id});
  expect(r.reputation-prior).toBeCloseTo(.85);
  expect(r.feedback?.changes).toContain('声望 +0.85');
  expect(r.feedback?.changes.join(' ')).not.toContain('00000000000');
  expect(r.reputation).toBe(prior+.85);
 });
});
