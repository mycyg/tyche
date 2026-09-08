import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CHARACTER_VOICE_CUES,CHARACTER_VOICES} from '../src/shared/character-voices';
import {playbackIndex} from './finalize-voice';

export function checkCharacterVoice(directory='public/audio/character-voice'){
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  const {index,report}=playbackIndex(CHARACTER_VOICE_CUES,manifest,directory);
  if(!report.complete)throw new Error(`Incomplete character voice pack: ${JSON.stringify(report.rejected)}`);
  if(report.orphanedManifestEntries)throw new Error('Unexpected entries in character voice pack');
  for(const cue of CHARACTER_VOICE_CUES){
    const clip=manifest[cue.id];
    const normalized=(text:string)=>text.replace(/[^\p{L}\p{N}]/gu,'');
    if(clip.qa!=='asr-matched'||clip.renderer!=='qwen-voice-design-and-clone-cuda'||typeof clip.gpu!=='string'||!clip.gpu.includes('3090')
      ||typeof clip.sha256!=='string'||!/^[a-f0-9]{64}$/.test(clip.sha256)||clip.text!==cue.text
      ||typeof clip.asr?.transcript!=='string'||normalized(clip.asr.transcript)!==normalized(cue.text))throw new Error(`Unverified character voice: ${cue.id}`);
    if(!Number.isFinite(clip.seconds)||clip.seconds<.25||clip.seconds>8)throw new Error(`Invalid reaction length: ${cue.id}`);
  }
  const file=path.join(directory,'index.json');fs.writeFileSync(file,JSON.stringify(index)+'\n');
  return {characters:Object.keys(CHARACTER_VOICES).length,clips:Object.keys(index).length,narration:false,bytes:report.bytes,seconds:Math.round(report.seconds*1000)/1000};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--collect')){
    fs.mkdirSync('output/character-voice',{recursive:true});
    fs.writeFileSync('output/character-voice/cast.json',JSON.stringify(CHARACTER_VOICES,null,2)+'\n');
    fs.writeFileSync('output/character-voice/cues.json',JSON.stringify(CHARACTER_VOICE_CUES,null,2)+'\n');
    console.log(JSON.stringify({characters:Object.keys(CHARACTER_VOICES).length,cues:CHARACTER_VOICE_CUES.length}));
  }else console.log(JSON.stringify(checkCharacterVoice(),null,2));
}
