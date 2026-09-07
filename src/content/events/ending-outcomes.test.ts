import {describe,expect,it}from 'vitest';
import {act,startRun}from '../../game/engine';
import {decode,encode,emptySave,storageRunIssues}from '../../game/storage';
import {afterAuthoredChoice}from '../../game/director';
import {EVENT_BY_ID,eventToCard,authoredChoiceEffects}from './catalog';
import {endingEligibility,documentedRouteClosures}from './ending-adapter';
import type {Run}from '../../game/types';

/** Isolated engine fixtures, not full-campaign reachability evidence. Dice are
 * still produced by the engine; no roll result or outcome is overwritten. */
function decide(eventId:string,letter:string,success=true,prepare?:(r:Run)=>void):Run{
  for(let seed=0;seed<80;seed++){
    let r=startRun(`outcome:${eventId}:${letter}:${seed}`,'程医生',[]);
    r.day=6;r.shiftPhase='查房';r.phase='play';r.reputation=19;
    prepare?.(r);
    const p=r.patients.find(p=>p.inpatient)!;
    const card=eventToCard(EVENT_BY_ID[eventId],{instanceId:`${r.id}:${eventId}`,scope:{kind:'patient',id:p.uid},patientId:p.uid,bed:p.bed,day:r.day,phase:'查房'});
    r.authored!.published[card.id]=card;r.queue=[card,{id:'after-event',kind:'rest',scope:{kind:'personal',id:r.id},title:'交班本',text:'还有病程要写。',options:[{id:'after-event:read',label:'看交班本',ap:0,minutes:0,cost:0,result:'交班本在桌上。',effects:{}}]}];r.cursor=0;
    const option=card.options.find(o=>o.id.endsWith(`${eventId}-${letter}`))!;
    r=act(r,{type:'choose',id:option.id});
    if(r.phase==='roll')r=act(r,{type:'ack-roll'});
    const outcome=r.authored!.ledger.outcomes?.at(-1);
    if(outcome?.eventId===eventId&&outcome.success===success)return r;
  }
  throw new Error(`No engine-produced ${success?'success':'failure'} for ${eventId}-${letter}`);
}
const restored=(r:Run)=>{
  expect(storageRunIssues(r)).toEqual([]);
  const saved=decode(encode({...emptySave(),run:r})).run;
  expect(saved).toBeDefined();return saved!;
};
const questioned=(r:Run)=>documentedRouteClosures(r).find(c=>c.id==='2.5')!;

