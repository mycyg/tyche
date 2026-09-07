import {describe,expect,it} from 'vitest';
import {choiceResourceCopy,visibleChoiceEffects,TERM_GUIDE} from './copy';
import {act,startRun} from '../game/engine';
import type {Card,Option} from '../game/types';
import {createPatient}from '../game/cards';
import {RULES}from '../game/rules';

function fixture(talents:string[]=[],night=false){
 const r=startRun('resource-copy','程医生',talents);
 const o:Option={id:'resource-choice',label:'核对材料',ap:1,minutes:10,cost:0,effects:{stamina:-3,san:-4,emotion:-2},result:'材料已经核对。',mechanics:{operation:'other',quality:'neutral'}};
 const card:Card={id:'resource-card',kind:night?'night':'story',title:'核对材料',text:'材料放在桌上。',scope:{kind:'personal',id:r.id},options:[o],last:false};
 r.queue=[card];r.cursor=0;r.phase='play';r.ap=10;r.nightMinutes=100;r.vitals={stamina:80,san:80,emotion:80};delete r.roll;delete r.feedback;delete r.pendingCheck;
 return {r,o,card};
}
const text=(f:ReturnType<typeof fixture>)=>choiceResourceCopy(f.r,f.o,f.card).map(row=>row.text).join('\n');
describe('visible immediate choice costs',()=>{
 it('shows actual action stamina, SAN and emotion beside each option',()=>{
  const f=fixture(),before=structuredClone(f.r);expect(text(f)).toContain('操作体力 −3 点');expect(text(f)).toContain('精神 −4 点');expect(text(f)).toContain('情绪 −2 点');
  const after=act(f.r,{type:'choose',id:f.o.id});expect(after.vitals).toEqual({stamina:77,san:76,emotion:78});expect(f.r).toEqual(before);
 });
 it('matches the rounded T17 night stamina charge rather than printing the unadjusted effect',()=>{
  const f=fixture(['T17'],true);expect(text(f)).toContain('操作体力 −2 点');const after=act(f.r,{type:'choose',id:f.o.id});expect(after.vitals.stamina).toBe(78);
 });
 it('lists overtime costs on the option itself, separately from action stamina',()=>{
  const f=fixture();f.r.ap=0;f.o.ap=2;expect(text(f)).toContain('透支 2 点行动：另扣体力 10 点');expect(text(f)).toContain('上限各减 2 点');const after=act(f.r,{type:'choose',id:f.o.id});expect(after.vitals.stamina).toBe(67);
 });
 it('does not charge AP overtime in the night and shows recurring night overrun costs',()=>{
  const f=fixture([],true);f.r.ap=0;f.r.nightMinutes=5;expect(text(f)).not.toContain('透支');expect(text(f)).toContain('本次夜班超时：另扣体力 5 点、精神 3 点');const after=act(f.r,{type:'choose',id:f.o.id});expect(after.vitals.stamina).toBe(72);expect(after.vitals.san).toBe(73);
  f.r.nightMinutes=-5;expect(text(f)).toContain('本次夜班超时');
 });
 it('shows the first-night-contact SAN cost once, without reading a future random result',()=>{
  const f=fixture([],true),p=createPatient(f.r,'C015','night0');f.r.patients.push(p);
  f.card.patientId=p.uid;f.card.scope={kind:'patient',id:p.uid};f.r.debuffs=['B06'];
  const charge=`接诊这起急诊：另扣体力 ${RULES.nightIncident.stamina} 点、精神 ${RULES.nightIncident.san+RULES.nightIncident.hallucinationSan} 点（本起仅一次）`;
  expect(text(f)).toContain(charge);
  const after=act(f.r,{type:'choose',id:f.o.id});
  expect(after.vitals.san).toBe(f.r.vitals.san-4-RULES.nightIncident.san-RULES.nightIncident.hallucinationSan);
  f.r.facts[`night-started:${p.uid}`]={day:1,source:'previous',sequence:1};expect(text(f)).not.toContain('接诊这起急诊');
 });
 it('distinguishes success and failure resources and keeps hidden hazards out of player copy',()=>{
  const f=fixture();f.o.check={skill:'record',dc:12,failure:{stamina:-1,emotion:-5},failureText:'暂未通过审核。'};f.o.effects.hazards=[{type:'R',weight:50,reason:'隐藏病因',norm:'隐藏结局解法',causal:true}];
  expect(text(f)).toContain('通过后：操作体力 −3 点');expect(text(f)).toContain('未通过：操作体力 −1 点');expect(text(f)).toContain('未通过：情绪 −5 点');expect(text(f)).not.toMatch(/隐藏|50|解法/);
 });
 it('shows immediate negative caps, relationships and debt with units',()=>{
  const f=fixture();f.o.effects={caps:{san:-5},relations:{chief:-1},privateDebt:10000};expect(text(f)).toContain('精神上限 −5 点');expect(text(f)).toContain('主任关系 −1 点');expect(text(f)).toContain('私人借款 +¥10,000');
 });
 it('uses the same event reward reduction for displayed income and balances',()=>{
  const f=fixture(['T16']);Object.assign(f.card,{authoredEventId:'E-001'});expect(visibleChoiceEffects(f.r,{income:100,cash:200},f.card)).toMatchObject({income:50,cash:100});
 });
 it('explains income separately from patient bills and personal balance',()=>{
  const guide=TERM_GUIDE.find(row=>row.term==='收入 / 余额')!.meaning;expect(guide).toContain('先偿还信用债');expect(guide).toContain('患者诊疗费不计入医生收入');
 });
});
