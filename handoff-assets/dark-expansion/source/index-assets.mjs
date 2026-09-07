import {createRequire} from 'node:module';
import {readFile,writeFile,readdir,mkdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),sharp=require(process.env.TYCHE_SHARP_PATH||'sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(await readFile(path.join(root,'content/ending-catalog.json'),'utf8'));
const prose=JSON.parse(await readFile(path.join(root,'content/ending-prose.json'),'utf8'));
const byId=new Map();
for(const dir of [root,path.join(root,'endings')])for(const file of (await readdir(dir)).filter(f=>/^manifest-.*\.json$/.test(f)&&!f.includes('repairs'))){
 const json=JSON.parse(await readFile(path.join(dir,file),'utf8'));
 for(const entry of Array.isArray(json)?json:json.assets||json.endings||[]){if(entry.id?.startsWith('END-'))byId.set(entry.id,{...entry,generationManifest:path.relative(root,path.join(dir,file))});}
}
const repairs=JSON.parse(await readFile(path.join(root,'manifest-art-repairs-r.json'),'utf8'));
for(const entry of repairs)if(entry.id?.startsWith('END-'))byId.set(entry.id,{...entry,generationManifest:'manifest-art-repairs-r.json'});
const entries=[];
for(const row of catalog){
 const image=`${row.id}.webp`,png=`${row.id}.png`,meta=await sharp(path.join(root,'endings',image)).metadata();
 const text=prose.find(p=>p.id===row.id),source=byId.get(row.id);
 if(!text||text.title!==row.title||!source?.prompt)throw new Error(`Incomplete ending ${row.id}`);
 entries.push({...row,image,png,width:meta.width,height:meta.height,bytes:(await stat(path.join(root,'endings',image))).size,license:'MIT',generationManifest:source.generationManifest,prompt:source.prompt,qa:source.qa||'Generation agent viewed the saved image; root reviewed the ending contact sheet.'});
}
if(entries.length!==40)throw new Error('Expected 40 ending CGs');
await writeFile(path.join(root,'endings/manifest.json'),JSON.stringify({license:'MIT',count:entries.length,entries},null,2)+'\n');
await mkdir(path.join(root,'qa'),{recursive:true});
for(let page=0;page<4;page++){
 const layers=[];
 for(let i=0;i<10;i++){
  const row=entries[page*10+i],x=i%2*440,y=Math.floor(i/2)*273;
  const thumb=await sharp(path.join(root,'endings',row.image)).resize(432,243,{fit:'fill'}).png().toBuffer();
  const label=Buffer.from(`<svg width="432" height="26"><text x="8" y="20" fill="#c7d5df" font-family="sans-serif" font-size="17">${row.id}</text></svg>`);
  layers.push({input:thumb,left:x,top:y+26},{input:label,left:x,top:y});
 }
 await sharp({create:{width:880,height:1365,channels:4,background:'#111a24'}}).composite(layers).png().toFile(path.join(root,'qa',`endings-${page+1}.png`));
}
const characters=JSON.parse(await readFile(path.join(root,'characters/manifest.json'),'utf8'));
for(const a of characters.atlases){
 if(a.frames.some(f=>!f.role))throw new Error(`Missing role ${a.id}`);
 await sharp(path.join(root,'characters',a.png)).flatten({background:'#9eabb4'}).png().toFile(path.join(root,'qa',`${a.id}.png`));
}
const frameCount=characters.atlases.reduce((n,a)=>n+a.frames.length,0),portraitCount=characters.portraits.reduce((n,a)=>n+a.frames.length,0);
await writeFile(path.join(root,'manifest.json'),JSON.stringify({license:'MIT',endingCount:40,endings:'endings/manifest.json',endingText:'content/ending-prose.json',characters:'characters/manifest.json',mapFrames:frameCount,portraits:portraitCount,voice:'Deferred to the receiving developer; no revised audio generated.'},null,2)+'\n');
console.log(JSON.stringify({endingCount:40,mapFrames:frameCount,portraits:portraitCount,endingWebpBytes:entries.reduce((n,e)=>n+e.bytes,0)}));
