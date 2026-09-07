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

// ---------------------------------------------------------------------------
// END-01..END-40 (contract 结局与暗黑链实施合同 §2, §3.5, §5)
// ---------------------------------------------------------------------------
import {readFileSync}from 'node:fs';
import {vi}from 'vitest';
import {newMeta,reward,DEATH_ENDING_XP,currentCard,availableOptions}from '../../game/engine';
import {documentedEnding,tribunalEnding,earlyEnding,selectMainEnding,MAIN_ENDINGS,ATTACHMENT_POOL,assessEnding,type EndingRun,type EndingOptions,type DocumentedEnding}from './ending-adapter';
import {STORY_ENDING_IDS}from '../story/endings';
import {DEATH_ENDING_IDS,POSTHUMOUS_REMOVED_ATTACHMENTS,POSTHUMOUS_CRIMINAL_ATTACHMENTS,violatesPosthumousRules,CRIMINAL_CASE_TERMINATED}from './posthumous-annexes';
import {dischargeReadiness,presetRiskPending}from '../../game/discharge-readiness';
import {createPatient}from '../../game/cards';
import {CASE_PRESETS,PRESET_BY_ID}from '../patients';
import type {Card,Effects,Hazard,Patient}from '../../game/types';
import {DOCUMENTED_ENDINGS}from './catalog';
import * as darkChains from './dark-chains';

vi.mock('./dark-chains',async importOriginal=>{
  const original=await importOriginal<typeof import('./dark-chains')>();
  return {...original,darkChainEntry:vi.fn(original.darkChainEntry),darkChainResolve:vi.fn(original.darkChainResolve)};
});

/** Isolated run for eligibility assertions; facts are injected by name and no
 * dice, outcome or chain is overwritten. Not campaign reachability evidence. */
