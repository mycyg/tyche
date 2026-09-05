import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const sharp = require(process.env.TYCHE_SHARP_PATH || 'sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) throw new Error('Pass the original patient atlas PNG as first argument.');
const out = path.join(root, 'output/bed-patients');
await fs.mkdir(out, {recursive:true});
const {data,info} = await sharp(input).removeAlpha().raw().toBuffer({resolveWithObject:true});
// Two hair silhouettes sit close to the nominal row boundary.
const edgesForColumn = col => [0,284,col===2?543:551,col===3?810:814,info.height];
const layers = [], sourceLayers = [], cells = [];
function bbox(buf,w,h) { let l=w,t=h,r=0,b=0; for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(buf[(y*w+x)*4+3]>=128){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);} return [l,t,r,b]; }
for(let index=0;index<20;index++){
  const row=Math.floor(index/5), col=index%5;
  const edges=edgesForColumn(col);
  const left=Math.floor(col*info.width/5), top=edges[row];
  const w=Math.floor((col+1)*info.width/5)-left,h=edges[row+1]-top;
  const rgba=Buffer.alloc(w*h*4), bg=new Uint8Array(w*h), queue=new Int32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const src=((top+y)*info.width+left+x)*3,dst=(y*w+x)*4;
    data.copy(rgba,dst,src,src+3);rgba[dst+3]=255;
  }
  // Only border-connected, light achromatic pixels are background. Interior
  // whites and pale blankets remain opaque; no global white color key is used.
  const candidate=i=>{const p=i*4,r=rgba[p],g=rgba[p+1],b=rgba[p+2];return Math.min(r,g,b)>=221&&Math.max(r,g,b)-Math.min(r,g,b)<=12;};
  let head=0,tail=0;
  const add=i=>{if(!bg[i]&&candidate(i)){bg[i]=1;queue[tail++]=i;}};
  for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
  while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);if(x)add(i-1);if(x<w-1)add(i+1);if(y)add(i-w);if(y<h-1)add(i+w);}
  for(let i=0;i<w*h;i++)if(bg[i])rgba[i*4+3]=0;
  // Reject disconnected dust left in the checkerboard, keeping the subject.
  const seen=new Uint8Array(w*h);let largest=[];
  for(let start=0;start<w*h;start++)if(!bg[start]&&!seen[start]){
    const component=[start];seen[start]=1;
    for(let k=0;k<component.length;k++){const i=component[k],x=i%w,y=Math.floor(i/w);for(const n of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(n>=0&&!bg[n]&&!seen[n]){seen[n]=1;component.push(n);}}
    if(component.length>largest.length)largest=component;
  }
  const keep=new Uint8Array(w*h);for(const i of largest)keep[i]=1;
  for(let i=0;i<w*h;i++)if(!keep[i]){rgba[i*4]=0;rgba[i*4+1]=0;rgba[i*4+2]=0;rgba[i*4+3]=0;}
  const box=bbox(rgba,w,h),cw=box[2]-box[0],ch=box[3]-box[1];
  const source=await sharp(rgba,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
  sourceLayers.push({input:source,left,top});
  const sw=Math.round(cw*112/ch);
  const sprite=await sharp(source).extract({left:box[0],top:box[1],width:cw,height:ch}).resize(sw,112,{kernel:'lanczos3'}).png().toBuffer();
  const x=Math.round((128-sw)/2),y=8;
  layers.push({input:sprite,left:col*128+x,top:row*128+y});
  const raw=await sharp(sprite).ensureAlpha().raw().toBuffer();const sb=bbox(raw,sw,112);
  cells.push({index,row,col,sourceBBox:[left+box[0],top+box[1],left+box[2],top+box[3]],bbox:[col*128+x+sb[0],row*128+y+sb[1],col*128+x+sb[2],row*128+y+sb[3]],localBBox:[x+sb[0],y+sb[1],x+sb[2],y+sb[3]],headAnchor:[64,8],blanketBottomAnchor:[64,120]});
}
const transparent={r:0,g:0,b:0,alpha:0};
await sharp({create:{width:info.width,height:info.height,channels:4,background:transparent}}).composite(sourceLayers).png().toFile(path.join(out,'patients-extracted-source.png'));
const atlas=await sharp({create:{width:640,height:512,channels:4,background:transparent}}).composite(layers).png().toBuffer();
await fs.writeFile(path.join(out,'bed-patients.png'),atlas);
await sharp(atlas).webp({lossless:true}).toFile(path.join(root,'public/art/bed-patients.webp'));
for(const [name,color] of [['dark','#263243'],['pink','#f4a5ba']])await sharp({create:{width:640,height:512,channels:3,background:color}}).composite([{input:atlas}]).png().toFile(path.join(out,`qa-${name}.png`));
const final=await sharp(path.join(root,'public/art/bed-patients.webp')).ensureAlpha().raw().toBuffer();
let transparentPixels=0,opaquePixels=0,partialPixels=0;for(let i=3;i<final.length;i+=4){if(final[i]===0)transparentPixels++;else if(final[i]===255)opaquePixels++;else partialPixels++;}
const report={size:[640,512],grid:[5,4],cellSize:128,alpha:{transparentPixels,opaquePixels,partialPixels},bboxConvention:'global [left,top,right,bottom), alpha>=128',cells};
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
