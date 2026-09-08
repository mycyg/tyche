import {expect,it} from 'vitest';
import {clinicalGraphs} from '../src/content/clinical';
import {projectClinicalText} from '../src/content/clinical/player-copy';
import {startRun} from '../src/game/engine';
import {createPatient,patientCase} from '../src/game/cards';
import {clinicalVoiceActor} from '../src/ui/clinical-voice';
import {characterSpeaker} from '../src/ui/character-voice';
import {CHARACTER_VOICE_CUES} from '../src/shared/character-voices';

it('projected clinical conversations resolve to a fixed role while plain chart narration stays silent',()=>{
 const run=startRun('voice-projected-audit','程医生',[]);let scenes=0,silent=0;
 for(const graph of clinicalGraphs){
  const primary=createPatient(run,graph.id,'voice-check');
  for(const bed of [0,17,72]){
   const patient={...primary,bed},actor=clinicalVoiceActor(graph.id,patientCase(patient).sex);
   const check=(text:string,speaker:string)=>{
    const selected=characterSpeaker(projectClinicalText(graph.id,text,patient),speaker);
    if(selected)expect(CHARACTER_VOICE_CUES.filter(c=>c.speaker===selected)).toHaveLength(3);
    else silent++;
    scenes++;
   };
   for(const node of graph.nodes){
    check(node.text,actor);for(const v of node.textVariants??[])check(v.text,actor);
    for(const o of node.options)for(const text of [o.result,o.successText,o.check?.failureText,...(o.resultVariants??[]).map(v=>v.text)])if(text)check(text,clinicalVoiceActor(graph.id,patientCase(patient).sex,o.id));
   }
   for(const report of graph.reports)for(const text of [report.title,report.full,report.skimmed])check(text,'narrator');
  }
 }
 expect(characterSpeaker('本次未发生抢救。病历已归档。','narrator')).toBeUndefined();
 expect(scenes).toBeGreaterThan(3000);expect(silent).toBeGreaterThan(1000);
});
