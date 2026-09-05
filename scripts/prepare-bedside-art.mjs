// Mechanical atlas packing only: retain generated pixels and alpha.
// Inputs stay outside the repository; publish only optimized project assets.
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
const sharp = createRequire(import.meta.url)(process.env.TYCHE_SHARP_PATH || 'sharp');
const args = Object.fromEntries(Array.from({length:Math.floor((process.argv.length-2)/2)},(_,i)=>[process.argv[2+i*2].replace(/^--/,''),process.argv[3+i*2]]));
await mkdir('public/art',{recursive:true});
for (const [key,name] of [['map','ward-map'],['bedside','bedside']]) {
  if(args[key]) await sharp(args[key]).webp({quality:92,effort:6}).toFile(`public/art/${name}.webp`);
}
for (const [key,name,cols,rows,size] of [['portraits','patient-portraits',5,4,256],['patients','bed-patients',5,4,128],['idle','npc-idle',4,6,128]]) {
  if(!args[key]) continue;
  if(key==='idle' && args['idle-manifest']) continue;
  const meta=await sharp(args[key]).metadata();
  if(!meta.hasAlpha) throw new Error(`${key} requires a real generated alpha channel.`);
  const parts=[];
  for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
    const left=Math.round(col*meta.width/cols), top=Math.round(row*meta.height/rows);
    const width=Math.round((col+1)*meta.width/cols)-left, height=Math.round((row+1)*meta.height/rows)-top;
    const region=await sharp(args[key]).extract({left,top,width,height}).png().toBuffer();
    const {data,info}=await sharp(region).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let x0=width,y0=height,x1=0,y1=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) if(data[(y*width+x)*info.channels+3]>=128) {x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    if(x1<x0 || y1<y0) throw new Error(`Empty cell ${key}:${row}:${col}`);
    x0=Math.max(0,x0-2);y0=Math.max(0,y0-2);x1=Math.min(width-1,x1+2);y1=Math.min(height-1,y1+2);
    const packed=await sharp(region).extract({left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}).resize({width:size-8,height:size-10,fit:'inside',kernel:'nearest'}).png().toBuffer({resolveWithObject:true});
    parts.push({input:packed.data,left:col*size+Math.floor((size-packed.info.width)/2),top:row*size+size-4-packed.info.height});
  }
  await sharp({create:{width:cols*size,height:rows*size,channels:4,background:'#00000000'}}).composite(parts).webp({lossless:true,effort:6}).toFile(`public/art/${name}.webp`);
}
if(args.idle && args['idle-manifest']) {
  const manifest=JSON.parse(await readFile(args['idle-manifest'],'utf8'));
  const frames=manifest.records.find(record=>record.id==='npc_idle_alpha_extract').frames;
  const {data,info}=await sharp(args.idle).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const parts=[], scale=112/Math.max(...frames.map(frame=>frame.absoluteAlpha128BBox[3]-frame.absoluteAlpha128BBox[1]));
  for(const frame of frames) {
    const [x0,y0,x1,y1]=frame.absoluteAlpha128BBox;
    const left=Math.max(0,x0-2),top=Math.max(0,y0-2),width=Math.min(info.width,x1+2)-left,height=Math.min(info.height,y1+2)-top;
    // Anchor to the feet, not the bounding-box centre: a raised hand must not
    // make the whole character jump sideways between otherwise idle frames.
    let weight=0,footX=0;
    for(let y=y1-24;y<y1;y++) for(let x=x0;x<x1;x++) {
      const a=data[(y*info.width+x)*4+3];
      if(a>=128){weight+=a;footX+=x*a;}
    }
    const anchor=weight?footX/weight:(x0+x1)/2;
    const packed=await sharp(args.idle).extract({left,top,width,height}).resize(Math.round(width*scale),Math.round(height*scale),{kernel:'nearest'}).png().toBuffer();
    parts.push({input:packed,left:frame.col*128+Math.round(64-(anchor-left)*scale),top:frame.row*128+Math.round(120-(y1-top)*scale)});
  }
  await sharp({create:{width:512,height:768,channels:4,background:'#00000000'}}).composite(parts).webp({lossless:true,effort:6}).toFile('public/art/npc-idle.webp');
}
if(args['close-patients'] && args['patient-manifest']) {
  const {cells}=JSON.parse(await readFile(args['patient-manifest'],'utf8'));
  const parts=[];
  for(const cell of cells) {
    const [left,top,right,bottom]=cell.sourceBBox;
    const height=224,width=Math.round((right-left)*height/(bottom-top));
    const part=await sharp(args['close-patients']).extract({left,top,width:right-left,height:bottom-top}).resize(width,height,{kernel:'nearest'}).png().toBuffer();
    parts.push({input:part,left:cell.col*256+Math.round((256-width)/2),top:cell.row*256+16});
  }
  await sharp({create:{width:1280,height:1024,channels:4,background:'#00000000'}}).composite(parts).webp({lossless:true,effort:6}).toFile('public/art/bedside-patients.webp');
}
