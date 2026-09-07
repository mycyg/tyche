import {describe,it,expect}from'vitest';
import{startRun}from'./engine';
import{assessEnding,auditScore,documentedEnding,documentedRouteClosures,endingEligibility,ENDING_IDS,liability,tribunalEnding}from'./endings';
import{ATTACHMENT_POOL}from'../content/events/ending-adapter';
import type{EndingRun,EndingOptions,DocumentedEnding}from'./endings';
import type{Patient,Hazard}from'./types';
const fresh=():EndingRun=>{const r=startRun('ending-test','程医生',[]);r.day=15;r.phase='tribunal';r.patients=r.patients.slice(0,1);r.patients[0].clinical=undefined;r.patients[0].damage=0;r.facts={};r.hazards=[];r.committed=[];r.queue=[];r.cursor=0;r.reputation=50;r.relations={chief:2,peer:2,nurse:2,family:2};r.depression=0;r.income=1000;r.debt=0;r.privateDebt=0;r.exhausted=0;r.emotionalBreaks=0;r.vitals={stamina:80,san:80,emotion:80};delete r.authored;return r;};
const flag=(r:EndingRun,id:string)=>{r.facts[id]={day:8,source:`source:${id}`,sequence:Object.keys(r.facts).length};};
const scoped=(r:EndingRun,id:string,p=r.patients[0])=>flag(r,`${id}:${p.uid}`);
function risk(r:EndingRun,type:Hazard['type'],weight:number,causal=false,p=r.patients[0]){r.hazards.push({id:`${p.uid}:${type}`,type,weight,causal,reason:'实际处置留下的缺项',norm:'当班必须完成已经明确的检查与会诊',day:3,scope:{kind:'patient',id:p.uid},choiceId:`${p.uid}:missed-exam`,choice:'没有完成必要查体'});}
function fixture(id:string):{r:EndingRun;options:EndingOptions}{
  const r=fresh(),options:EndingOptions={response:'facts'},p=r.patients[0];
  if(['X01','X02','X03','X04','X05','X07','X08','X13','X14','X15','X16','X40'].includes(id))p.damage=2;
  if(['X01','X02','X03','X07','X08','X13'].includes(id))risk(r,'R',id==='X03'?55:65,true);
  if(id==='X02'){scoped(r,'compensated');scoped(r,'forgiven');options.response='admit';}
  if(id==='X03')scoped(r,'forgiven');
  if(id==='X04'){p.damage=3;risk(r,'R',20,true);risk(r,'C',70);risk(r,'D',4);scoped(r,'prosecuted');}
  if(id==='X05'){risk(r,'R',40,true);scoped(r,'reported');}
  if(id==='X06')flag(r,'药代-4统方');
  if(id==='X09'||id==='X10')risk(r,'F',id==='X09'?60:45);
  if(id==='X10')flag(r,'举报查实');
  if(id==='X11')flag(r,'paper-submitted-false');
  if(id==='X12')flag(r,'hospital-infection-system');
  if(id==='X14'||id==='X40')risk(r,'R',40,true);
  if(id==='X15'){risk(r,'R',60,true);scoped(r,'1224');scoped(r,'concealment-causal');}
  if(id==='X16'){risk(r,'D',5);scoped(r,'tampered');}
  if(id==='X17'||id==='X20')r.exhausted=2;
  if(id==='X20'||id==='X22')r.shiftPhase='夜班';
  if(id==='X18'){r.exhausted=1;flag(r,'health-open');flag(r,'health-report-abnormal');}
  if(id==='X19'){flag(r,'视频上网');r.reputation=10;}
  if(id==='X21'||id==='X22')r.vitals.san=0;
  if(id==='X23')flag(r,`clinical:${p.uid}:san-wrong-record-discovered`);
  if(id==='X24'||id==='X26'){r.depression=80;r.relations.family=id==='X24'?3:0;}
  if(id==='X25'){r.emotionalBreaks=2;flag(r,'complaint-escalated');}
  if(id==='X27'){flag(r,'wedding-planned');flag(r,'wedding-absent');r.relations.family=0;}
  if(id==='X28')r.uncoveredDays=2;
  if(id==='X29')r.debt=50001;
  if(id==='X30'){flag(r,'car-sold');r.debt=1000;}
  if(id==='X31'||id==='X32')flag(r,'resign-requested');
  if(id==='X32')flag(r,'kickback-received');
  if(id==='X34')r.depression=60;
  if(id==='X35')r.relations.chief=1;
  if(id==='X36'){r.reputation=80;r.relations.chief=4;r.relations.peer=3;}
  if(id==='X37')for(let i=0;i<6;i++)flag(r,`defensive-transfer:${i}`);
  if(id==='X38'){p.caseId='C020';p.damage=3;flag(r,`clinical:${p.uid}:autopsy_discussed`);scoped(r,'autopsy-consented');}
  if(id==='X39')for(const f of ['recording_full','unrest_1_success','unrest_2_success','unrest_3_success'])flag(r,`clinical:${p.uid}:${f}`);
  if(id==='X40')r.priorSeeds=[{runId:'previous-run',caseId:p.caseId,trapId:'missed-exam'}];
  if(id==='X41'){r.talents=['T01'];r.lampSignals=Array.from({length:8},(_,i)=>({patientId:p.uid,nodeId:`node-${i}`,day:i+1}));}
  for(let i=0;i<2000;i++){
    r.seed=`end:${id}:${i}`;
    if(!endingEligibility(r,id,options).eligible)continue;
    // Pages outside the attachment pool are replaced by an END main page; their
    // record only needs to stay adjudicable on its own.
    if(!ATTACHMENT_POOL.includes(id))return{r,options};
    const result=tribunalEnding(r,options.response??'facts')as DocumentedEnding;
    if(result.id===id||result.annexIds?.includes(id))return{r,options};
  }
  throw new Error(`No adjudicated route to ${id}: ${JSON.stringify(endingEligibility(r,id,options))}`);
}
const X_IDS=ENDING_IDS.filter(id=>id.startsWith('X'));
describe('all documented ending pages are genuinely adjudicable',()=>{
  it('retains every X01–X41 source definition once beside the forty END pages',()=>{
    expect(X_IDS).toEqual(Array.from({length:41},(_,i)=>`X${String(i+1).padStart(2,'0')}`));
    expect(ENDING_IDS.filter(id=>id.startsWith('END-'))).toEqual(Array.from({length:40},(_,i)=>`END-${String(i+1).padStart(2,'0')}`));
  });
  for(const id of X_IDS)it(`${id} has a reachable decision or attachment, not just a title`,()=>{
    const{r,options}=fixture(id);const original=JSON.stringify(r),ending=documentedEnding(r,id,options);
    expect(ending.id).toBe(id);expect(ending.sourceId).toBe(id);expect(ending.decision.length).toBeGreaterThan(25);expect(ending.epilogue.length).toBeGreaterThan(15);
    expect(JSON.stringify(r)).toBe(original);expect(ending.decision+ending.epilogue).not.toMatch(/候选|引擎|节点|写入|设计|玩家|flag|⚠/);
    const adjudicated=tribunalEnding(r,options.response??'facts')as DocumentedEnding;
    expect(adjudicated.id).toMatch(/^END-\d\d$/);
    if(ATTACHMENT_POOL.includes(id))expect(adjudicated.annexIds).toContain(id);
    else expect(adjudicated.annexIds).not.toContain(id);
  });
});
describe('injury, knowledge and evidence boundaries',()=>{
  it('covers all ten documented routes without displaying an unopened route as history',()=>{
    const r=fresh(),p=r.patients[0];expect(documentedRouteClosures(r)).toEqual([]);
    flag(r,`clinical:${p.uid}:unrest_1_success`);flag(r,'飞检-进驻');p.charged=300;
    scoped(r,'1224');flag(r,'质疑-1回扣');flag(r,'药代-0搭话');flag(r,'科研-deadline');flag(r,'家庭-婚事');flag(r,'知情');flag(r,'health-open');
    const closures=documentedRouteClosures(r);expect(closures.map(c=>c.id)).toEqual(Array.from({length:10},(_,i)=>`2.${i+1}`));
    expect(closures.every(c=>c.sources.length>0)).toBe(true);expect(closures.find(c=>c.id==='2.7')!.status).toBe('pending');expect(closures.find(c=>c.id==='2.10')!.status).toBe('pending');
  });
  it('does not transform a submitted research problem into patient injury or criminal liability',()=>{
    const r=fresh();flag(r,'paper-submitted-false');risk(r,'D',100);r.hazards[0].scope={kind:'project',id:'paper'};
    expect(assessEnding(r).seeds).toHaveLength(0);expect(assessEnding(r).filed).toBe(false);
    const ending=tribunalEnding(r,'admit')as DocumentedEnding;expect(ending.id).toMatch(/^END-/);expect(ending.category).not.toBe('刑事');expect(ending.annexIds).toContain('X11');
  });
  it('refuses suspension/suspended sentence from someone else’s forgiveness or mere confession',()=>{
    const {r}=fixture('X01'),other={...r.patients[0],uid:'another-patient'};r.patients.push(other);other.damage=0;
    scoped(r,'forgiven',other);scoped(r,'compensated',other);
    expect(endingEligibility(r,'X02',{response:'admit'}).eligible).toBe(false);
    expect(()=>documentedEnding(r,'X02',{response:'admit'})).toThrow();
  });
  it('requires actual harmful clinical conduct, not only a loud complaint',()=>{
    const r=fresh();r.patients[0].damage=3;risk(r,'C',200);scoped(r,'reported');
    expect(assessEnding(r).filed).toBe(false);expect(tribunalEnding(r,'facts').category).not.toBe('刑事');
  });
  it('does not treat discussing an autopsy as family consent',()=>{
    const r=fresh(),p=r.patients[0];p.caseId='C020';p.damage=3;flag(r,`clinical:${p.uid}:autopsy_discussed`);
    expect(endingEligibility(r,'X38').eligible).toBe(false);expect(assessEnding(r).seeds).toEqual([]);
    scoped(r,'autopsy-consented');expect(endingEligibility(r,'X38').eligible).toBe(true);
  });
  it('keeps Q per decision and unchanged after mitigation',()=>{
    const r=fresh();risk(r,'R',20,true);risk(r,'C',10);risk(r,'D',10);
    expect(auditScore(r)).toBe(2);r.hazards.forEach(h=>h.weight=0);expect(auditScore(r)).toBe(2);
  });
  it('does not use a different patient’s 1224 record as a liability reduction',()=>{
    const r=fresh(),p=r.patients[0];p.damage=2;risk(r,'R',60,true);
    flag(r,'1224:another');flag(r,'concealment-causal:another');expect(liability(r,p).L).toBe(60);
    scoped(r,'1224');scoped(r,'concealment-causal');expect(liability(r,p).L).toBe(45);
  });
  it('does not collect repeat-trap achievement from a different trap in the same case',()=>{
    const {r}=fixture('X40');r.priorSeeds![0].trapId='different-trap';expect(endingEligibility(r,'X40').eligible).toBe(false);
  });
  it('does not revoke registration for acquittal, nonprosecution or pending corruption inquiry',()=>{
    for(const id of ['X04','X05','X06']){const{r,options}=fixture(id);expect(documentedEnding(r,id,options).annexIds).not.toContain('X08');}
  });
});
