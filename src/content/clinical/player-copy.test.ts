import {describe,expect,it} from 'vitest';
import {clinicalGraphs,getClinicalGraph,initialGraphState,getAvailableGraphOptions,canContinueGraph,advanceClinicalGraph} from './index';
import {applyClinicalPlayerCopy,clinicalNodeText,projectClinicalText} from './player-copy';
import {clinicalCard,refreshClinicalCardCopy} from '../../game/clinical';
import {createPatient} from '../../game/cards';
import {act,availableOptions,currentCard,startRun} from '../../game/engine';
import type {ClinicalGraphState} from './types';

function walk(caseId:string,path:string,variants:string[]=[]){
 const g=getClinicalGraph(caseId)!;let s=initialGraphState(g,'player-copy-source');s.variants=variants;
 let last:ReturnType<typeof advanceClinicalGraph>|undefined;
 for(const id of path.split(' ').filter(Boolean)){
  for(let guard=0;!getAvailableGraphOptions(g,s).some(o=>o.id===id)&&guard<20;guard++){
   const automatic=getAvailableGraphOptions(g,s).find(o=>o.automatic);
   if(automatic)s=advanceClinicalGraph(g,s,automatic.id,false).state;
   else if(canContinueGraph(g,s))s=advanceClinicalGraph(g,s,'continue').state;
   else break;
  }
  expect(getAvailableGraphOptions(g,s).map(o=>o.id),`${caseId}/${s.nodeId}`).toContain(id);
  last=advanceClinicalGraph(g,s,id,true);s=last.state;
 }
 return {g,s,last};
}
const body=(caseId:string,state:ClinicalGraphState)=>clinicalNodeText(getClinicalGraph(caseId)!.nodes.find(n=>n.id===state.nodeId)!,state);
const script=/\b(?:s\d+_[a-z_]+|o_[a-z_]+|[a-z]+_[a-z_]+|variant=)|⚠待核|\bDC\s*\d|\b[RDF]\s+\d/;