function fresh(seed='end-fixture'):EndingRun{
  const r=startRun(seed,'程医生',[])as EndingRun;
  r.day=15;r.phase='tribunal';r.patients=r.patients.slice(0,1);r.patients[0].clinical=undefined;r.patients[0].damage=0;
  r.facts={};r.hazards=[];r.committed=[];r.queue=[];r.cursor=0;r.reputation=50;r.relations={chief:2,peer:2,nurse:2,family:2};
  r.depression=0;r.income=1000;r.debt=0;r.privateDebt=0;r.receivable=0;r.cash=500;r.exhausted=0;r.emotionalBreaks=0;r.sanBreaks=0;r.uncoveredDays=0;
  r.vitals={stamina:80,san:80,emotion:80};r.partner='none';delete r.authored;delete r.deferredWork;
  return r;
}
const put=(r:EndingRun,...ids:string[])=>{for(const id of ids)r.facts[id]={day:8,source:`source:${id}`,sequence:Object.keys(r.facts).length};};
const scoped=(r:EndingRun,id:string,p=r.patients[0])=>put(r,`${id}:${p.uid}`);
const clinical=(r:EndingRun,id:string,p=r.patients[0])=>put(r,`clinical:${p.uid}:${id}`);
function risk(r:EndingRun,type:Hazard['type'],weight:number,causal=false,choiceId=`${r.patients[0].uid}:missed-exam`,p=r.patients[0]){
  r.hazards.push({id:`${p.uid}:${type}:${r.hazards.length}`,type,weight,causal,reason:'实际处置留下的缺项',norm:'当班必须完成已经明确的检查与会诊',day:3,scope:{kind:'patient',id:p.uid},choiceId,choice:'没有完成必要查体'});
}
/** A criminal seed patient: severe injury with a causal, major-liability hazard. */
function criminalSeed(r:EndingRun,choiceId?:string){const p=r.patients[0];p.damage=2;risk(r,'R',65,true,choiceId);}
/** Facts of every END, and the one change that defeats each page. */
const END_FIXTURES:Record<string,{arrange:(r:EndingRun)=>EndingOptions|void;defeat:(r:EndingRun)=>void}>={
  'END-01':{arrange:r=>{criminalSeed(r);},defeat:r=>{r.patients[0].damage=0;}},
  'END-02':{arrange:r=>{criminalSeed(r);put(r,'刑事-推动出院');r.facts[`early-discharge:${r.patients[0].uid}`]={day:6,source:'E-218:c:E-218-c',sequence:9};},defeat:r=>{delete r.facts['刑事-推动出院'];}},
  'END-03':{arrange:r=>{put(r,'药代-5回扣','刑事-回扣已履行交换','家庭-父母住院','家庭-已请护工');},defeat:r=>{delete r.facts['刑事-回扣已履行交换'];}},
  'END-04':{arrange:r=>{put(r,'刑事-虚假申报参与','刑事-申报取得款项','飞检-通报');risk(r,'F',60);},defeat:r=>{delete r.facts['刑事-申报取得款项'];}},
  'END-05':{arrange:r=>{criminalSeed(r);scoped(r,'tampered');scoped(r,'tampering-discovered');},defeat:r=>{delete r.facts[`tampering-discovered:${r.patients[0].uid}`];}},
  'END-06':{arrange:r=>{criminalSeed(r,`${r.patients[0].uid}:E-053-a`);put(r,'政治-签了');},defeat:r=>{delete r.facts['政治-签了'];}},
  'END-07':{arrange:r=>{put(r,'共犯-共同签署','共犯-分配已收','共犯-本人翻供','药代-5回扣');},defeat:r=>{delete r.facts['共犯-分配已收'];}},
  'END-08':{arrange:r=>{put(r,'resign-requested','药代-5回扣','刑事-出行被拦');},defeat:r=>{delete r.facts['刑事-出行被拦'];}},
  'END-09':{arrange:r=>{put(r,'伤医-施暴者已确定','伤医-明确威胁','伤医-现场冲突','伤医-再次接触','伤医-袭击发生','伤医-抢救无效');},defeat:r=>{delete r.facts['伤医-抢救无效'];}},
  'END-10':{arrange:r=>{put(r,'伤医-袭击发生','伤医-受伤生还','伤医-手部功能损失');},defeat:r=>{delete r.facts['伤医-受伤生还'];}},
  'END-11':{arrange:r=>{put(r,'伤医-袭击发生','伤医-受伤生还','伤医-长期行动障碍');},defeat:r=>{delete r.facts['伤医-长期行动障碍'];}},
  'END-12':{arrange:r=>{r.exhausted=2;put(r,'自身健康线开启','身体-抢救无效');},defeat:r=>{delete r.facts['身体-抢救无效'];}},
  'END-13':{arrange:r=>{r.sanBreaks=2;put(r,'精神-持续住院','精神-无法复岗');},defeat:r=>{r.sanBreaks=1;}},
  'END-14':{arrange:r=>{r.sanBreaks=2;put(r,'精神-长期症状');},defeat:r=>{put(r,'精神-持续住院');}},
  'END-15':{arrange:r=>{r.sanBreaks=2;r.depression=80;put(r,'危机-失联','自杀-死亡确认');},defeat:r=>{put(r,'天台-被找到');}},
  'END-16':{arrange:r=>{r.debt=3000;put(r,'天台-危机发生','天台-被找到','天台-中止当班','危机-评估已做');},defeat:r=>{delete r.facts['天台-被找到'];}},
  'END-17':{arrange:r=>{r.relations.family=0;put(r,'家庭-婚事','家庭-婚礼未到');},defeat:r=>{put(r,'家庭-婚事已付');}},
  'END-18':{arrange:r=>{r.partner='female';put(r,'伴侣-在册','伴侣-女','伴侣-分开','伴侣-挪用共同存款');},defeat:r=>{delete r.facts['伴侣-分开'];}},
  'END-19':{arrange:r=>{r.relations.family=0;put(r,'家庭-断联','家庭-再次许诺','家庭-争执');},defeat:r=>{delete r.facts['家庭-争执'];}},
  'END-20':{arrange:r=>{put(r,'家庭-丧亲','father-deceased','家庭-未赶上告别');},defeat:r=>{put(r,'家庭-已赶上告别');}},
  'END-21':{arrange:r=>{r.debt=2000;put(r,'家庭-资产耗尽','家庭-住处失去','asset-sold');},defeat:r=>{r.debt=0;}},
  'END-22':{arrange:r=>{r.patients[0].damage=2;risk(r,'R',40,true);r.income=500;},defeat:r=>{put(r,'医责险');r.income=9000;}},
  'END-23':{arrange:r=>{r.uncoveredDays=2;},defeat:r=>{r.uncoveredDays=1;}},
  'END-24':{arrange:r=>{r.privateDebt=30000;put(r,'家庭-担保违约','family-funding');},defeat:r=>{r.privateDebt=0;}},
  'END-25':{arrange:r=>{r.debt=2000;put(r,'家庭-住处失去','asset-sold','家庭-借住已约定');},defeat:r=>{delete r.facts['家庭-借住已约定'];}},
  'END-26':{arrange:r=>{r.debt=50001;put(r,'离岗-手续已办');},defeat:r=>{r.debt=1000;}},
  'END-27':{arrange:r=>{r.debt=2000;put(r,'卖车','家庭-车祸-ICU中');},defeat:r=>{delete r.facts['家庭-车祸-ICU中'];}},
  'END-28':{arrange:r=>{r.debt=2000;put(r,'离岗-手续已办');},defeat:r=>{put(r,'精神-长期症状');}},
  'END-29':{arrange:r=>{r.debt=2000;put(r,'离岗-手续已办','飞检-通报');},defeat:r=>{delete r.facts['飞检-通报'];}},
  'END-30':{arrange:r=>{put(r,'离岗-手续已办','家庭-住处失去','家庭-断联','family-funding');},defeat:r=>{delete r.facts['家庭-断联'];}},
  'END-31':{arrange:r=>{put(r,'离岗-手续已办','自身健康线开启','未就诊');},defeat:r=>{delete r.facts['未就诊'];}},
  'END-32':{arrange:r=>{r.debt=2000;put(r,'离岗-手续已办','科研-通报');},defeat:r=>{delete r.facts['科研-通报'];}},
  'END-33':{arrange:r=>{put(r,'离岗-手续已办','qualification-exam-failed');},defeat:r=>{delete r.facts['qualification-exam-failed'];}},
  'END-34':{arrange:r=>{r.relations.chief=3;put(r,'科室-向新人转嫁','政治-沉默');},defeat:r=>{delete r.facts['科室-向新人转嫁'];}},
  'END-35':{arrange:r=>{put(r,'药代-5回扣','利益-继续承接');r.cash=100;},defeat:r=>{r.cash=0;}},
  'END-36':{arrange:r=>{r.relations.chief=4;put(r,'政治-举报','科室-接受继续施压');},defeat:r=>{r.relations.chief=3;}},
  'END-37':{arrange:r=>{r.reputation=60;clinical(r,'unrest_suppressed_once');put(r,'BTF-003:false_patient_statement');},defeat:r=>{clinical(r,'unrest_escalated');}},
  'END-38':{arrange:r=>{const p=r.patients[0];p.damage=3;risk(r,'R',20,true);risk(r,'C',70);risk(r,'D',4);scoped(r,'prosecuted');},defeat:r=>{scoped(r,'autopsy-done');}},
  'END-39':{arrange:r=>{r.patients[0].damage=2;risk(r,'R',65,false);r.debt=3000;put(r,'医责险','复岗-已办理','已就诊');},defeat:r=>{delete r.facts['复岗-已办理'];}},
  'END-40':{arrange:r=>{clinical(r,'superior_order_recorded');put(r,'离岗-手续已办','离岗-新工作已落实','离岗-住处已落实','还款-已约定','离岗-交接已完成');},defeat:r=>{put(r,'离岗-未安排');}},
};
/** Some pages depend on a documented roll (filing, acquittal, discovery); try
 * seeds until the engine's own dice agree, never overwrite a face. */
