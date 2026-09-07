import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { clinicalGraphs } from '../src/content/clinical';
import { projectClinicalText } from '../src/content/clinical/player-copy';
import {CLINICAL_PATIENTS} from '../src/content/clinical/patient-identities';
import { AUTHORED_EVENTS, BUTTERFLY_NODES } from '../src/content/events';
import { CASE_PRESETS, PATIENT_ENTITIES, compatibleEntities, instantiatePreset } from '../src/content/patients';
import { STORIES } from '../src/game/stories';
import { TALENTS, DEBUFFS } from '../src/game/catalog';
import { HANDBOOK } from '../src/ui/handbook';
import { eventToCard, EVENT_BY_ID } from '../src/content/events/catalog';
import { ENDING_PROSE } from '../src/content/events/ending-prose';
import { STORY_ENDINGS, STORY_ENDING_IDS } from '../src/content/story/endings';
import { SUPPORT_PARAGRAPHS } from '../src/content/story/support-card';
import { EVENT_DEFERRED_RESULTS, EVENT_FAILURES, EVENT_RESULTS } from '../src/content/events/narrative';
import { RECORD_ONLY_EVENT_FACTS } from '../src/content/events/fact-records';
import { BUTTERFLY_CHOICE_RESULTS,BUTTERFLY_MERGE_RESULTS } from '../src/content/events/butterfly-prose';
import {reportReviewLines}from '../src/content/clinical/report-reading';
import { RECONTACT_PROSE,makeRepresentativeRecontact } from '../src/content/events/representative-recontact';
import {buildTribunalPreparation}from '../src/content/events/court-preparation';
import { TROLLEY_DEFINITIONS,makeTrolleyCard,trolleyEchoCard } from '../src/content/events/trolley';
import {billingEpisodeSummaries,createClaimedReadmission} from '../src/content/events/billing-episodes';
import {startRun}from '../src/game/engine';
import {createPatient,patientNamePool}from '../src/game/cards';
import {authoredPatientReports}from '../src/content/events/critical-values';
import {priorShiftHandover}from '../src/ui/record-notes';
import { archiveEntries, archiveEntryNarration,ARCHIVE_PATIENT_SCOPE } from '../src/ui/archive-data';
import { emptySave } from '../src/game/storage';
import { voiceKey, voiceSentences, voiceText, pronounce, hasSpokenContent } from '../src/ui/voice-text';
import {dialogueSegments}from '../src/ui/dialogue-voice';
import {clinicalVoiceActor}from '../src/ui/clinical-voice';
import {visibleSourceText}from './voice-source';
import {peerReferralEntry}from '../src/game/peer-referrals';
import {peerExamObservationCard}from '../src/content/events/peer-exam-observation';
import {glucoseTranscriptionCard}from '../src/content/events/glucose-transcription';
import {familyFundingContactCard}from '../src/content/events/family-funding-contact';
import {RECORDING_PROSE}from '../src/content/events/recording-origins';
import {PATIENT_REVIEW_RECEIPT}from '../src/content/events/patient-review';
import {butterflySceneActor,butterflyResultVoiceActor}from '../src/content/events/butterfly-cast';
import type {ButterflyId}from '../src/content/events/butterfly';

