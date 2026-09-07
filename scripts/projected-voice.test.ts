import fs from 'node:fs';
import {expect,it} from 'vitest';
import {clinicalGraphs} from "../src/content/clinical/index";
import {projectClinicalText} from "../src/content/clinical/player-copy";
import {startRun} from "../src/game/engine";
import {createPatient,patientCase} from "../src/game/cards";
import {clinicalVoiceActor} from "../src/ui/clinical-voice";
import {dialogueSegments} from "../src/ui/dialogue-voice";
import {createVoicePlanner} from "../src/ui/voice-plan";
import {voiceKey,voiceSentences} from "../src/ui/voice-text";
it('collects complete clinical dialogue and report text across allocated and observation beds',()=>{
const cues=JSON.parse(fs.readFileSync('docs/voice-cues.json','utf8')) as {id:string;displayText:string;speaker:string}[];
const catalog=Object.fromEntries(cues.map(c=>[c.id,{file:c.id+'.mp3',text:c.displayText,speaker:c.speaker}]));
const plan=createVoicePlanner(catalog),run=startRun('voice-projected-audit','程医生',[]);
const missing=new Map<string,unknown>(),seen=new Set();let utterances=0,segments=0,composed=0;
for(const graph of clinicalGraphs){
 const primary=createPatient(run,graph.id,'voice-check');
 for(const bed of [0,17,72]){
  const patient={...primary,bed};
  const actor=clinicalVoiceActor(graph.id,patientCase(patient).sex);
  const test=(source:string,text:string,speaker='narrator',dialogue=false)=>{
   if(!text)return;
   const projected=projectClinicalText(graph.id,text,patient);utterances++;
   for(const segment of dialogue?dialogueSegments(projected,speaker):[{text:projected,speaker}]){
    for(const line of voiceSentences(segment.text)){
     const key=voiceKey(line,segment.speaker);if(seen.has(key))continue;seen.add(key);segments++;
     if(catalog[key]||catalog[voiceKey(line)])continue;
     if(plan(line,segment.speaker)){composed++;continue;}
     if(!missing.has(key))missing.set(key,{source,bed,text:line,speaker:segment.speaker});
    }
   }
  };
  test(graph.id,graph.presentation.complaint);test(graph.id,graph.presentation.vitals);test(graph.id,graph.presentation.appearance);
  graph.presentation.history.forEach(t=>test(graph.id,t));
  for(const node of graph.nodes){
   test(graph.id+':'+node.id,node.text,actor,true);
   for(const v of node.textVariants??[])test(graph.id+':'+node.id,v.text,actor,true);
   for(const o of node.options){
    test(graph.id+':'+o.id,o.label,'hero');
    const speaker=clinicalVoiceActor(graph.id,patientCase(patient).sex,o.id);
    for(const t of [o.result,o.successText,o.check?.failureText,...(o.resultVariants??[]).map(v=>v.text)])if(t)test(graph.id+':'+o.id,t,speaker,true);
   }
  }
  for(const report of graph.reports)for(const t of [report.title,report.full,report.skimmed])test(graph.id+':'+report.id,t);
  for(const outcome of graph.outcomes)for(const t of [outcome.text,...(outcome.textVariants??[]).map(v=>v.text)])test(graph.id+':'+outcome.id,t);
 }
}
// Fixture projections verify the speech corpus, not campaign reachability or listening.
expect([...missing.values()]).toEqual([]);
expect(utterances).toBeGreaterThan(6000);expect(segments).toBeGreaterThan(2700);expect(composed).toBeGreaterThan(0);
});
