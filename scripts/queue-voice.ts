import {readFileSync,writeFileSync,existsSync,mkdirSync}from 'node:fs';
import {join}from 'node:path';
import {createHash}from 'node:crypto';

interface Cue{id:string;text:string;speaker:string;sources:string[]}
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const cues=JSON.parse(readFileSync('docs/voice-cues.json','utf8'))as Cue[];
const root='public/audio/voice';
const manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
const args=process.argv.slice(2),after=args.indexOf('--after');
const inFlight=new Map<string,Cue>(after<0?[]:(JSON.parse(readFileSync(args[after+1],'utf8'))as Cue[]).map(row=>[row.id,row]));
const pending=cues.filter(row=>{
 const scheduled=inFlight.get(row.id);
 if(scheduled?.text===row.text&&scheduled.speaker===row.speaker)return false;
 const previous=manifest[row.id];
 return !previous||previous.textSha256!==sha(row.text)||previous.speaker!==row.speaker||!existsSync(join(root,previous.file));
});
// Record revised dialogue first. Similar lengths share a CUDA batch to reduce padding.
const priority=(row:Cue)=>row.speaker!=='narrator'?0:row.sources.some(s=>/E-\d|BTF|TROLLEY|butterfly|narrative/.test(s))?1:2;
pending.sort((a,b)=>priority(a)-priority(b)||a.speaker.localeCompare(b.speaker)||a.text.length-b.text.length||a.id.localeCompare(b.id));
const output=args[0]??'docs/audio-production';
mkdirSync(output,{recursive:true});
const json=JSON.stringify(pending,null,2)+'\n';
writeFileSync(join(output,'voice-queue.json'),json);
writeFileSync(join(output,'copy-review.json'),JSON.stringify({
 status:'ready-for-voice',cuesSha256:sha(json),reviewer:'Codex',reviewedAt:new Date().toISOString(),
 scope:'本次已修订的对白、旁白、选项和界面提示；仅录制新增或已改动语句。',
 language:'中文直说动作，少用状语和副词；保留必要的否定、时间、费用与人物关系。',
},null,2)+'\n');
console.log(JSON.stringify({total:cues.length,existingOrAlreadyScheduled:cues.length-pending.length,queued:pending.length,characters:pending.reduce((sum,c)=>sum+c.text.length,0),output}));