interface Line {id:string;text:string;displayText:string;speaker:string;sources:string[]}
const lines=new Map<string,Line>();
function add(text:unknown,source:string,speaker='narrator') {
  if(!hasSpokenContent(text))return;
  const normalized=voiceText(text);
  if(!normalized)return;
  for(const sentence of voiceSentences(text)) {
    const id=voiceKey(sentence,speaker),old=lines.get(id);
    if(old&&old.displayText!==sentence)throw new Error(`Voice key collision ${id}`);
    if(old){if(!old.sources.includes(source))old.sources.push(source);}
    else lines.set(id,{id,text:pronounce(sentence),displayText:sentence,speaker,sources:[source]});
  }
}
function dialogue(text:string,source:string,actor='narrator'){
  add(text,source); // A chart or archive reads the complete passage as narration.
  for(const part of dialogueSegments(text,actor))add(part.text,source,part.speaker);
}
function scene(scene:{id:string;title:string;text:string;options:{id:string;label:string;result:string;check?:{failureText:string;purpose?:string;failureHint?:string};hint?:string}[]},speaker='narrator',resultActor=(_id:string)=>speaker) {
  add(scene.title,scene.id);dialogue(scene.text,scene.id,speaker);
  for(const option of scene.options){add(option.label,option.id,'hero');dialogue(option.result,option.id,resultActor(option.id));add(option.hint,option.id);if(option.check){dialogue(option.check.failureText,option.id,resultActor(option.id));add(option.check.purpose,option.id);add(option.check.failureHint,option.id);}}
}
for(const [key,text]of Object.entries(RECORDING_PROSE))dialogue(text,`recording-materials:${key}`,key==='reserve'?'hero':'narrator');
for(const choice of ['BTF-003:N05a','BTF-003:N05b'])add(BUTTERFLY_CHOICE_RESULTS[choice]+PATIENT_REVIEW_RECEIPT,`${choice}:shared-patient-review`);
for(const graph of clinicalGraphs){
  const sex=CLINICAL_PATIENTS.find(p=>p.caseId===graph.id)!.sex;
  const actor=clinicalVoiceActor(graph.id,sex),resultActor=(id:string)=>clinicalVoiceActor(graph.id,sex,id);
  add(graph.title,graph.id);add(graph.presentation.complaint,graph.id);
  for(const text of [...graph.presentation.history,graph.presentation.vitals,graph.presentation.appearance])add(text,graph.id);
  for(const node of graph.nodes){scene(node,actor,resultActor);for(const v of node.textVariants??[])dialogue(v.text,node.id,actor);for(const option of node.options){dialogue(option.successText??'',option.id,resultActor(option.id));for(const v of option.resultVariants??[])dialogue(v.text,option.id,resultActor(option.id));}}
  for(const report of graph.reports){add(report.title,report.id);add(report.full,report.id);add(report.skimmed,report.id);for(const line of reportReviewLines(report.full,report.skimmed))add(line,report.id);}
  for(const ending of graph.outcomes){add(ending.title,`${graph.id}:${ending.id}`);add(ending.text,`${graph.id}:${ending.id}`);for(const v of ending.textVariants??[])add(v.text,ending.id);}
  for(const environment of graph.environment)add(environment.text,graph.id);
}
for(const event of AUTHORED_EVENTS){
  // Use the same display projection as play. Raw labels retained for source
  // auditing are not a substitute for the current spoken player choice.
  const card=eventToCard(event,{scope:{kind:event.scopeKind,id:'voice'},instanceId:`voice:${event.id}`,
    ...(event.scopeKind==='patient'?{patientId:'voice'}:{}),day:1,phase:event.phases[0]??'查房'});
  scene(card,card.actor??'narrator');
  for(const option of card.options)for(const d of [...option.deferred,...option.failureDeferred??[]]){add(d.description,option.id);add(d.otherwiseDescription,option.id);}
}
for(const story of STORIES){scene(story,story.actor);for(const v of story.variants??[])dialogue(v.text,story.id,story.actor);}
for(const node of BUTTERFLY_NODES){
 const chain={chain:node.id.slice(0,7)as ButterflyId,cursor:node.id,receivable:0,facts:[]};
 const actors=node.id.startsWith('BTF-003:')?['patient-male','patient-female']:[butterflySceneActor(chain)??'narrator'];
 for(const actor of actors)scene({...node,options:node.options.map(o=>({...o,result:BUTTERFLY_CHOICE_RESULTS[o.id]}))},actor,id=>butterflyResultVoiceActor(id,actor)??'narrator');
}
for(const preset of CASE_PRESETS){
  for(const s of preset.scenes)scene(s);
  // All compatible opening sentences and concealed-fact additions, not one sample patient.
  for(const entity of compatibleEntities(preset)){
    const instance=instantiatePreset(preset,entity,`voice-${entity.id}`);
    for(const s of instance.steps){dialogue(s.text,`${preset.id}:${entity.id}`,entity.sex==='男'?'patient-male':'patient-female');for(const o of s.options)dialogue(o.result,`${o.id}:${entity.id}`,entity.sex==='男'?'patient-male':'patient-female');}
  }
}
for(const p of PATIENT_ENTITIES){add(p.name,p.id);dialogue(p.dialogue,p.id,p.sex==='男'?'patient-male':'patient-female');add(p.concealedFact,p.id);}
for(const t of TALENTS){add(t.name,t.id);add(t.benefit,t.id);add(t.price,t.id);}
for(const d of DEBUFFS){add(d.name,d.id);add(d.text,d.id);}
for(const chapter of HANDBOOK){add(chapter.title,chapter.id);for(const text of chapter.paragraphs)add(text,chapter.id);}
// Dynamic numeric values use spoken Chinese atoms, not thousands of duplicate
// full recordings. Longer authored sentences remain the primary playback path.
for(const text of '零一二三四五六七八九十百千万亿点元'.split(''))add(text,'numeric-voice');
for(const [id,prose] of Object.entries(ENDING_PROSE))for(const text of prose)add(text,id);
// Story endings and the support card are narrated as a single narrator passage in the ending page.
for(const id of STORY_ENDING_IDS){const story=STORY_ENDINGS[id];add(story.title,id);add(story.author,id);for(const paragraph of story.paragraphs)add(paragraph,id);}
for(const paragraph of SUPPORT_PARAGRAPHS)add(paragraph,'support-card');
for(const collection of [EVENT_DEFERRED_RESULTS,EVENT_FAILURES,RECORD_ONLY_EVENT_FACTS])for(const [id,text] of Object.entries(collection))add(text,id);
for(const collection of [BUTTERFLY_CHOICE_RESULTS,BUTTERFLY_MERGE_RESULTS])for(const [id,text] of Object.entries(collection))add(text,id);
for(const text of RECONTACT_PROSE.titles)add(text,'REP-RECONTACT');
for(const text of RECONTACT_PROSE.texts)dialogue(text,'REP-RECONTACT','rep');
for(const [id,prose] of Object.entries(EVENT_RESULTS))for(const text of prose)dialogue(text,id);
for(const d of TROLLEY_DEFINITIONS){add(d.title,d.id);add(d.echo,d.id);}
// Render representative live templates, in addition to their lexical pieces.
// These are voice fixtures, not evidence of player-unlocked events or endings.
const voiceRun=startRun('voice-template-fixture','程医生',[]);
scene(familyFundingContactCard(voiceRun,'voice-family-bill'));
for(const mode of ['full','brief']as const){
  const patient=createPatient(voiceRun,'C-001',`quick-voice-peer-${mode}`);
  peerReferralEntry(patient,mode);scene(patient.preset!.steps[0]);
}
for(let stage=0;stage<=5;stage++)scene(makeRepresentativeRecontact(voiceRun,stage,'voice-refusal',10),'rep');
for(const card of buildTribunalPreparation({...voiceRun,day:15}))scene(card,card.actor??'narrator');
for(const identity of CLINICAL_PATIENTS)add(identity.name,identity.id);
for(const name of [...patientNamePool('男'),...patientNamePool('女')])add(name,'patient-name-pool');
// The source has fixed original bed numbers and names. Record the first named
// role, plus composable surrounding fragments for other allocated beds/names.
// Never narrate the placeholder itself or manufacture a second patient's bed.
for(const graph of clinicalGraphs){
  const patient=createPatient(voiceRun,graph.id,'voice-projection');patient.bed=5;
  const texts=[graph.presentation.complaint,...graph.presentation.history,graph.presentation.vitals,graph.presentation.appearance,
    ...graph.nodes.flatMap(n=>[n.text,...(n.textVariants??[]).map(v=>v.text),...n.options.flatMap(o=>[o.label,o.result,o.successText??'',o.check?.failureText??'',...(o.resultVariants??[]).map(v=>v.text)])]),
    ...graph.reports.flatMap(r=>[r.title,r.full,r.skimmed]),...graph.outcomes.flatMap(o=>[o.text,...(o.textVariants??[]).map(v=>v.text)])];
  const roles=graph.id==='C009'&&patient.clinical
    ? [patient,{...patient,clinical:{...patient.clinical,variants:['different_sex']}}] : [patient];
  for(const role of roles)for(const text of texts){
    add(projectClinicalText(graph.id,text,role),`${graph.id}:patient-copy`);
    add(projectClinicalText(graph.id,text,{...role,bed:0}),`${graph.id}:observation-copy`);
    const template=projectClinicalText(graph.id,text,{...role,bed:987654,name:'__ROLE_NAME__'});
    if(template.includes('987654')||template.includes('__ROLE_NAME__'))for(const fragment of template.split(/987654|__ROLE_NAME__/))add(fragment,`${graph.id}:patient-copy-fragment`);
  }
}
const voicePatients=[createPatient(voiceRun,'C013','voice-a'),createPatient(voiceRun,'C020','voice-b')];
for(const stage of ['report','write']as const)for(let day=2;day<=13;day++){
 const card=glucoseTranscriptionCard(voiceRun,voicePatients[0],stage,day);scene(card,stage==='report'?'nurse':'narrator',()=> 'narrator');
 const template=glucoseTranscriptionCard(voiceRun,{...voicePatients[0],name:'__ROLE_NAME__'},stage,day);
 for(const text of [template.text,...template.options.map(o=>o.result)])for(const fragment of text.split('__ROLE_NAME__'))dialogue(fragment,'glucose-transcription:dynamic',text===template.text&&stage==='report'?'nurse':'narrator');
}
for(const stage of ['meeting','record']as const)for(let day=3;day<=12;day++){
 const p={...voicePatients[0],name:'__ROLE_NAME__'};
 const card=peerExamObservationCard(voiceRun,p,stage,day);scene({...card,text:card.text.replace('__ROLE_NAME__',voicePatients[0].name)},'peer');
 for(const fragment of card.text.split('__ROLE_NAME__'))dialogue(fragment,'peer-exam:dynamic','peer');
}
voiceRun.patients=voicePatients;voicePatients.forEach(p=>{p.active=p.inpatient=true;});
for(const d of TROLLEY_DEFINITIONS){
  voiceRun.shiftPhase=d.phases[0];
  const card=makeTrolleyCard(d,voiceRun,voicePatients);scene(card,card.actor??'narrator');
  for(const stage of [2,3] as const)for(const response of [undefined,'review']){
    const echo=trolleyEchoCard(voiceRun,{id:card.trolley.tokenId,sourceId:d.id,choice:'a',day:1,due:2,stage,scope:card.scope,patientIds:card.trolley.patientIds,actor:d.actor,object:d.object,resolved:false,response});
    scene(echo);
  }
}
for(const fee of [2000,4000,8000])scene(eventToCard(EVENT_BY_ID['E-100'],{scope:{kind:'personal',id:'voice'},instanceId:'voice-icu',day:6,phase:'结算'},
  {day:6,phase:'结算',facts:{'family-icu-daily-fee':fee}}),'mother');