function endFixture(id:string):{r:EndingRun;options:EndingOptions}{
  for(let i=0;i<4000;i++){
    const r=fresh(`end:${id}:${i}`),options=END_FIXTURES[id].arrange(r)??{};
    if(endingEligibility(r,id,options).eligible)return{r,options};
  }
  const r=fresh(`end:${id}:0`),options=END_FIXTURES[id].arrange(r)??{};
  throw new Error(`No route to ${id}: ${JSON.stringify(endingEligibility(r,id,options))}`);
}
const CONTRACT_PRIORITY:Record<string,number>={'END-09':210,'END-12':208,'END-15':206,'END-38':199,'END-08':198,'END-07':197,'END-05':196,'END-04':195,'END-03':194,'END-06':193,'END-02':192,'END-01':191,'END-10':185,'END-11':184,'END-13':178,'END-14':176,'END-16':168,'END-21':160,'END-20':158,'END-19':156,'END-18':154,'END-17':152,'END-25':145,'END-24':144,'END-27':143,'END-23':142,'END-22':141,'END-26':140,'END-30':135,'END-28':134,'END-29':133,'END-31':132,'END-32':131,'END-33':130,'END-37':125,'END-34':124,'END-36':123,'END-35':122,'END-39':115,'END-40':100};
/** The fourteen pages whose facts already have a writer in this repository. */
const REACHABLE_TODAY=['END-01','END-05','END-06','END-17','END-22','END-23','END-27','END-28','END-29','END-31','END-32','END-33','END-37','END-38'];

