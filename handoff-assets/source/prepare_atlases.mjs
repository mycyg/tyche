// Mechanical cutout/packing, using the approved bed-patient extraction method.
// Generated originals are preserved. No repainting or global white color key.
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),sharp=require(process.env.TYCHE_SHARP_PATH||'sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','art');
const sheets=[['staff-walk',5,false],['ward-life-walk',6,false],['patient-walk',6,true],['ward-actions',4,true]];
const manifest={license:'MIT',columns:8,atlases:[]};
for(const [id,rows,matte] of sheets){
 const {data,info}=await sharp(path.join(root,`${id}.png`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const cellWidth=id==='ward-actions'?192:128,cellHeight=128,layers=[],frames=[];
 const rowCuts=[0];
 for(let row=1;row<rows;row++){
  const center=Math.round(row*info.height/rows),radius=Math.floor(info.height/rows*.23);
  let cut=center,best=Infinity;
  for(let y=center-radius;y<=center+radius;y++){
   let count=0;for(let x=0;x<info.width;x++){const p=(y*info.width+x)*4,r=data[p],g=data[p+1],b=data[p+2];if(data[p+3]>=128&&(!matte||Math.min(r,g,b)<221||Math.max(r,g,b)-Math.min(r,g,b)>14))count++;}
   const weight=count*1000+Math.abs(y-center);if(weight<best){best=weight;cut=y;}
  }
  rowCuts.push(cut);
 }
 rowCuts.push(info.height);
 for(let row=0;row<rows;row++)for(let col=0;col<8;col++){
  const left=Math.round(col*info.width/8),top=rowCuts[row],w=Math.round((col+1)*info.width/8)-left,h=rowCuts[row+1]-top;
  const rgba=Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++)data.copy(rgba,y*w*4,((top+y)*info.width+left)*4,((top+y)*info.width+left+w)*4);
  if(matte){
   const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
   const add=i=>{const p=i*4,r=rgba[p],g=rgba[p+1],b=rgba[p+2];if(!seen[i]&&Math.min(r,g,b)>=221&&Math.max(r,g,b)-Math.min(r,g,b)<=14){seen[i]=1;queue[tail++]=i;}};
   for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
   while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);if(x)add(i-1);if(x<w-1)add(i+1);if(y)add(i-w);if(y<h-1)add(i+w);}
   for(let i=0;i<w*h;i++)if(seen[i])rgba[i*4+3]=0;
  }
  let l=w,t=h,r=0,b=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(rgba[(y*w+x)*4+3]>=128){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);}
  if(r<=l||b<=t)throw new Error(`Empty sprite ${id}/${row}/${col}`);
  const maxHeight=id==='patient-walk'&&row===4?84:112,scale=Math.min(maxHeight/(b-t),(cellWidth-12)/(r-l));
  const sw=Math.max(1,Math.round((r-l)*scale)),sh=Math.max(1,Math.round((b-t)*scale));
  const sprite=await sharp(rgba,{raw:{width:w,height:h,channels:4}}).extract({left:l,top:t,width:r-l,height:b-t}).resize(sw,sh,{kernel:'nearest'}).png().toBuffer();
  layers.push({input:sprite,left:col*cellWidth+Math.floor((cellWidth-sw)/2),top:row*cellHeight+122-sh});
  frames.push({row,col,rect:[col*cellWidth,row*cellHeight,cellWidth,cellHeight],anchor:[cellWidth/2,122],sourceRect:[left+l,top+t,r-l,b-t]});
 }
 const atlas=await sharp({create:{width:8*cellWidth,height:rows*cellHeight,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
 await writeFile(path.join(root,`${id}-atlas.png`),atlas);
 await sharp(atlas).webp({lossless:true}).toFile(path.join(root,`${id}-atlas.webp`));
 manifest.atlases.push({id,file:`${id}-atlas.webp`,png:`${id}-atlas.png`,rows,columns:8,cellWidth,cellHeight,sourceRowCuts:rowCuts,frames});
 console.log(id,frames.length,'frames');
}
await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
