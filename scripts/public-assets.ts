import {readFileSync,readdirSync,lstatSync,existsSync}from 'node:fs';
import {join,posix}from 'node:path';
import {MUSIC_SCENES,MUSIC_OGG_SCENES}from '../src/shared/audio-assets';

export interface PublicAsset {fileName:string;source:Buffer;}
/** Build a new allowlisted bundle. Never remove source recordings or manifests. */
export function publishedAssets(publicRoot:string):PublicAsset[]{
  const assets=new Map<string,Buffer>();
  const add=(relative:string)=>{
    if(posix.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error(`Unsafe public asset: ${relative}`);
    let current=publicRoot;
    for(const part of relative.split('/')){current=join(current,part);if(lstatSync(current).isSymbolicLink())throw new Error(`Symlink is not a release asset: ${relative}`);}
    if(!lstatSync(current).isFile())throw new Error(`Missing release file: ${relative}`);
    assets.set(relative,readFileSync(current));
  };
  const walk=(directory='')=>{
    for(const entry of readdirSync(join(publicRoot,directory),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      if(entry.name.startsWith('.')||directory===''&&entry.name==='audio')continue;
      const relative=posix.join(directory,entry.name);
      if(entry.isSymbolicLink())throw new Error(`Symlink is not a release asset: ${relative}`);
      if(entry.isDirectory())walk(relative);else add(relative);
    }
  };
  walk();
  const voiceIndexPath=join(publicRoot,'audio','voice','index.json');
  if(!existsSync(voiceIndexPath)&&process.env.TYCHE_ALLOW_MISSING_VOICE==='1'){
    // A worktree without the local voice store may still build for smoke checks; the release build stays strict.
    console.warn('Voice index missing; building without voice assets (TYCHE_ALLOW_MISSING_VOICE=1).');
  } else {
    add('audio/voice/index.json');
    const index:unknown=JSON.parse(assets.get('audio/voice/index.json')!.toString('utf8'));
    if(!index||typeof index!=='object'||Array.isArray(index))throw new Error('Invalid voice index');
    for(const [id,raw]of Object.entries(index)){
      if(!raw||typeof raw!=='object'||!('file'in raw)||typeof raw.file!=='string'||!/^[a-zA-Z0-9_-]+\.mp3$/.test(raw.file))throw new Error(`Invalid voice file for ${id}`);
      add(`audio/voice/${raw.file}`);
    }
  }
  for(const scene of MUSIC_SCENES){
    add(`audio/music/${scene}.mp3`);
    if(MUSIC_OGG_SCENES.has(scene))add(`audio/music/${scene}.ogg`);
  }
  const total=[...assets.values()].reduce((sum,bytes)=>sum+bytes.byteLength,0);
  if(total>900*1024*1024)throw new Error(`Release assets exceed 900 MiB: ${total}`);
  return[...assets].map(([fileName,source])=>({fileName,source}));
}