describe('the forty END main pages',()=>{
  it('defines each END once with the contract priority and a story key',()=>{
    for(const id of STORY_ENDING_IDS){
      const def=DOCUMENTED_ENDINGS.find(e=>e.id===id);
      expect(def,id).toBeDefined();expect(def!.priority,id).toBe(CONTRACT_PRIORITY[id]);
      expect(def!.source.path).toContain('结局与暗黑链实施合同');
    }
    expect(MAIN_ENDINGS).toEqual([...STORY_ENDING_IDS].sort((a,b)=>CONTRACT_PRIORITY[b]-CONTRACT_PRIORITY[a]));
    expect(MAIN_ENDINGS.some(id=>id.startsWith('X'))).toBe(false);
    expect(ATTACHMENT_POOL).toEqual(['X05','X08','X09','X10','X11','X12','X13','X14','X15','X16','X17','X18','X19','X20','X21','X22','X23','X24','X25','X26','X31','X35','X37','X38','X39','X40','X41']);
  });
  for(const id of STORY_ENDING_IDS)it(`${id} holds on its facts, is refused without them, and is the page the run gets`,()=>{
    const{r,options}=endFixture(id);
    const original=JSON.stringify(r);
    const ending=documentedEnding(r,id,options);
    expect(ending.storyId).toBe(id);expect(ending.decision.length).toBeGreaterThan(20);
    expect(ending.annexIds).not.toContain(id);expect(ending.annexIds.every(x=>x.startsWith('X'))).toBe(true);
    expect(JSON.stringify(r)).toBe(original);
    const chosen=options.early?earlyEnding(r,options.early):tribunalEnding(r,options.response??'facts');
    expect(chosen.id,`${id} is outranked by ${chosen.id}`).toBe(id);
    const broken=fresh(r.seed);END_FIXTURES[id].arrange(broken);END_FIXTURES[id].defeat(broken);
    expect(endingEligibility(broken,id,options).eligible,`${id} still holds after ${JSON.stringify(END_FIXTURES[id].defeat.toString())}`).toBe(false);
  });
  it('lists the fourteen pages reachable without the new chains',()=>{
    for(const id of REACHABLE_TODAY)expect(END_FIXTURES[id],id).toBeDefined();
    expect(REACHABLE_TODAY).toHaveLength(14);
  });
  it('gives the death band the page before every other band',()=>{
    const{r}=endFixture('END-01');
    put(r,'伤医-施暴者已确定','伤医-明确威胁','伤医-再次接触','伤医-袭击发生','伤医-抢救无效');r.debt=90000;
    const ending=tribunalEnding(r,'facts')as DocumentedEnding;
    expect(ending.id).toBe('END-09');expect(endingEligibility(r,'END-01').eligible).toBe(false);expect(endingEligibility(r,'END-26').eligible).toBe(false);
  });
  it('keeps only END-38 when the acquittal die falls',()=>{
    const{r,options}=endFixture('END-38');
    for(const id of ['END-01','END-02','END-05','END-06','END-07','END-08'])expect(endingEligibility(r,id,options).eligible,id).toBe(false);
  });
  it('withdraws END-19 and END-21 once the father has died',()=>{
    for(const id of ['END-19','END-21']){const{r,options}=endFixture(id);put(r,'家庭-丧亲','father-deceased');expect(endingEligibility(r,id,options).eligible,id).toBe(false);}
  });
  it('takes the debt band while the post remains and the leaving band once it is gone',()=>{
    const{r}=endFixture('END-23');
    expect(tribunalEnding(r,'facts').id).toBe('END-23');
    r.debt=2000;put(r,'离岗-手续已办');
    expect(endingEligibility(r,'END-23').eligible).toBe(false);expect(tribunalEnding(r,'facts').id).toBe('END-28');
  });
  it('requires an actual transfer of responsibility for END-34, never plain teaching',()=>{
    const{r,options}=endFixture('END-34');delete r.facts['科室-向新人转嫁'];put(r,'科室-本人承担');
    expect(endingEligibility(r,'END-34',options).eligible).toBe(false);
  });
  it('lands END-22 for a seed patient and END-33 for a clean run when no page holds',()=>{
    const clean=fresh('fallback-clean');
    const ending=tribunalEnding(clean,'facts')as DocumentedEnding;
    expect(ending.id).toBe('END-33');expect(ending.annexIds).not.toContain('END-33');
    const seeded=fresh('fallback-seed');seeded.patients[0].damage=2;risk(seeded,'R',40,true);put(seeded,'医责险');seeded.income=90000;
    expect(endingEligibility(seeded,'END-22').eligible).toBe(false);
    expect(tribunalEnding(seeded,'facts').id).toBe('END-22');
  });
  it('turns a requested legacy page into the ranked END page with the record attached',()=>{
    const r=fresh('requested-x21');r.vitals.san=0;r.phase='play';r.day=6;
    const ending=documentedEnding(r,'X21',{requested:'X21'})as DocumentedEnding;
    expect(ending.id).toMatch(/^END-/);expect(ending.annexIds).toContain('X21');
  });
  it('reads the uploaded video from the fact, not from having seen E-198',()=>{
    const r=fresh('video');r.reputation=10;put(r,'视频上网');
    expect(endingEligibility(r,'X19').eligible).toBe(true);
    const seen=fresh('video-seen');seen.reputation=10;seen.authored={...startRun('video-seen-2','程医生',[]).authored!,seen:{'E-198':3}};
    expect(endingEligibility(seen,'X19').eligible).toBe(false);
  });
});

