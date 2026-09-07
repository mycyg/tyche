// Authorized deterministic cutout/packing of already generated patient artwork.
// Border flood fill preserves pale clothes and blankets enclosed by the outline.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const sharp=createRequire(import.meta.url)(process.env.TYCHE_SHARP_PATH||'sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [portraits,beds]=process.argv.slice(2);
if(!portraits||!beds)throw new Error('Pass portrait and bed 4×2 source PNGs.');
const out=path.join(root,'output/extended-patients');await fs.mkdir(out,{recursive:true});
const labels=['infant-boy','infant-girl','child-boy','teen-boy','child-girl','teen-girl','pregnant-young','pregnant-mature'];
const reports=[];
for(const [mode,input] of [['portraits',portraits],['bed',beds]]){
  const meta=await sharp(input).metadata();
  const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const subjects=[];
  for(let index=0;index<8;index++){
    const col=index%4,row=Math.floor(index/4),split=mode==='portraits'?497:470;
    const left=Math.round(col*info.width/4),right=Math.round((col+1)*info.width/4),top=row?split:0,bottom=row?info.height:split,w=right-left,h=bottom-top;
    const rgba=Buffer.alloc(w*h*4),bg=new Uint8Array(w*h),queue=new Int32Array(w*h);
    for(let y=0;y<h;y++)data.copy(rgba,y*w*4,((top+y)*info.width+left)*4,((top+y)*info.width+right)*4);
    const candidate=i=>{const p=i*4,r=rgba[p],g=rgba[p+1],b=rgba[p+2];return rgba[p+3]===0||Math.min(r,g,b)>=221&&Math.max(r,g,b)-Math.min(r,g,b)<=12;};
    let head=0,tail=0;const add=i=>{if(!bg[i]&&candidate(i)){bg[i]=1;queue[tail++]=i;}};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);if(x)add(i-1);if(x<w-1)add(i+1);if(y)add(i-w);if(y<h-1)add(i+w);}
    const seen=new Uint8Array(w*h);let largest=[];
    for(let start=0;start<w*h;start++)if(!bg[start]&&!seen[start]){
      const component=[start];seen[start]=1;
      for(let k=0;k<component.length;k++){const i=component[k],x=i%w,y=Math.floor(i/w);for(const n of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(n>=0&&!bg[n]&&!seen[n]){seen[n]=1;component.push(n);}}
      if(component.length>largest.length)largest=component;
    }
    if(largest.length<w*h*.03)throw new Error(`Empty subject ${mode}:${index}`);
    const keep=new Uint8Array(w*h);let l=w,t=h,r=0,b=0;for(const i of largest){keep[i]=1;const x=i%w,y=Math.floor(i/w);l=Math.min(l,x);r=Math.max(r,x+1);t=Math.min(t,y);b=Math.max(b,y+1);}
    for(let i=0;i<w*h;i++)if(!keep[i])rgba.fill(0,i*4,i*4+4);
    const source=await sharp(rgba,{raw:{width:w,height:h,channels:4}}).extract({left:l,top:t,width:r-l,height:b-t}).png().toBuffer();
    subjects.push({source,index,col,row,width:r-l,height:b-t,sourceBBox:[left+l,top+t,left+r,top+b]});
  }
  for(const [name,size] of mode==='portraits'?[['extended-portraits',256]]:[['extended-bed-patients',128],['extended-bedside',256]]){
    const layers=[],cells=[];
    for(const s of subjects){
      const targetHeight=mode==='portraits'?size-10:s.index<2?size*.625:size*.875;
      const scale=Math.min((size-8)/s.width,targetHeight/s.height),width=Math.round(s.width*scale),height=Math.round(s.height*scale);
      const x=Math.round((size-width)/2),y=mode==='portraits'?size-4-height:size*.0625;
      const sprite=await sharp(s.source).resize(width,height,{kernel:mode==='portraits'?'lanczos3':'nearest'}).png().toBuffer();
      layers.push({input:sprite,left:s.col*size+x,top:s.row*size+y});cells.push({index:s.index,label:labels[s.index],sourceBBox:s.sourceBBox,localBBox:[x,y,x+width,y+height]});
    }
    const atlas=await sharp({create:{width:size*4,height:size*2,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
    await sharp(atlas).webp({lossless:true,effort:6}).toFile(path.join(root,'public/art',`${name}.webp`));
    for(const [qa,color] of [['dark','#263243'],['pink','#f4a5ba']])await sharp({create:{width:size*4,height:size*2,channels:3,background:color}}).composite([{input:atlas}]).png().toFile(path.join(out,`${name}-${qa}.png`));
    const pixels=await sharp(atlas).raw().toBuffer();let transparent=0,opaque=0,partial=0;
    for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;else if(pixels[i]===255)opaque++;else partial++;}
    reports.push({name,sourceHadAlpha:meta.hasAlpha,size:[size*4,size*2],grid:[4,2],cellSize:size,alpha:{transparent,opaque,partial},cells});
  }
}
// Visual QA uses the exact world sprite rectangle and bedside percentage frame.
const worldMap=await sharp(path.join(root,'public/art/ward-map.webp')).resize(768,512,{kernel:'nearest'}).png().toBuffer(),worldTiles=[],closeTiles=[];
for(let index=0;index<8;index++){
  const col=index%4,row=Math.floor(index/4);
  const small=await sharp(path.join(root,'public/art/extended-bed-patients.webp')).extract({left:col*128,top:row*128,width:128,height:128}).resize(64,64,{kernel:'nearest'}).png().toBuffer();
  const worldFrame=await sharp(worldMap).extract({left:10,top:10,width:100,height:105}).composite([{input:small,left:18,top:23}]).png().toBuffer();
  const world=await sharp(worldFrame).resize(300,315,{kernel:'nearest'}).png().toBuffer();
  worldTiles.push({input:world,left:col*300,top:row*315});
  const close=await sharp(path.join(root,'public/art/extended-bedside.webp')).extract({left:col*256,top:row*256,width:256,height:256}).resize(722,722,{kernel:'nearest'}).extract({left:0,top:0,width:722,height:676}).png().toBuffer();
  const closeFrame=await sharp(path.join(root,'public/art/bedside.webp')).composite([{input:close,left:407,top:348}]).png().toBuffer();
  const scene=await sharp(closeFrame).resize(384,256,{kernel:'nearest'}).png().toBuffer();
  closeTiles.push({input:scene,left:col*384,top:row*256});
}
await sharp({create:{width:1200,height:630,channels:3,background:'#263243'}}).composite(worldTiles).png().toFile(path.join(out,'qa-world-beds.png'));
await sharp({create:{width:1536,height:512,channels:3,background:'#263243'}}).composite(closeTiles).png().toFile(path.join(out,'qa-bedside-scenes.png'));
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports));