for(const amount of [0,600,3000,8000])scene(eventToCard(EVENT_BY_ID['E-171'],{scope:{kind:'patient',id:voicePatients[0].uid},patientId:voicePatients[0].uid,patientName:voicePatients[0].name,instanceId:'voice-excess',day:6,phase:'结算'},
  {day:6,phase:'结算',facts:{'patient-budget-excess':amount}}));
const billed=voicePatients[0];billed.spent=8000;billed.budget=billed.initialBudget=5000;billed.charged=3000;
voiceRun.authored!.billingEpisodes=[createClaimedReadmission(voiceRun,billed,'voice:E-171-c')!];
for(const spent of [8000,8600,13000,13600]){billed.spent=spent;for(const row of billingEpisodeSummaries(voiceRun,billed)){add(row.title,'billing-episode');add(row.text,'billing-episode');}}
for(const uid of ['D1-C-067-census0','D2-C-001-handover0'])add(priorShiftHandover({uid}),'previous-shift');
const criticalPatient=voicePatients[0];
voiceRun.journal.push({id:'voice:E-046:critical-report',day:2,title:'检验科危急值通知',choice:'接收检验科电话报告',
  result:`检验科本次电话报告：${criticalPatient.name}，${criticalPatient.bed}床，血钾 6.8 mmol/L。报告于第2天交班收到，处置尚待记录。`,
  scope:{kind:'patient',id:criticalPatient.uid},flags:[`critical-potassium-received:${criticalPatient.uid}`]});
