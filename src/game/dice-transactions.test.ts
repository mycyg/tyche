import {describe,expect,it} from 'vitest';
import {act,availableOptions,startRun} from './engine';
import {checkDifficulty,previewCheckModifier} from './costs';
import {die} from './random';
import {decode,emptySave,encode} from './storage';
import type {Option,Run} from './types';

function fixture(face:number,threshold=8):Run {
  const r=startRun('probability','程医生',['T22','T04','T15']);
  const option:Option={id:'chance-edge',label:'等候消息',ap:1,minutes:2,cost:0,effects:{cash:-10},result:'事情办成了。',chanceCheck:{successAtLeast:threshold},check:{skill:'observe',dc:99,failure:{cash:0},failureText:'事情没有办成。'}};
  r.queue=[{id:'chance-scene',kind:'story',title:'一条消息',text:'等候回复。',scope:{kind:'personal',id:'self'},options:[option]}];
  r.cursor=0;r.phase='play';r.difficulty='attending';r.skills.observe=99;
  for(let i=0;i<1000;i++){const seed=`natural-face-${i}`;if(die(seed,`check:${option.id}`)===face){r.seed=seed;break;}}
  return r;
}
describe('probability dice and bookkeeping guarantees',()=>{
  it.each([1,2,8,20])('natural face %i ignores skills, difficulty and critical-face talents',face=>{
    const r=fixture(face),o=availableOptions(r)[0],pending=act(r,{type:'choose',id:o.id});
    expect(previewCheckModifier(r,o,r.queue[0])).toBe(0);expect(checkDifficulty(r,o,r.queue[0])).toBe(8);
    expect(pending.roll).toMatchObject({face,modifier:0,dc:8,chance:true,critical:null,success:face>=8});
    expect(pending.roll?.second).toBeUndefined();expect(pending.cash).toBe(r.cash);expect(pending.ap).toBe(r.ap);
    expect(act(pending,{type:'reroll'})).toBe(pending);
    const loaded=decode(encode({...emptySave(),run:pending})).run!;
    const result=act(loaded,{type:'ack-roll'});
    expect(result.ap).toBe(r.ap-1);expect(result.cash).toBe(r.cash-10);expect(result.vitals.emotion).toBe(r.vitals.emotion);
    expect(result.committed.filter(id=>id===o.id)).toHaveLength(1);expect(act(result,{type:'ack-roll'})).toBe(result);
  });
  it('natural 2 passes a probability threshold of 2 even with 再来一次',()=>{
    const r=fixture(2,2);expect(act(r,{type:'choose',id:'chance-edge'}).roll?.success).toBe(true);
  });
  it('签字栏 guarantees document checking but cannot make a patient agree',()=>{
    const r=fixture(1);r.talents=['T07'];
    const o=r.queue[0].options[0];delete o.chanceCheck;o.mechanics={operation:'consent',checkOperation:'record'};o.check!.skill='record';
    expect(availableOptions(r)[0].check).toBeUndefined();
    const success=act(r,{type:'choose',id:o.id});expect(success.phase).toBe('feedback');expect(success.ap).toBe(r.ap-1);
    o.check!.skill='comfort';o.mechanics.checkOperation='comfort';
    expect(availableOptions(r)[0].check?.skill).toBe('comfort');
    expect(act(r,{type:'choose',id:o.id}).roll?.success).toBe(false);
  });
});
