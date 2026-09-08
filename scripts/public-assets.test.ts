import {it,expect}from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync}from 'node:fs';
import {tmpdir}from 'node:os';
import {join}from 'node:path';
import {publishedAssets}from './public-assets';
import {MUSIC_SCENES,MUSIC_OGG_SCENES}from '../src/shared/audio-assets';

function fixture(test:(root:string)=>void){
 const root=mkdtempSync(join(tmpdir(),'tyche-release-assets-'));
 try{
  mkdirSync(join(root,'audio','character-voice'),{recursive:true});mkdirSync(join(root,'audio','music'));
  writeFileSync(join(root,'cover.webp'),'art');
  writeFileSync(join(root,'audio','character-voice','index.json'),JSON.stringify({line:{file:'current.mp3'}}));
  for(const file of ['current.mp3','orphan.mp3','manifest.json'])writeFileSync(join(root,'audio','character-voice',file),'fixture');
  for(const scene of MUSIC_SCENES){
    writeFileSync(join(root,'audio','music',scene+'.mp3'),'fixture');
    if(MUSIC_OGG_SCENES.has(scene))writeFileSync(join(root,'audio','music',scene+'.ogg'),'fixture');
  }
  writeFileSync(join(root,'audio','pilot.mp3'),'fixture');
  mkdirSync(join(root,'audio','voice'));writeFileSync(join(root,'audio','voice','legacy.mp3'),'obsolete full dialogue');
  test(root);
 }finally{rmSync(root,{recursive:true,force:true});}
}
it('publishes only indexed recordings and the soundtrack, retaining local originals',()=>fixture(root=>{
 const names=publishedAssets(root).map(x=>x.fileName);
 expect(names).toContain('cover.webp');expect(names).toContain('audio/character-voice/current.mp3');
 expect(names).not.toContain('audio/character-voice/orphan.mp3');expect(names).not.toContain('audio/character-voice/manifest.json');expect(names).not.toContain('audio/pilot.mp3');expect(names.some(n=>n.startsWith('audio/voice/'))).toBe(false);
 expect(names.filter(n=>n.startsWith('audio/music/'))).toHaveLength(MUSIC_SCENES.length+MUSIC_OGG_SCENES.size);
 for(const scene of MUSIC_OGG_SCENES)expect(names).toContain(`audio/music/${scene}.ogg`);
}));
it.each(['../pilot.mp3','/pilot.mp3','..\\pilot.mp3'])('rejects an index path escape %s',file=>fixture(root=>{
 writeFileSync(join(root,'audio','character-voice','index.json'),JSON.stringify({line:{file}}));
 expect(()=>publishedAssets(root)).toThrow('Invalid voice file');
}));
it('rejects symlinked public art without following it',()=>fixture(root=>{
 symlinkSync(join(root,'cover.webp'),join(root,'outside.webp'));
 expect(()=>publishedAssets(root)).toThrow('Symlink');
}));