for(const report of authoredPatientReports(voiceRun,criticalPatient)){add(report.title,'critical-value-report');add(report.full,'critical-value-report');}
const fullMeta={...emptySave().meta,entities:PATIENT_ENTITIES.map(p=>p.id),clinicalPatients:CLINICAL_PATIENTS.map(p=>p.id),cases:[...clinicalGraphs,...CASE_PRESETS].map(c=>c.id),usedTalents:TALENTS.map(t=>t.id),debuffs:DEBUFFS.map(d=>d.id)};
for(const entry of archiveEntries(fullMeta))add(archiveEntryNarration(entry),entry.key);
add(ARCHIVE_PATIENT_SCOPE,'patient-collection');

const sourceOnlyFiles=new Set(['storage.ts','WebMCP.ts','catalog.ts','types.ts','host-audit.ts','route-audit.ts','dialogue-voice.ts']);
for(const directory of ['src/ui','src/game','src/world','src/content/events'])for(const file of fs.readdirSync(directory)){
  if(!/\.tsx?$/.test(file)||/\.test\./.test(file)||sourceOnlyFiles.has(file))continue;
  const name=path.join(directory,file),code=fs.readFileSync(name,'utf8');
  for(const line of visibleSourceText(code,name)){
    if(line.actor)add(line.text,name,line.actor);else dialogue(line.text,name);
  }
}
const output=process.argv[2]??'docs/voice-cues.json';
const sorted=[...lines.values()].sort((a,b)=>a.speaker.localeCompare(b.speaker)||a.text.length-b.text.length||a.id.localeCompare(b.id));
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(sorted,null,2)+'\n');
const manifestFile='public/audio/voice/manifest.json';
const rendered=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):{};
const missing=sorted.filter(line=>!rendered[line.id]||rendered[line.id].textSha256!==createHash('sha256').update(line.text).digest('hex')||!fs.existsSync(path.join('public/audio/voice',rendered[line.id].file)));
console.log(JSON.stringify({cues:sorted.length,characters:sorted.reduce((n,line)=>n+line.text.length,0),rendered:sorted.length-missing.length,missing:missing.length,bySpeaker:Object.fromEntries([...new Set(sorted.map(line=>line.speaker))].map(speaker=>[speaker,sorted.filter(line=>line.speaker===speaker).length]))},null,2));