describe('death endings settle their annexes as estate matters',()=>{
  for(const id of DEATH_ENDING_IDS)it(`${id} attaches no job, sentence, phone or rehabilitation to the deceased`,()=>{
    const{r,options}=endFixture(id);
    r.receivable=3000;r.privateDebt=10000;r.debt=8000;r.exhausted=Math.max(r.exhausted,2);r.depression=80;r.relations.family=3;
    put(r,'resign-requested','hospital-infection-system','health-open','health-report-abnormal','家庭-丧亲');
    const p=r.patients[0];p.damage=2;risk(r,'R',40,true);
    const ending=documentedEnding(r,id,options);
    expect(ending.storyId).toBe(id);
    for(const x of [...POSTHUMOUS_REMOVED_ATTACHMENTS,...POSTHUMOUS_CRIMINAL_ATTACHMENTS])expect(ending.annexIds,x).not.toContain(x);
    for(const annex of ending.annexes)expect(violatesPosthumousRules(annex),annex).toBe(false);
    expect(ending.annexes.some(a=>a.includes('借款人交给家属'))).toBe(true);
    expect(ending.annexes.some(a=>a.includes('家属与债权人核对余额'))).toBe(true);
    expect(ending.annexes.some(a=>a.includes('遗产与担保关系'))).toBe(true);
    expect(ending.annexes.some(a=>a.startsWith('医疗损害赔偿明细')&&a.includes('遗产与医院内部安排'))).toBe(true);
    expect(ending.annexes.join('\n')).not.toMatch(/绩效扣至|你/);
    const living=documentedEnding(fresh('living'),'END-33',{fallback:true});
    expect(living.annexes.join('\n')).not.toContain(CRIMINAL_CASE_TERMINATED);
  });
  it('settles the death pages at the lowest reward tier without unlocking anything of their own',()=>{
    const r=startRun('death-reward','程医生',['T06']);r.day=15;r.phase='ending';
    r.ending={id:'END-15',storyId:'END-15',title:'局外人',category:'死亡',decision:'',epilogue:'',annexes:[],court:false,annexIds:['X21']};
    const meta=reward(newMeta(),r);
    expect(meta.xp).toBe(DEATH_ENDING_XP);expect(meta.insight??0).toBe(0);expect(meta.endings).toEqual(['END-15','X21']);expect(meta.runs).toBe(1);
    const alive={...r,ending:{...r.ending,id:'END-33',storyId:'END-33',category:'离院'}};
    expect(reward(newMeta(),alive).xp).toBeGreaterThan(DEATH_ENDING_XP);
  });
});

