import { describe,expect,it } from 'vitest';
import { act,availableOptions,currentCard,startRun } from './engine';
import { restCard } from './cards';
import { hasPlannedNight,hasWorkedNight,isFullDayLeave,isLeaveHandoffCard } from './duty-state';
import { nextShiftForecast } from './schedule-preview';
import { decode,emptySave,encode } from './storage';
import type { Run,Card } from './types';

function requestThirdDayLeave() {
  let r=startRun('leave-audit','程医生',[]);
  r.day=2;r.queue=[restCard(2)];r.cursor=0;r.phase='play';r.shiftPhase='日终';
  r.cash=10000;r.debt=1000;r.depression=10;
  r=act(r,{type:'choose',id:availableOptions(r).find(o=>o.talentAction==='day-off')!.id});
  expect(r.skipNextDay).toBe(true);
  r.phase='feedback';r.feedback={title:'次日',text:'交接已完成',next:'day',changes:[]};
  return act(r,{type:'continue'});
}
function resolveToDayRoll(input:Run) {
  let r=input;
  for(let n=0;n<80;n++) {
    if(r.phase==='roll'&&r.roll?.kind==='day')return r;
    if(r.phase==='play') {
      const o=availableOptions(r).filter(o=>!o.talentAction).sort((a,b)=>a.ap-b.ap||a.cost-b.cost)[0];
      expect(o,`${r.phase} ${currentCard(r)?.title}`).toBeDefined();r=act(r,{type:'choose',id:o.id});
    } else if(r.phase==='roll')r=act(r,{type:'ack-roll'});
    else if(r.phase==='feedback')r=act(r,{type:'continue'});
    else throw new Error(`Unexpected ${r.phase}`);
  }
  throw new Error('Leave did not reach its day-end roll');
}
describe('approved full leave and actual night attendance',()=>{
  it.each(['E-041','E-048','E-161','E-162','E-164','E-165','E-168','E-171','E-172','E-174','E-176'])('old %s routine-work pending die can only acknowledge handoff, preserving prior effects',source=>{
    let r=startRun('leave-source-pending','程医生',[]);
    r.queue=[{id:'old-work',kind:'story',title:'原定科室工作',text:'尚未执行的工作。',scope:{kind:'personal',id:r.id},options:[{id:'old-work:do',label:'执行原定工作',ap:2,minutes:20,cost:100,result:'已执行。',effects:{cash:-100,flags:['new-work-executed']},check:{skill:'record',dc:12,failure:{},failureText:'未完成。'}}]}];
    r.cursor=0;r.phase='play';r.shiftPhase='查房';r.ap=0;
    r=act(r,{type:'choose',id:'old-work:do'});expect(r.phase).toBe('roll');
    Object.assign(r.queue[0],{authoredEventId:source});r.facts['leave:1']={day:1,source:'approved',sequence:0};
    r.facts['previous-work']={day:1,source:'already-paid',sequence:0};const before=structuredClone(r);
    const result=act(r,{type:'ack-roll'});
    expect(result.cash).toBe(before.cash);expect(result.vitals).toEqual(before.vitals);expect(result.ap).toBe(before.ap);expect(result.roll).toEqual(before.roll);
    expect(result.facts).toEqual(before.facts);expect(result.committed).toContain('old-work:leave-handoff');expect(result.committed).not.toContain('old-work:do');
    expect(act(result,{type:'ack-roll'})).toBe(result);
  });
  it('D2 leave request produces D3 no routine duty, still settles living and debt, and D4 has no fictional night penalty',()=>{
    const r=requestThirdDayLeave();
    expect(r.day).toBe(3);expect(isFullDayLeave(r)).toBe(true);expect(r.ap).toBe(0);
    expect(r.nightBudget).toBe(0);expect(r.nightMinutes).toBe(0);
    expect(hasPlannedNight(r)).toBe(false);expect(hasWorkedNight(r)).toBe(false);
    expect(r.queue.some(c=>isLeaveHandoffCard(r,c))).toBe(false);
    const settled=resolveToDayRoll(r);
    expect(settled.overtime).toBe(0);expect(hasWorkedNight(settled)).toBe(false);
    expect(settled.interest).toBe(30);expect(settled.debt).toBe(1030);
    expect(settled.cash).toBeLessThanOrEqual(r.cash-40);
    expect(nextShiftForecast(settled,0,false)).toMatchObject({day:4,afterNight:false,ap:10,stamina:100});
    // Select the successful day-end branch to isolate the next-shift contract.
    settled.roll={...settled.roll!,face:20,success:true,critical:'success'};
    const accepted=act(settled,{type:'ack-roll'}),next=act(accepted,{type:'continue'});
    expect(next.day).toBe(4);expect(next.ap).toBe(10);expect(next.vitals.stamina).toBe(100);
  });
  it('predictions include planned duty but actual settlement does not infer it from a calendar',()=>{
    const r=startRun('night-planned','程医生',[]);r.day=3;r.shiftPhase='查房';r.nightBudget=240;
    expect(nextShiftForecast(r).afterNight).toBe(true);expect(nextShiftForecast(r,0,false).afterNight).toBe(false);
    r.facts['night-duty-started:3']={day:3,source:'shift:3:夜班',sequence:0};
    expect(hasWorkedNight(r)).toBe(true);expect(nextShiftForecast(r,0,false).ap).toBe(8);
    r.facts['leave:3']={day:3,source:'later-leave',sequence:0};
    expect(hasWorkedNight(r)).toBe(true); // real attendance is never erased
  });
  it('old unperformed routine-work dice remain readable and close once without executing the original work',()=>{
    let r=startRun('leave-old-pending','程医生',[]);
    const card:Card={id:'old-rounds',kind:'ward',title:'原定查房',text:'当场翻病历。',scope:{kind:'personal',id:r.id},options:[{id:'old-rounds:read',label:'当场翻病历',ap:1,minutes:12,cost:90,effects:{stamina:-3,cash:-50},result:'已经翻完病历。',check:{skill:'observe',dc:12,failure:{},failureText:'没有找到。'}}]};
    r.queue=[card];r.cursor=0;r.phase='play';r.shiftPhase='查房';r.ap=0;
    r=act(r,{type:'choose',id:card.options[0].id});expect(r.phase).toBe('roll');
    r.facts['leave:1']={day:1,source:'approved',sequence:0};
    const restored=decode(encode({...emptySave(),run:r}))?.run;expect(restored).toBeDefined();
    const before=structuredClone(restored!);r=act(restored!,{type:'ack-roll'});
    expect(r.roll).toEqual(before.roll);expect(r.cash).toBe(before.cash);expect(r.vitals).toEqual(before.vitals);expect(r.ap).toBe(before.ap);expect(r.overtime).toBe(before.overtime);
    expect(r.committed).toContain('old-rounds:leave-handoff');expect(r.committed).not.toContain('old-rounds:read');
    expect(r.journal.at(-1)?.result).toContain('没有执行原选项');expect(r.queue).toEqual(before.queue);
    expect(decode(encode({...emptySave(),run:r}))?.run).toBeDefined();expect(act(r,{type:'ack-roll'})).toBe(r);
  });
  it('night-timed private obligations on leave retain their original AP and cash costs, without counting as night duty',()=>{
    let r=requestThirdDayLeave();
    r.queue=[{id:'private-due',kind:'night',shiftPhase:'夜班',scope:{kind:'personal',id:r.id},title:'已有借款到期',text:'本人处理借款。',options:[{id:'private-due:pay',label:'处理已有借款',ap:1,minutes:12,cost:0,effects:{cash:-100},result:'已付款。'}]}];r.cursor=0;r.shiftPhase='夜班';
    const cash=r.cash;r=act(r,{type:'choose',id:'private-due:pay'});
    expect(r.cash).toBe(cash-100);expect(r.overtime).toBe(1);expect(hasWorkedNight(r)).toBe(false);expect(r.nightMinutes).toBe(0);
  });
});
