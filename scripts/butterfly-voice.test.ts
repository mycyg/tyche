import {readFileSync}from 'node:fs';
import {it,expect}from 'vitest';
import {BUTTERFLY_NODES,type ButterflyId}from '../src/content/events/butterfly';
import {BUTTERFLY_CHOICE_RESULTS}from '../src/content/events/butterfly-prose';
import {butterflySceneActor,butterflyResultVoiceActor}from '../src/content/events/butterfly-cast';
import {dialogueSegments}from '../src/ui/dialogue-voice';
import {voiceKey,voiceSentences}from '../src/ui/voice-text';

it('collects each butterfly quotation in its character voice without relying on narrator fallback',()=>{
 const cues=JSON.parse(readFileSync('docs/voice-cues.json','utf8'))as {id:string;speaker:string}[];
 const keys=new Set(cues.map(c=>c.id)),missing:unknown[]=[];let spoken=0;
 for(const node of BUTTERFLY_NODES){
  const state={chain:node.id.slice(0,7)as ButterflyId,cursor:node.id,receivable:0,facts:[]};
  const actors=state.chain==='BTF-003'?['patient-male','patient-female']:[butterflySceneActor(state)??'narrator'];
  for(const actor of actors){
   const texts=[{id:node.id,text:node.text,actor},...node.options.map(o=>({id:o.id,text:BUTTERFLY_CHOICE_RESULTS[o.id],actor:butterflyResultVoiceActor(o.id,actor)}))];
   for(const text of texts)for(const part of dialogueSegments(text.text,text.actor)){
    if(part.speaker==='narrator')continue;
    for(const line of voiceSentences(part.text)){
     spoken++;if(!keys.has(voiceKey(line,part.speaker)))missing.push({source:text.id,text:line,speaker:part.speaker});
    }
   }
  }
 }
 expect(BUTTERFLY_NODES).toHaveLength(32);expect(spoken).toBe(54);expect(missing).toEqual([]);
});