describe('no settlement die beyond the documented eight',()=>{
  const ALLOWED=['court:case','court:acquittal','court:nonprosecution','court:corruption','court:system-infection','court:review','court:review:patient','civil:'];
  it('keeps every runRandom/runDie key in the ending adapter inside the whitelist',()=>{
    const source=readFileSync(new URL('./ending-adapter.ts',import.meta.url),'utf8');
    const keys=[...source.matchAll(/run(?:Random|Die)\(\s*\w+\s*,\s*(['"`])((?:(?!\1).)*)\1/g)].map(m=>m[2]);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    for(const key of keys)expect(ALLOWED.some(prefix=>key.startsWith(prefix)),key).toBe(true);
    for(const file of ['./posthumous-annexes.ts','./dark-chains.ts'])expect(readFileSync(new URL(file,import.meta.url),'utf8')).not.toMatch(/runRandom|runDie/);
  });
  it('draws the same dice for a fixed run whichever page is assessed',()=>{
    const{r}=endFixture('END-01');
    const first=assessEnding(r),second=assessEnding(r);
    expect(first.face).toBe(second.face);expect(first.corruptionCaught).toBe(second.corruptionCaught);
  });
});

describe('partner registration',()=>{
  it('writes the roster facts only for a registered partner and keeps them through the save',()=>{
    const none=startRun('partner-none','程医生',[]);
    expect(none.partner).toBe('none');expect(none.facts['伴侣-在册']).toBeUndefined();
    const she=startRun('partner-f','程医生',[],newMeta(),'rotation',undefined,{partner:'female'});
    expect(she.partner).toBe('female');expect(she.facts['伴侣-在册']).toBeDefined();expect(she.facts['伴侣-女']).toBeDefined();expect(she.facts['伴侣-男']).toBeUndefined();
    const he=startRun('partner-m','程医生',[],newMeta(),'rotation',undefined,{partner:'male'});
    expect(he.facts['伴侣-男']).toBeDefined();expect(he.facts['伴侣-女']).toBeUndefined();
    expect(restored(he).partner).toBe('male');
    const legacy={...none}as Partial<Run>;delete legacy.partner;
    expect(decode(encode({...emptySave(),run:legacy as Run})).run?.partner).toBe('none');
    expect(()=>decode(encode({...emptySave(),run:{...none,partner:'two'as never}}))).toThrow();
  });
  it('refuses END-18 without a partner on record',()=>{
    const r=fresh('no-partner');put(r,'伴侣-分开','伴侣-挪用共同存款');
    expect(endingEligibility(r,'END-18').eligible).toBe(false);
    r.partner='male';expect(endingEligibility(r,'END-18').eligible).toBe(true);
  });
});

describe('preset risk closure gates the planned discharge',()=>{
  it('names what is still missing and clears once the required flags are on record',()=>{
    const r=startRun('risk-closure','程医生',[]);r.day=4;
    const admit=(suffix:string)=>{for(const candidate of CASE_PRESETS.filter(c=>c.period==='病区'))try{return createPatient(r,candidate.id,suffix);}catch{}throw new Error('No ward preset patient');};
    const p=admit('census');r.patients.push(p);
    expect(p.preset).toBeDefined();
    const preset=PRESET_BY_ID.get(p.preset!.presetId)!;
    p.settled=true;p.stability=3;p.presetNode=`preset:${preset.id}:${p.uid}:echo`;p.presetResolved=true;p.active=true;p.inpatient=true;p.bed=p.bed||1;
    const pending=presetRiskPending(p,r.facts);
    expect(pending).toEqual(preset.riskClosure.pending);
    const closed=dischargeReadiness(p,r.facts);
    expect(closed.ready).toBe(false);expect(closed.reason).toContain('尚未');expect(closed.reason).toContain(preset.riskClosure.pending[0]);
    expect(dischargeReadiness(p).ready).toBe(true);
    for(const flag of preset.riskClosure.requires)r.facts[flag.replace(`preset:${preset.id}`,`preset:${preset.id}:${p.uid}`)]={day:4,source:'preset',sequence:0};
    expect(presetRiskPending(p,r.facts)).toEqual([]);expect(dischargeReadiness(p,r.facts).ready).toBe(true);
    const unopened=admit('handover');unopened.settled=true;unopened.stability=3;
    expect(presetRiskPending(unopened,r.facts)).toEqual([]);
  });
});

describe('dark-chain hooks at the second zero',()=>{
  const entry=vi.mocked(darkChains.darkChainEntry),resolve=vi.mocked(darkChains.darkChainResolve);
  function task(id:string,effects:Effects={}):Card{
    return{id,kind:'story',shiftPhase:'查房',scope:{kind:'personal',id:'self'},title:'交班电话',text:'同事打来电话。',options:[{id:`${id}:answer`,label:'接听电话',ap:0,minutes:0,cost:0,result:'你把尚未交接的事项告诉同事。',effects}]};
  }
  function secondZero(seed:string):Run{
    const r=startRun(seed,'程医生',[]);
    r.day=6;r.shiftPhase='查房';r.phase='play';r.ap=10;r.cash=20000;r.patients=[];r.vitals={stamina:80,san:80,emotion:80};r.sanBreaks=1;
    r.facts['san-ever-zero']={day:3,source:'E-200-b',sequence:0};
    r.queue=[task('trigger',{san:-200}),task('remaining'),task('later')];r.cursor=0;delete r.feedback;delete r.roll;delete r.pendingCheck;
    return r;
  }
  it('stops as before while the stub returns no card, and the debt stop lands on END-26',()=>{
    entry.mockReset();entry.mockImplementation(()=>undefined);resolve.mockReset();resolve.mockImplementation(()=>{});
    const out=act(secondZero('stub-san'),{type:'choose',id:'trigger:answer'});
    expect(entry).toHaveBeenCalledWith(expect.anything(),'san');
    expect(out.phase).toBe('ending');expect(out.ending?.id).toMatch(/^END-/);expect(out.ending?.annexIds).toContain('X21');
    const indebted=fresh('early-debt');indebted.debt=50001;
    expect(earlyEnding(indebted,'debt').id).toBe('END-26');
  });
  it('inserts the chain card, keeps the run alive, and closes it on the resolved fact',()=>{
    entry.mockReset();resolve.mockReset();
    let armed=false;
    entry.mockImplementation((_r,kind)=>kind==='san'?task('dark-entry',{san:5}):undefined);
    resolve.mockImplementation(r=>{if(!armed||r.facts['dark-chain-resolved:san'])return;r.facts['精神-长期症状']={day:r.day,source:'E-232',sequence:0};r.facts['dark-chain-resolved:san']={day:r.day,source:'E-232',sequence:1};});
    let r=act(secondZero('chain-san'),{type:'choose',id:'trigger:answer'});
    expect(r.phase).toBe('play');expect(r.ending).toBeUndefined();expect(r.emergency?.vital).toBe('san');expect(r.facts['dark-chain:san']).toBeDefined();
    expect(currentCard(r)?.id).toBe('dark-entry');expect(r.sanBreaks).toBe(2);
    expect(storageRunIssues(r)).toEqual([]);r=restored(r);
    r=act(r,{type:'choose',id:'dark-entry:answer'});
    if(r.phase==='feedback')r=act(r,{type:'continue'});
    expect(r.ending).toBeUndefined();expect(r.emergency).toBeUndefined();
    expect(availableOptions(r).length).toBeGreaterThan(0);
    r.vitals.san=0;
    r=act(r,{type:'choose',id:`${currentCard(r)!.id}:answer`});
    if(r.phase==='feedback')r=act(r,{type:'continue'});
    expect(r.ending,'a zero SAN inside an open chain must not re-enter or stop').toBeUndefined();
    armed=true;
    r=act(r,{type:'choose',id:`${currentCard(r)!.id}:answer`});
    expect(r.phase).toBe('ending');expect(r.facts['dark-chain-resolved:san']).toBeDefined();
    expect(r.ending?.id).toBe('END-14');expect(r.ending?.storyId).toBe('END-14');
  });
  it('offers the stamina chain the same way',()=>{
    entry.mockReset();resolve.mockReset();resolve.mockImplementation(()=>{});
    entry.mockImplementation((_r,kind)=>kind==='stamina'?task('body-entry',{stamina:5}):undefined);
    const r=secondZero('chain-stamina');r.exhausted=1;r.queue[0]=task('trigger',{stamina:-200});
    const out=act(r,{type:'choose',id:'trigger:answer'});
    expect(out.ending).toBeUndefined();expect(out.emergency?.vital).toBe('stamina');expect(out.exhausted).toBe(2);expect(out.facts['dark-chain:stamina']).toBeDefined();
  });
});

describe('non-dark predicate',()=>{
  it('counts END-40 and the three quiet pages only when no dark page is attached',async()=>{
    const {nonDarkEnding}=await import('../../../scripts/simulate');
    expect(nonDarkEnding({id:'END-40'})).toBe(true);
    expect(nonDarkEnding({id:'END-33',annexIds:['X21']})).toBe(true);
    expect(nonDarkEnding({id:'END-33',annexIds:['END-01']})).toBe(false);
    expect(nonDarkEnding({id:'END-28'})).toBe(false);
    expect(selectMainEnding(fresh('predicate')).id).toBe('END-33');
  });
});
