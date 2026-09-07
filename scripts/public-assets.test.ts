import {it,expect}from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync}from 'node:fs';
import {tmpdir}from 'node:os';
import {join}from 'node:path';
import {publishedAssets}from './public-assets';
import {MUSIC_SCENES}from '../src/shared/audio-assets';

function fixture(test:(root:string)=>void){
 const root=mkdtempSync(join(tmpdir(),'tyche-release-assets-'));
 try{
  mkdirSync(join(root,'audio','voice'),{recursive:true});mkdirSync(join(root,'audio','music'));
  writeFileSync(join(root,'cover.webp'),'art');
  writeFileSync(join(root,'audio','voice','index.json'),JSON.stringify({line:{file:'current.mp3'}}));
  for(const file of ['current.mp3','orphan.mp3','manifest.json'])writeFileSync(join(root,'audio','voice',file),'fixture');
  for(const scene of MUSIC_SCENES)writeFileSync(join(root,'audio','music',scene+'.mp3'),'fixture');
  writeFileSync(join(root,'audio','pilot.mp3'),'fixture');
  test(root);
 }finally{rmSync(root,{recursive:true,force:true});}
}
it('publishes only indexed recordings and the soundtrack, retaining local originals',()=>fixture(root=>{
 const names=publishedAssets(root).map(x=>x.fileName);
 expect(names).toContain('cover.webp');expect(names).toContain('audio/voice/current.mp3');
 expect(names).not.toContain('audio/voice/orphan.mp3');expect(names).not.toContain('audio/voice/manifest.json');expect(names).not.toContain('audio/pilot.mp3');
 expect(names.filter(n=>n.startsWith('audio/music/'))).toHaveLength(MUSIC_SCENES.length);
}));
it.each(['../pilot.mp3','/pilot.mp3','..\\pilot.mp3'])('rejects an index path escape %s',file=>fixture(root=>{
 writeFileSync(join(root,'audio','voice','index.json'),JSON.stringify({line:{file}}));
 expect(()=>publishedAssets(root)).toThrow('Invalid voice file');
}));
it('rejects symlinked public art without following it',()=>fixture(root=>{
 symlinkSync(join(root,'cover.webp'),join(root,'outside.webp'));
 expect(()=>publishedAssets(root)).toThrow('Symlink');
}));