describe('source-separated clinical player projection',()=>{
 it('source arrival clocks, waiting-room counts and fixed stay-day are not projected as the current shift',()=>{
  for(const id of ['C001','C002','C003','C004','C005','C006','C007','C008','C014','C016']) {
   const g=getClinicalGraph(id)!,s=initialGraphState(g,'arrival-clock');
   expect(body(id,s),id).not.toMatch(/凌晨|上午|下午|入院第\s*5\s*天|十一个号|二十几个号|神经内科门诊|儿科急诊抢救床|留观室/);
   expect(g.nodes[0].source.raw.length).toBeGreaterThan(30);
  }
  const {s}=walk('C008','s1_history s2_lp', ['onsite']);
  // Medical time windows in actual later decisions are not stripped.
  const g=getClinicalGraph('C008')!;s.nodeId='s4';s.flags.push('lp_consented');
  expect(body('C008',s)).toContain('30 分钟');
 });
 it('C018 scenes display the already-public screenshot and clinical context before asking what to do with it',()=>{
  const g=getClinicalGraph('C018')!,before=initialGraphState(g,'screenshot-visible');
  for(const n of g.nodes)expect(n.text.trim(),n.id).not.toBe('');
  expect(body('C018',before)).toContain('按盒算有支持');
  before.nodeId='s6';expect(body('C018',before)).toContain('按盒算有支持');expect(body('C018',before)).toContain('不等于已经证明');
  expect(before.flags).not.toContain('group_screenshot_preserved');
  expect(g.presentation.appearance).toContain('按盒算有支持');
 });
 it('C008 the three-drug action does not execute or narrate the separately selectable mannitol action',()=>{
  const g=getClinicalGraph('C008')!,s=initialGraphState(g,'separate-orders');s.nodeId='s4';s.entered.push('s4');
  const before=structuredClone(s),result=advanceClinicalGraph(g,s,'s4_empiric');
  expect(result.actionText).toContain('头孢曲松 800 mg');expect(result.actionText).toContain('万古霉素 120 mg');expect(result.actionText).toContain('地塞米松');
  expect(result.actionText).not.toMatch(/甘露醇|限液|心电监护|咪达唑仑|地西泮|已采.*血培养/);
  expect(result.state.choices).not.toContain('s4_mannitol');expect(result.state.flags).not.toContain('icp_treated');expect(s).toEqual(before);
  const separate=advanceClinicalGraph(g,s,'s4_mannitol');expect(separate.actionText).toContain('甘露醇');
  expect(g.nodes.find(n=>n.id==='s4')!.source.raw).toContain('甘露醇 20 mL');
 });
 it('bed and spoken-name projection binds the primary patient without merging the same-name neighbor or changing clinical values',()=>{
  const p={name:'靳砚舟',bed:5};
  const raw='31 床陈秀英，O 型 RhD 阳性；33 床 A 型 RhD 阳性。血红蛋白 58 g/L，血压 82/50 mmHg，结合珠蛋白 <0.1 g/L。';
  const text=projectClinicalText('C009',raw,p);
  expect(text).toContain('5 床靳砚舟');expect(text).toContain('另一张同名患者的床 A 型');expect(text).toContain('O 型');
  expect(text.match(/5 床/g)).toHaveLength(1);expect(text).toContain('<0.1 g/L');expect(text).toContain('82/50 mmHg');expect(text).toContain('58 g/L');
  expect(projectClinicalText('C009','「陈秀英，七十二。三年前输过一次，没什么反应。」',p)).toContain('「靳砚舟，七十二。');
  expect(projectClinicalText('C003',raw,p)).toBe(raw);
  expect(projectClinicalText('C009',raw,{...p,bed:0})).not.toMatch(/0 床|31 床|33 床/);
 });
 it('observation-area references do not duplicate the patient noun or omit possession',()=>{
  const p={name:'靳砚舟',bed:0};
  expect(projectClinicalText('C018','32 床患者要求今天就用进口药。',p)).toBe('留观区这位患者要求今天就用进口药。');
  expect(projectClinicalText('C020','37 床患者无反应。',p)).toBe('留观区这位患者无反应。');
  expect(projectClinicalText('C009','护士站在31床床尾。',p)).toBe('护士站在留观区这位患者的床尾。');
  expect(projectClinicalText('C018','32 床患者要求今天就用进口药。',{...p,bed:17})).toBe('17 床患者要求今天就用进口药。');
 });
 it('same-name opposite-sex variant preserves the distinct neighbor and only changes the explicitly varied sex',()=>{
  const g=getClinicalGraph('C009')!,state=initialGraphState(g,'other-sex');state.variants=['different_sex'];
  const source=g.presentation.history.find(x=>x.includes('33 床'))!;
  const text=projectClinicalText('C009',source,{name:'靳砚舟',bed:5,clinical:state});
  expect(text).toContain('男，64 岁');expect(text).toContain('另一张同名患者的床');expect(text).toContain('5 床同姓同名');expect(text).toContain('A 型 RhD 阳性');
  expect(source).toContain('女，64 岁');
 });
 it('actual C009 bedside check and observation show this identity and an explicit no-reaction observation without fabricated repeat vital values',()=>{
  const r=startRun('copy-actual-transfusion','程医生',[]),p=createPatient(r,'C009','copy-transfusion');p.name='靳砚舟';p.bed=5;
  const {s}=walk('C009','s1_indication s1_form_full s1_consent s2_wristband s3_pickup',['same_sex']);p.clinical=s;
  r.patients=[p];r.queue=[clinicalCard(r,p)!];r.cursor=0;r.phase='play';r.shiftPhase='查房';r.ap=30;
  const checked=act(r,{type:'choose',id:availableOptions(r).find(o=>o.clinicalChoice==='s4_two_person')!.id});
  expect(checked.feedback?.text).toContain('靳砚舟');expect(checked.feedback?.text).not.toContain('陈秀英');
  const owner=checked.patients[0];checked.phase='play';checked.queue=[clinicalCard(checked,owner)!];checked.cursor=0;
  const observed=act(checked,{type:'choose',id:availableOptions(checked).find(o=>o.clinicalChoice==='s5_observe')!.id});
  expect(observed.feedback?.text).toContain('未发现输血反应');expect(observed.feedback?.text).not.toMatch(/38.9℃|82\/50|本次复测.*36.5/);
  expect(observed.patients[0].clinical?.nodeId).toBe('s7');expect(observed.patients[0].damage).toBe(0);
  const record=clinicalCard(observed,observed.patients[0])!;
  expect(record.options.find(o=>o.clinicalChoice==='s7_note')!.label).toContain('有无反应');
  expect(record.options.find(o=>o.clinicalChoice==='s7_inform')!.label).not.toContain('反应原因');
 });
 it('all 20 graphs keep provenance while all node, option, check, report and outcome copy is free of author-control syntax',()=>{
  expect(clinicalGraphs).toHaveLength(20);
  for(const g of clinicalGraphs){
   expect(g.source.raw.length).toBeGreaterThan(100);
   const visible=[g.title,...g.nodes.flatMap(n=>[n.title,n.text,...(n.textVariants??[]).map(v=>v.text),...n.options.flatMap(o=>[o.label,o.result,o.hint,o.check?.purpose,o.check?.failureText,o.successText,...(o.resultVariants??[]).map(v=>v.text)])]),...g.reports.flatMap(r=>[r.title,r.full,r.skimmed]),...g.outcomes.flatMap(o=>[o.title,o.text,...(o.textVariants??[]).map(v=>v.text)])];
   for(const value of visible.filter(Boolean))expect(value,g.id).not.toMatch(script);
  }
  expect(getClinicalGraph('C011')!.nodes.find(n=>n.id==='s5')!.source.raw).toContain('epi_delayed 分支');
 });
 it('copy normalization never changes any source raw, choice, charge, effect, condition or transition',()=>{
  const mechanics=(g:typeof clinicalGraphs[number])=>({source:g.source,nodes:g.nodes.map(n=>{const {title,text,textVariants,options,...rules}=n;return {...rules,options:options.map(o=>{const {label,result,successText,resultVariants,hint,check,...mechanics}=o;return {...mechanics,check:check&&{...check,purpose:undefined,failureText:undefined}};})};}),reports:g.reports.map(({title,full,skimmed,...r})=>r),outcomes:g.outcomes.map(({text,textVariants,title,...o})=>o)});
  for(const source of clinicalGraphs){const g=structuredClone(source),before=mechanics(g);applyClinicalPlayerCopy(g);expect(mechanics(g)).toEqual(before);}
 });
 it.each([
  ['s4_epi_im',undefined,undefined],['s4_epi_sc',undefined,undefined],
  ['s4_epi_iv','186','84%'],['s4_steroid_first','84%','186'],
 ])('C011 actual %s route shows only the current monitor findings',(choice,shown,hidden)=>{
  const {s}=walk('C011',`s1_skip s2_quick_test ${choice}`),text=body('C011',s);
  expect(s.nodeId).toBe('s5');expect(text).not.toMatch(script);
  if(shown)expect(text).toContain(shown);else expect(text).not.toMatch(/186|84%/);
  if(hidden)expect(text).not.toContain(hidden);
  expect(text).not.toMatch(/70%|ICU|缺氧后果|车站/);
 });
 it.each([
  ['s4_epi_iv','s5_arrhythmia','已经处理','186'],
  ['s4_steroid_first','s5_airway','已经到床旁','恢复正常'],
 ])('C011 completed %s / %s does not replay an untreated state or invent recovery',(first,next,shown,absent)=>{
  const {s}=walk('C011',`s1_skip s2_quick_test ${first} ${next}`),text=body('C011',s);
  expect(text).toContain(shown);expect(text).not.toContain(absent);expect(text).not.toMatch(script);
 });
 it('C011 premature discharge overridden by actual hypoxic outcome does not claim the patient left',()=>{
  const {s,last}=walk('C011','s1_skip s2_quick_test s4_steroid_first s5_observe30');
  expect(s.outcomeId).toBe('o_hypoxic');expect(last!.actionText).toContain('未能离院');expect(last!.text).toContain('ICU');
 });
 it.each(['s2_wristband','s2_call_name'])('C009 %s does not reveal later reaction before observation; real reaction preserves all source vital values',sample=>{
  const {g,s}=walk('C009',`s1_indication s1_form_full s1_consent ${sample} s3_pickup s4_nurse_alone`,['same_sex']);
  expect(s.nodeId).toBe('s5');expect(body('C009',s)).toBe('输血开始。滴速 20 滴/分。');
  const observed=advanceClinicalGraph(g,s,'s5_observe');
  if(sample==='s2_call_name'){
   expect(observed.state.nodeId).toBe('s6');for(const value of ['50 mL','38.9℃','128 次/分','82/50 mmHg'])expect(body('C009',observed.state)).toContain(value);
   expect(observed.actionText).toContain('38.9℃');
  }else{expect(observed.state.nodeId).toBe('s7');expect(observed.actionText).not.toContain('38.9℃');}
 });
 it('C009 delayed discovery and correct/incorrect telephone reports are distinct',()=>{
  const base='s1_indication s1_form_full s1_consent';
  const late=walk('C009',`${base} s2_call_name s3_pickup s4_nurse_alone s5_leave`,['same_sex']);
  expect(body('C009',late.s)).toContain('将近一半');expect(late.last!.actionText).toContain('走廊喊你');
  const wrong=walk('C009',`${base} s2_call_name s3_phone_type`,['same_sex']);
  const right=walk('C009',`${base} s2_wristband s3_phone_type`,['same_sex']);
  expect(wrong.last!.actionText).toContain('A 型');expect(wrong.last!.actionText).not.toContain('O 型');
  expect(right.last!.actionText).toContain('O 型');expect(right.last!.actionText).not.toContain('A 型');
 });
 it('C006 direct and delayed measured glucose retain distinct values, unknown measurement stays unknown',()=>{
  const direct=walk('C006','s1_glucose'),delayed=walk('C006','s1_drunk s3_nurse_glucose');
  expect(body('C006',direct.s)).toContain('1.9 mmol/L');expect(body('C006',delayed.s)).toContain('1.4 mmol/L');
  const unknown=initialGraphState(direct.g,'unknown');unknown.nodeId='s2';expect(body('C006',unknown)).not.toMatch(/1\.9|1\.4/);
 });
 it('C006 actual glucose treatment shows the obtained repeat result, without executing the separately selectable infusion',()=>{
  const {g,s,last}=walk('C006','s1_glucose s2_d50');
  expect(last!.actionText).toContain('6.8 mmol/L');expect(last!.actionText).toContain('GCS 升至 14');
  expect(last!.actionText).not.toMatch(/500 mL|持续静滴|每小时测血糖/);expect(s.flags).not.toContain('infusion_started');
  expect(body('C006',s)).toContain('别告诉他们');expect(body('C006',s)).not.toContain('胰岛素');
  const untreated=walk('C006','s1_drunk');
  expect(body('C006',untreated.s)).toContain('仍没有清醒');expect(body('C006',untreated.s)).not.toMatch(/6\.8|14 分|糖尿病/);
  expect(g.nodes.find(n=>n.id==='s2')!.source.raw).toContain('10% 葡萄糖 500 mL');
 });
 it('C006 observation and consent scenes have sourced context without inferring disclosure permission',()=>{
  const {g,s}=walk('C006','s1_glucose s2_d50');s.nodeId='s4';expect(body('C006',s)).toContain('观察');
  s.nodeId='s5';expect(body('C006',s)).toContain('别告诉他们');expect(body('C006',s)).not.toContain('已经同意');
  s.flags.push('consent_disclose');expect(body('C006',s)).toContain('已经同意让一名同事');
  const unknown=initialGraphState(g,'no-disclosure');unknown.nodeId='s5';expect(body('C006',unknown)).not.toMatch(/糖尿病|已经同意|胰岛素/);
  expect(g.nodes.find(n=>n.id==='s4')!.source.raw).toContain('s4_observe');expect(g.nodes.find(n=>n.id==='s5')!.source.raw).toContain('仅在 consent_disclose');
 });
 it('C006 current engine card carries the actual post-treatment observation and leaves original queued snapshots unchanged',()=>{
  let r=startRun('glucose-feedback','程医生',[]);r.day=3;r.ap=30;r.vitals.stamina=100;
  const p=createPatient(r,'C006','glucose-feedback');p.clinical=walk('C006','s1_glucose').s;
  r.patients=[p];r.queue=[clinicalCard(r,p)!];r.cursor=0;r.phase='play';r.shiftPhase='查房';
  const o=availableOptions(r).find(o=>o.clinicalChoice==='s2_d50')!;expect(o).toBeDefined();
  r=act(r,{type:'choose',id:o.id});expect(r.feedback!.text).toContain('6.8 mmol/L');
  r.phase='play';r.queue=[clinicalCard(r,r.patients[0])!];r.cursor=0;
  const before=structuredClone(r);expect(currentCard(r)!.text).toContain('GCS 升至 14');expect(currentCard(r)!.text).toContain('别告诉他们');expect(r).toEqual(before);
 });
 it.each(['s3_mrv','s3_ctv'])('C005 actual %s report is named without inventing the other modality',id=>{
  const {s}=walk('C005',`s1_meds s2_neuro ${id}`);
  expect(body('C005',s)).toContain(id==='s3_mrv'?'MRV':'CT 静脉成像');expect(body('C005',s)).not.toContain(id==='s3_mrv'?'CT 静脉成像':'MRV');
 });
 it('prescriptions and transport orders are action results, not pre-choice scene spoilers; real doses survive',()=>{
  for(const [id,nodeId,optionId,value] of [['C001','s6','s6_transfer','胃管保持减压'],['C002','s4','s4_amox','875 mg/125 mg'],['C003','s4','s4_lysis','3,480 U']]){
   const node=getClinicalGraph(id)!.nodes.find(n=>n.id===nodeId)!;expect(node.text).not.toContain(value);expect(node.options.find(o=>o.id===optionId)!.result).toContain(value);expect(node.source.raw).toContain(value);
  }
  const g=getClinicalGraph('C002')!,s=initialGraphState(g,'prescription');s.nodeId='s4';
  expect(advanceClinicalGraph(g,s,'s4_moxi').actionText).not.toContain('肝功能');s.flags=['alcohol_known','lft_hint'];
  expect(advanceClinicalGraph(g,s,'s4_moxi').actionText).toContain('3 天后复查');
 });
 it('C017 hidden variant never supplies unperformed bedside examination findings',()=>{
  const g=getClinicalGraph('C017')!,s=initialGraphState(g,'unexamined');s.nodeId='s2';s.variants=['lung_infection'];
  expect(body('C017',s)).not.toMatch(/啰音|腹部柔软|引流液淡红/);
  const result=advanceClinicalGraph(g,s,'s2_exam');expect(result.actionText).toContain('啰音');
 });
 it('C012 missing CT or lactate cannot generate their findings; absent family and unagreed theatre stay distinct',()=>{
  const g=getClinicalGraph('C012')!,s=initialGraphState(g,'no-tests');s.nodeId='s4';
  expect(body('C012',s)).not.toContain('强化减弱');expect(body('C012',s)).not.toContain('12 分钟');
  expect(advanceClinicalGraph(g,s,'s4_argue').actionText).not.toContain('4.2');
  s.flags=['ct_done','labs_done'];expect(body('C012',s)).toContain('强化减弱');expect(advanceClinicalGraph(g,s,'s4_argue').actionText).toContain('4.2');
  s.nodeId='s5';s.variants=['son_away'];expect(body('C012',s)).toContain('仍在外地');expect(body('C012',s)).not.toContain('工牌');
  s.nodeId='s6';s.flags=[];expect(body('C012',s)).not.toContain('40 分钟');s.flags=['surgery_agreed'];expect(body('C012',s)).toContain('40 分钟');
 });
 it('C008 prospective puncture plan only appears after actual consent, never as an already performed result',()=>{
  const g=getClinicalGraph('C008')!,s=initialGraphState(g,'consent');s.nodeId='s4';
  expect(body('C008',s)).toContain('尚未取得同意');s.flags=['lp_consented'];
  expect(body('C008',s)).toContain('已同意');expect(body('C008',s)).toContain('30 分钟');expect(body('C008',s)).not.toContain('腰穿已完成');
 });
 it('refreshes an old current card using real state while preserving identities, charges, DC and unrelated options',()=>{
  const r=startRun('old-copy','程医生',[]),p=createPatient(r,'C011','copy');r.patients.push(p);
  p.clinical=walk('C011','s1_skip s2_quick_test s4_steroid_first').s;
  const card=clinicalCard(r,p)!;card.text=getClinicalGraph('C011')!.nodes.find(n=>n.id==='s5')!.source.raw;
  card.options[0].cost=987;card.options.push({id:'old-extra',label:'另一个入口',ap:0,cost:0,minutes:0,result:'',effects:{}});
  const before=JSON.stringify(card),fresh=refreshClinicalCardCopy(r,card);
  expect(fresh.text).toContain('84%');expect(fresh.text).not.toMatch(script);expect(fresh.id).toBe(card.id);expect(fresh.options[0].cost).toBe(987);expect(fresh.options.at(-1)).toEqual(card.options.at(-1));expect(JSON.stringify(card)).toBe(before);
  r.queue=[card];r.cursor=0;r.phase='roll';
  r.roll={id:'displayed-die',kind:'choice',face:7,modifier:1,dc:12,success:false,label:'已展示检定'};
  r.pendingCheck={kind:'choice',day:r.day,cardId:card.id,optionId:card.options[0].id,context:{operation:'record',actor:'patient',patientId:p.uid},rerolls:0};
  const saved=structuredClone(r);expect(currentCard(r)!.text).toContain('84%');expect(currentCard(r)!.text).not.toMatch(script);expect(r).toEqual(saved);
 });
 it('currentCard preserves actual first-contact sensory text and never mutates its stored card',()=>{
  const r=startRun('contact-copy','程医生',['T03']),p=createPatient(r,'C002','copy-contact');r.patients.push(p);
  p.clinical=initialGraphState(getClinicalGraph('C002')!,'contact-copy');
  r.queue=[clinicalCard(r,p)!];r.cursor=0;r.phase='play';r.shiftPhase='门诊';r.queue[0].shiftPhase='门诊';
  const focused=act(r,{type:'focus',id:r.queue[0].id}),contact=focused.journal.find(j=>j.id.startsWith(`contact:${p.uid}:`));
  expect(contact?.result).toBeTruthy();const stored=structuredClone(focused);
  expect(currentCard(focused)!.text).toContain(contact!.result);expect(focused).toEqual(stored);
 });
});
