import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {afterEach,describe,expect,it} from 'vitest';
import {finalizeVoice,playbackIndex,sha256,type VoiceCue} from './finalize-voice';
const temps:string[]=[];
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tyche-voice-index-'));temps.push(root);const cue:VoiceCue={id:'v-test',text:'血压一百二十。',displayText:'血压 120。',speaker:'narrator'};const audio=Buffer.from('fixture-audio');fs.writeFileSync(path.join(root,'v-test.mp3'),audio);const row={file:'v-test.mp3',textSha256:sha256(cue.text),sha256:sha256(audio),speaker:'narrator',seconds:2,sourcePeak:.7,model:'test',spokenText:cue.text};return {root,cue,row};}
afterEach(()=>{for(const root of temps.splice(0))fs.rmSync(root,{recursive:true,force:true});});
describe('lightweight current-text playback index',()=>{
 it('projects playback fields and a cache version, without QA/model/raw text fields',()=>{
  const {root,cue,row}=fixture();const result=playbackIndex([cue],{[cue.id]:row},root);
  expect(result.index).toEqual({'v-test':{file:'v-test.mp3',text:'血压 120。',speaker:'narrator',version:row.sha256.slice(0,12)}});expect(result.report).toMatchObject({covered:1,missing:0,complete:true,seconds:2});
 });
 it.each(['stale','speaker','missing','empty','checksum','path'] as const)('excludes %s material and never counts fallback as offline coverage',kind=>{
  const {root,cue,row}=fixture();
  if(kind==='stale')row.textSha256=sha256('旧文本');if(kind==='speaker')row.speaker='hero';
  if(kind==='missing')fs.unlinkSync(path.join(root,row.file));if(kind==='empty')fs.writeFileSync(path.join(root,row.file),'');
  if(kind==='checksum')fs.writeFileSync(path.join(root,row.file),'in-progress replacement');if(kind==='path')row.file='../v-test.mp3';
  const result=playbackIndex([cue],{[cue.id]:row},root);expect(result.index).toEqual({});expect(result.report).toMatchObject({covered:0,missing:1,complete:false,estimatedFinalVoiceBytes:null});
 });
 it('does not publish removed cues and never deletes their materials or QA entries',()=>{
  const {root,cue,row}=fixture();const manifest={[cue.id]:row};const before=JSON.stringify(manifest);
  const result=playbackIndex([],manifest,root);expect(result.index).toEqual({});expect(result.report.orphanedManifestEntries).toBe(1);
  expect(fs.existsSync(path.join(root,row.file))).toBe(true);expect(JSON.stringify(manifest)).toBe(before);
 });
 it('rejects escaping symlinks and duplicate ids',()=>{
  const {root,cue,row}=fixture(),other=fixture();fs.unlinkSync(path.join(root,row.file));fs.symlinkSync(path.join(other.root,row.file),path.join(root,row.file));
  expect(playbackIndex([cue],{[cue.id]:row},root).report.rejected[0].reason).toBe('invalid-file');
  expect(()=>playbackIndex([cue,cue],{},root)).toThrow('Duplicate');
 });
 it('atomically replaces a stale index and is repeatable while preserving the full manifest',()=>{
  const {root,cue,row}=fixture();const cues=path.join(root,'cues.json'),report=path.join(root,'report.json'),manifest=path.join(root,'manifest.json');
  fs.writeFileSync(cues,JSON.stringify([cue]));fs.writeFileSync(manifest,JSON.stringify({[cue.id]:row}));const before=fs.readFileSync(manifest,'utf8');
  finalizeVoice(cues,root,report);const first=fs.readFileSync(path.join(root,'index.json'),'utf8');finalizeVoice(cues,root,report);expect(fs.readFileSync(path.join(root,'index.json'),'utf8')).toBe(first);
  fs.writeFileSync(cues,JSON.stringify([{...cue,text:'新发音。'}]));finalizeVoice(cues,root,report);
  expect(JSON.parse(fs.readFileSync(path.join(root,'index.json'),'utf8'))).toEqual({});expect(fs.readFileSync(manifest,'utf8')).toBe(before);expect(fs.existsSync(path.join(root,row.file))).toBe(true);
 });
});
