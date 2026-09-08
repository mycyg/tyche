import {it,expect} from 'vitest';
import {cpSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkCharacterVoice} from './character-voice';

function fixture(check:(directory:string)=>void){
  const root=mkdtempSync(join(tmpdir(),'tyche-character-audio-'));
  try{cpSync('public/audio/character-voice',root,{recursive:true});check(root);}
  finally{rmSync(root,{recursive:true,force:true});}
}
it('the release has exactly 39 verified reactions and no narration',()=>fixture(root=>{
  expect(checkCharacterVoice(root)).toMatchObject({characters:13,clips:39,narration:false});
  const index=JSON.parse(readFileSync(join(root,'index.json'),'utf8'));
  expect(Object.values(index).every((row:any)=>row.speaker!=='narrator'&&/^[a-f0-9]{12}$/.test(row.version))).toBe(true);
}));
it('a QA label cannot approve a transcript that does not match the line',()=>fixture(root=>{
  const file=join(root,'manifest.json'),manifest=JSON.parse(readFileSync(file,'utf8'));
  manifest['reaction-hero-1'].asr.transcript='这是别人的录音';writeFileSync(file,JSON.stringify(manifest));
  expect(()=>checkCharacterVoice(root)).toThrow('Unverified character voice');
}));
it('a replaced audio file must pass its own hash check',()=>fixture(root=>{
  writeFileSync(join(root,'reaction-hero-1.mp3'),'replaced recording');
  expect(()=>checkCharacterVoice(root)).toThrow('checksum-mismatch');
}));
