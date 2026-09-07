import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export type VoiceCue={id:string;text:string;displayText?:string;speaker:string};
export type PlaybackAsset={file:string;text:string;speaker:string;version?:string};
type ManifestRow={file?:unknown;textSha256?:unknown;speaker?:unknown;sha256?:unknown;seconds?:unknown};
export const sha256=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
/** Reads one atomic manifest snapshot. Concurrent production can only leave a
 * new file out of this index; it cannot make an obsolete text count as covered. */
export function playbackIndex(cues:VoiceCue[],manifest:Record<string,ManifestRow>,directory:string){
 const index:Record<string,PlaybackAsset>={};
 const rejected:{id:string;reason:'missing-manifest'|'stale-text'|'speaker-mismatch'|'invalid-file'|'missing-file'|'checksum-mismatch'}[]=[];
 let bytes=0,seconds=0,coveredCharacters=0;
 const cueIds=new Set<string>(),root=fs.realpathSync(directory);
 for(const cue of cues){
  if(!/^[a-zA-Z0-9-]{1,96}$/.test(cue.id)||typeof cue.text!=='string'||!cue.text||typeof cue.speaker!=='string'||!cue.speaker||(cue.displayText!==undefined&&typeof cue.displayText!=='string'))throw new Error(`Invalid voice cue: ${cue.id}`);
  if(cueIds.has(cue.id))throw new Error(`Duplicate voice cue: ${cue.id}`);cueIds.add(cue.id);
  const row=manifest[cue.id];let reason:typeof rejected[number]['reason']|undefined;
  if(!row||typeof row!=='object')reason='missing-manifest';
  else if(row.textSha256!==sha256(cue.text))reason='stale-text';
  else if(row.speaker!==cue.speaker)reason='speaker-mismatch';
  else if(row.file!==`${cue.id}.mp3`)reason='invalid-file';
  else {
   const file=path.join(root,row.file);
   try {
    const stat=fs.statSync(file),real=fs.realpathSync(file);
    if(!stat.isFile()||stat.size===0||path.dirname(real)!==root)reason='invalid-file';
    else {
     // The renderer may be replacing this same id after a pronunciation edit.
     // Its prior manifest must not index an in-progress or different MP3.
     if(typeof row.sha256==='string'&&sha256(fs.readFileSync(file))!==row.sha256)reason='checksum-mismatch';
     else {bytes+=stat.size;coveredCharacters+=cue.text.length;if(typeof row.seconds==='number'&&Number.isFinite(row.seconds)&&row.seconds>0)seconds+=row.seconds;}
    }
   }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;reason='missing-file';}
  }
  if(reason){rejected.push({id:cue.id,reason});continue;}
  index[cue.id]={file:row.file as string,text:cue.displayText??cue.text,speaker:cue.speaker,
   ...(typeof row.sha256==='string'?{version:row.sha256.slice(0,12)}:{})};
 }
 const totalCharacters=cues.reduce((n,c)=>n+c.text.length,0);
 return {index,report:{cues:cues.length,covered:Object.keys(index).length,missing:rejected.length,complete:rejected.length===0,
  rejected,orphanedManifestEntries:Object.keys(manifest).filter(id=>!cueIds.has(id)).length,
  bytes,seconds,coveredCharacters,totalCharacters,
  // Cue extraction sorts by length. A per-file average would underestimate
  // the unfinished long passages; extrapolate by spoken characters instead.
  estimatedFinalVoiceBytes:coveredCharacters?Math.ceil(bytes*totalCharacters/coveredCharacters):null,
  estimateMethod:'current matching MP3 bytes per spoken character; estimate, not completed output'}};
}

function atomicJSON(file:string,value:unknown){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const temporary=`${file}.${process.pid}.partial`;
 fs.writeFileSync(temporary,JSON.stringify(value)+'\n');fs.renameSync(temporary,file);
}
export function finalizeVoice(cuesFile='docs/voice-cues.json',directory='public/audio/voice',reportFile='docs/audio-build-report.json'){
 const cueSnapshot=fs.readFileSync(cuesFile,'utf8'),manifestSnapshot=fs.readFileSync(path.join(directory,'manifest.json'),'utf8');
 const cues=JSON.parse(cueSnapshot) as VoiceCue[];
 const manifest=JSON.parse(manifestSnapshot) as Record<string,ManifestRow>;
 if(!Array.isArray(cues)||!manifest||Array.isArray(manifest)||typeof manifest!=='object')throw new Error('Invalid voice input structure');
 const result=playbackIndex(cues,manifest,directory);
 atomicJSON(path.join(directory,'index.json'),result.index);
 const report={...result.report,indexBytes:Buffer.byteLength(JSON.stringify(result.index)+'\n'),manifestBytes:Buffer.byteLength(manifestSnapshot),
  cueSnapshotSha256:sha256(cueSnapshot),manifestSnapshotSha256:sha256(manifestSnapshot),
  projectedCompleteIndexBytes:Buffer.byteLength(JSON.stringify(Object.fromEntries(cues.map(c=>[c.id,result.index[c.id]??{file:`${c.id}.mp3`,text:c.displayText??c.text,speaker:c.speaker,version:'000000000000'}])))) +1};
 atomicJSON(reportFile,report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),requireComplete=args.includes('--require-complete'),positional=args.filter(a=>a!=='--require-complete');
 const report=finalizeVoice(positional[0],positional[1],positional[2]);
 const {rejected,...summary}=report;console.log(JSON.stringify({...summary,rejectionCounts:Object.fromEntries([...new Set(rejected.map(r=>r.reason))].map(reason=>[reason,rejected.filter(r=>r.reason===reason).length]))},null,2));
 if(requireComplete&&!report.complete)process.exitCode=1;
}
