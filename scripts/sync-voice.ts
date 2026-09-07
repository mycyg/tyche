import {execFileSync}from 'node:child_process';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,renameSync,writeFileSync}from 'node:fs';
import {tmpdir}from 'node:os';
import {join}from 'node:path';
import {createHash}from 'node:crypto';
import {needsVoiceTransfer,remoteVoicePaths}from './voice-sync-plan';

const args=process.argv.slice(2),arg=(name:string)=>args[args.indexOf(name)+1];
if(!args.includes('--host')||!args.includes('--input'))throw new Error('Pass --host and --input; --watch keeps transferring completed batches.');
const host=arg('--host'),input=JSON.parse(readFileSync(arg('--input'),'utf8'))as {id:string;text:string;speaker:string}[];
const remoteRoot=args.includes('--remote-root')?arg('--remote-root'):'E:/TycheAudio';
const {output:remoteOutput,archive:remoteArchive,tar:remoteTar}=remoteVoicePaths(remoteRoot);
const root='public/audio/voice',temporary=mkdtempSync(join(tmpdir(),'tyche-voice-sync-'));
const sshOptions=['-o','ControlPath=/tmp/tyche-5090-ssh-%C','-o','BatchMode=yes','-o','ConnectTimeout=10'];
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const wanted=new Map(input.map(c=>[c.id,{textSha256:sha(c.text),speaker:c.speaker}]));
const command=(name:string,parameters:string[])=>execFileSync(name,parameters,{stdio:['ignore','pipe','pipe'],timeout:60_000});
mkdirSync(root,{recursive:true});mkdirSync(join(temporary,'clips'),{recursive:true});
let failures=0,lastCount=-1;
for(;;){
 try{
  command('scp',['-q',...sshOptions,`${host}:${remoteOutput}/manifest.json`,join(temporary,'manifest.json')]);
  const remote=JSON.parse(readFileSync(join(temporary,'manifest.json'),'utf8'));
  const manifestPath=join(root,'manifest.json'),local=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):{};
  const matches=(id:string,entry:Record<string,string>)=>entry&&wanted.get(id)?.textSha256===entry.textSha256&&wanted.get(id)?.speaker===entry.speaker;
  const ids=Object.keys(remote).filter(id=>wanted.has(id)&&needsVoiceTransfer(wanted.get(id)!,remote[id],local[id],Boolean(local[id]?.file&&existsSync(join(root,local[id].file)))));
  for(let offset=0;offset<ids.length;offset+=64){
   const batch=ids.slice(offset,offset+64);
   const files=batch.map(id=>{
    const file=remote[id].file;
    if(!/^v-[a-f0-9]{16}\.mp3$/.test(file)||file!==`${id}.mp3`)throw new Error(`Unexpected audio filename ${id}`);
    return file;
   });
   command('ssh',[...sshOptions,host,`${remoteTar} -cf ${remoteArchive} -C ${remoteOutput} ${files.join(' ')}`]);
   command('scp',['-q',...sshOptions,`${host}:${remoteArchive}`,join(temporary,'transfer.tar')]);
   command('tar',['-xf',join(temporary,'transfer.tar'),'-C',join(temporary,'clips')]);
   for(const id of batch){copyFileSync(join(temporary,'clips',remote[id].file),join(root,remote[id].file));local[id]=remote[id];}
   writeFileSync(`${manifestPath}.partial.json`,JSON.stringify(local,null,2)+'\n');renameSync(`${manifestPath}.partial.json`,manifestPath);
  }
  const count=[...wanted.keys()].filter(id=>matches(id,local[id])&&existsSync(join(root,local[id].file))&&!needsVoiceTransfer(wanted.get(id)!,remote[id],local[id],true)).length;
  if(count!==lastCount){console.log(JSON.stringify({received:count,total:wanted.size,at:new Date().toISOString()}));lastCount=count;}
  failures=0;
  if(count===wanted.size||!args.includes('--watch'))break;
 }catch(error){
  failures++;console.error(JSON.stringify({transferRetry:failures,error:error instanceof Error?error.message:String(error)}));
  if(!args.includes('--watch')||failures>=12)throw error;
 }
 await new Promise(resolve=>setTimeout(resolve,20_000));
}
