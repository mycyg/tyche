import {it,expect}from 'vitest';
import {startRun,act,availableOptions}from './engine';
import {previewCheckSources,previewCheckModifier,skillModifierSources,skillModifier,checkDifficultySources,checkDifficulty,sumCheckTerms}from './costs';
import {encode,decode,emptySave}from './storage';
import type {Card}from './types';

function fixture(){
 const r=startRun('check-breakdown-boundary','程医生',[]);r.ap=0;r.vitals.stamina=31;r.phase='play';r.shiftPhase='交班';r.metaRerolls=1;
 const card:Card={id:'breakdown-test',kind:'story',shiftPhase:'交班',title:'本次说明',text:'核对已有资料。',scope:{kind:'personal',id:r.id},options:[{id:'breakdown-test:review',label:'核对并说明',ap:1,minutes:10,cost:0,effects:{},result:'材料已核对。',check:{skill:'record',dc:12,purpose:'说明已有记录',failure:{},failureText:'部分记录仍未核清。'}}]};
 r.queue=[card];r.cursor=0;return{r,card};
}
it('all displayed modifier terms add up, including an AP overdraw across the fatigue threshold',()=>{
 const {r,card}=fixture(),o=availableOptions(r)[0],before=structuredClone(r),terms=previewCheckSources(r,o,card);
 expect(terms.find(t=>t.id==='fatigue')?.value).toBe(-2);expect(terms.find(t=>t.id==='overtime')?.value).toBe(-1);
 expect(sumCheckTerms(terms)).toBe(previewCheckModifier(r,o,card));expect(r).toEqual(before);
 for(const skill of ['clinical','observe','record','persuade','comfort','endure']as const)expect(sumCheckTerms(skillModifierSources(r,skill))).toBe(skillModifier(r,skill));
 expect(sumCheckTerms(checkDifficultySources(r,o,card))).toBe(checkDifficulty(r,o,card));
});
it('the shown die stores the quoted explanation; reloading and rerolling retain it',()=>{
 const {r,card}=fixture(),o=availableOptions(r)[0],terms=previewCheckSources(r,o,card),difficulty=checkDifficultySources(r,o,card);
 const rolling=act(r,{type:'choose',id:o.id});expect(rolling.phase).toBe('roll');expect(rolling.roll?.modifierSources).toEqual(terms);expect(rolling.roll?.difficultySources).toEqual(difficulty);
 const loaded=decode(encode({...emptySave(),run:rolling})).run!;expect(loaded).toBeDefined();expect(loaded.roll).toEqual(rolling.roll);
 const rerolled=act(loaded,{type:'reroll'});expect(rerolled.pendingCheck?.rerolls).toBe(1);expect(rerolled.roll?.modifierSources).toEqual(terms);expect(rerolled.roll?.difficultySources).toEqual(difficulty);
 expect(rerolled.roll?.modifier).toBe(rolling.roll?.modifier);expect(rerolled.roll?.dc).toBe(rolling.roll?.dc);
});