describe('endings follow actual event outcomes',()=>{
  it('counts the paid wedding gift as support, including the standalone saved receipt',()=>{
    const paid=decide('E-106','c',true,r=>{r.cash=5000;});
    expect(paid.cash).toBe(3000);
    expect(paid.authored!.ledger.facts.some(f=>f.id==='wedding-gift-paid')).toBe(true);
    const absent=(r:Run)=>{
      r.facts['wedding-planned']={day:1,source:'family',sequence:0};
      r.facts['wedding-absent']={day:6,source:'family',sequence:1};r.relations.family=0;
      return r;
    };
    expect(endingEligibility(absent(restored(paid)),'X27').eligible).toBe(false);
    const legacy=absent(startRun('wedding-gift-receipt','程医生',[]));
    expect(endingEligibility(legacy,'X27').eligible).toBe(true);
    legacy.facts['wedding-gift-paid']={day:3,source:'E-106-c',sequence:2};
    expect(endingEligibility(legacy,'X27').eligible).toBe(false);
    expect(endingEligibility(restored(legacy),'X27').eligible).toBe(false);
  });
  it('records E198 upload in the failed increment, total, and persistent ledger only',()=>{
    const option=EVENT_BY_ID['E-198'].options[0];
    expect(option.check!.failure.flags).toContain('视频上网');
    expect(authoredChoiceEffects(option,false).flags).toContain('视频上网');
    expect(authoredChoiceEffects(option,true).flags).not.toContain('视频上网');
    const r=decide('E-198','a',false);
    expect(r.authored!.ledger.facts.some(f=>f.id==='视频上网')).toBe(true);
    expect(endingEligibility(restored(r),'X19').eligible).toBe(true);
  });
  for(const [letter,success,published]of [['a',true,false],['a',false,true],['b',true,false],['b',false,false],['c',true,true]]as const){
    it(`E198-${letter} ${success?'success':'failure'} does not confuse filming, retention and upload`,()=>{
      const r=decide('E-198',letter,success);
      expect(r.authored!.seen['E-198']).toBe(r.day);
      expect(endingEligibility(r,'X19').eligible).toBe(published);
      expect(endingEligibility(restored(r),'X19').eligible).toBe(published);
      r.reputation=20;expect(endingEligibility(r,'X19').eligible).toBe(false);
    });
  }
  it('recovers the old failed upload from its recorded outcome, without inventing it for a seen event',()=>{
    const r=decide('E-198','a',false);
    delete r.authored!.activeFacts['视频上网'];delete r.facts['视频上网'];
    r.authored!.ledger.facts=r.authored!.ledger.facts.filter(f=>f.id!=='视频上网');
    expect(endingEligibility(restored(r),'X19').eligible).toBe(true);
    const seen=startRun('seen-is-not-upload','程医生',[]);seen.reputation=10;
    seen.authored!.seen['E-198']=1;seen.facts['collapse-filmed']={day:1,source:'old-recording-alias',sequence:0};
    expect(endingEligibility(seen,'X19').eligible).toBe(false);
  });
  it('reads the real patient-scoped E202 discovery, and not an orphan patient prefix',()=>{
    const r=startRun('scoped-san-discovery','程医生',[]),p=r.patients[0];
    r.authored!.activeFacts['clinical:missing-person:san-wrong-record-discovered']={day:1,source:'quality-review'};
    expect(endingEligibility(r,'X23').eligible).toBe(false);
    const card=eventToCard(EVENT_BY_ID['E-202'],{instanceId:'quality-discovery',scope:{kind:'patient',id:p.uid},patientId:p.uid,bed:p.bed,day:1,phase:'查房'});
    const next={...r,...afterAuthoredChoice(r,card,card.options[0],true).patch};
    expect(next.committed.some(id=>id.includes('E-202'))).toBe(false);
    expect(next.authored!.activeFacts[`clinical:${p.uid}:san-wrong-record-discovered`]).toBeDefined();
    expect(endingEligibility(next,'X23').eligible).toBe(true);
    const isolated=structuredClone(next);delete isolated.authored!.activeFacts[`clinical:${p.uid}:san-wrong-record-discovered`];
    expect(endingEligibility(isolated,'X23').eligible).toBe(false);
  });
  for(const [letter,success,status,word]of [['a',true,'pending','申请'],['b',true,'resolved','删了帖子'],['b',false,'escalated','投诉'],['c',true,'escalated','帖子还在']]as const){
    it(`E028-${letter} ${success?'success':'failure'} keeps the closure and text on the same outcome`,()=>{
      const r=decide('E-028',letter,success),closure=questioned(r);
      expect(closure.status).toBe(status);expect(closure.text).toContain(word);
      expect(questioned(restored(r))).toEqual(closure);
    });
  }
  for(const [letter,success,status,word]of [['a',true,'resolved','已经结案'],['a',false,'escalated','没有结案'],['b',true,'pending','还没收到'],['c',true,'pending','尚未通知']]as const){
    it(`E029-${letter} ${success?'success':'failure'} does not mistake requested help or a refund for case closure`,()=>{
      const r=decide('E-029',letter,success),closure=questioned(r);
      expect(closure.status).toBe(status);expect(closure.text).toContain(word);
      expect(questioned(restored(r))).toEqual(closure);
    });
  }
  it('lets the actual E029 closing reply supersede an earlier complaint without clearing its history',()=>{
    const earlier=decide('E-028','b',false),r=decide('E-029','a',true);
    r.authored!.ledger.outcomes!.unshift(...earlier.authored!.ledger.outcomes!);
    r.authored!.seen['E-028']=5;r.authored!.activeFacts['质疑-3投诉']={day:5,source:'previous-complaint'};
    expect(questioned(r).status).toBe('resolved');expect(questioned(r).text).toContain('已经结案');
    expect(r.authored!.activeFacts['质疑-3投诉']).toBeDefined();
  });
  it('does not call an E027 explanation unresolved after the actual successful conversation',()=>{
    const r=decide('E-027','a',true);
    expect(questioned(r).status).toBe('resolved');expect(questioned(r).text).toContain('没再追问');
  });
});
