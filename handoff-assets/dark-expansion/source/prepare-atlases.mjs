// Approved local background extraction and mechanical sprite packing.
// Keep generated originals; preserve interior light clothing and true alpha.
import {createRequire} from 'node:module';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url);
const sharp=require(process.env.TYCHE_SHARP_PATH || 'sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brief=JSON.parse(await readFile(path.join(root,'source/art-briefs.json'),'utf8'));
const sheets=brief.assets.filter(a=>a.type!=='cg');
const manifest={license:'MIT',atlases:[],portraits:[]};
for(const sheet of sheets){
 const file=path.join(root,'characters',`${sheet.key}.png`);
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const roles=brief.roles[sheet.group].map(role=>typeof role==='string'?role.split(':')[0]:role.id||role.key);
 if(sheet.type==='portraits'){
  const frames=[];
  for(let row=0;row<sheet.rows;row++)for(let col=0;col<sheet.columns;col++){
   const left=Math.round(col*info.width/sheet.columns),top=Math.round(row*info.height/sheet.rows);
   frames.push({role:roles[row],expression:['tired-neutral','arguing-angry','withdrawn-hurt'][col],row,col,rect:[left,top,Math.round((col+1)*info.width/sheet.columns)-left,Math.round((row+1)*info.height/sheet.rows)-top]});
  }
  await sharp(file).webp({quality:95}).toFile(path.join(root,'characters',`${sheet.key}.webp`));
  manifest.portraits.push({id:sheet.key,file:`${sheet.key}.webp`,png:`${sheet.key}.png`,rows:sheet.rows,columns:sheet.columns,width:info.width,height:info.height,frames});
  console.log(sheet.key,frames.length,'portraits');continue;
 }
 let transparent=0;for(let p=3;p<data.length;p+=4)if(data[p]<16)transparent++;
 const matte=transparent/(info.width*info.height)<.02;
 const bright=(r,g,b)=>Math.min(r,g,b)>=221 && Math.max(r,g,b)-Math.min(r,g,b)<=14;
 const foreground=(x,y)=>{const p=(y*info.width+x)*4;return data[p+3]>=128 && (!matte||!bright(data[p],data[p+1],data[p+2]));};
 const rowCuts=[0];
 for(let row=1;row<sheet.rows;row++){
  const center=Math.round(row*info.height/sheet.rows),radius=Math.floor(info.height/sheet.rows*.23);let cut=center,best=Infinity;
  for(let y=center-radius;y<=center+radius;y++){
   let count=0;for(let x=0;x<info.width;x++)if(foreground(x,y))count++;
   const score=count*1000+Math.abs(y-center);if(score<best){best=score;cut=y;}
  }rowCuts.push(cut);
 }rowCuts.push(info.height);
 const cellWidth=sheet.type==='actions'?192:128,cellHeight=128,layers=[],frames=[],columnCuts=[];
 for(let row=0;row<sheet.rows;row++){
  const cuts=[0],top=rowCuts[row],h=rowCuts[row+1]-top;
  for(let col=1;col<8;col++){
   const center=Math.round(col*info.width/8),radius=Math.floor(info.width/8*.32);let cut=center,best=Infinity;
   for(let x=center-radius;x<=center+radius;x++){
    let count=0;for(let y=top;y<top+h;y++)if(foreground(x,y))count++;
    const score=count*1000+Math.abs(x-center);if(score<best){best=score;cut=x;}
   }cuts.push(cut);
  }cuts.push(info.width);columnCuts.push(cuts);
  for(let col=0;col<8;col++){
   const left=cuts[col],w=cuts[col+1]-left,rgba=Buffer.alloc(w*h*4);
   for(let y=0;y<h;y++)data.copy(rgba,y*w*4,((top+y)*info.width+left)*4,((top+y)*info.width+left+w)*4);
   if(matte){
    const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
    const add=i=>{const p=i*4;if(!seen[i]&&bright(rgba[p],rgba[p+1],rgba[p+2])){seen[i]=1;queue[tail++]=i;}};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);if(x)add(i-1);if(x<w-1)add(i+1);if(y)add(i-w);if(y<h-1)add(i+w);}
    for(let i=0;i<w*h;i++)if(seen[i])rgba[i*4+3]=0;
   }
   let l=w,t=h,r=0,b=0;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(rgba[(y*w+x)*4+3]>=128){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);}
   if(r<=l||b<=t)throw new Error(`Empty sprite ${sheet.key}/${row}/${col}`);
   const scale=Math.min(112/(b-t),(cellWidth-12)/(r-l)),sw=Math.max(1,Math.round((r-l)*scale)),sh=Math.max(1,Math.round((b-t)*scale));
   const flip=sheet.key==='family-walk'&&col===2;
   let sprite=sharp(rgba,{raw:{width:w,height:h,channels:4}}).extract({left:l,top:t,width:r-l,height:b-t});
   if(flip)sprite=sprite.flop();
   const input=await sprite.resize(sw,sh,{kernel:'nearest'}).png().toBuffer();
   layers.push({input,left:col*cellWidth+Math.floor((cellWidth-sw)/2),top:row*cellHeight+122-sh});
   frames.push({role:roles[row],row,col,rect:[col*cellWidth,row*cellHeight,cellWidth,cellHeight],anchor:[cellWidth/2,122],sourceRect:[left+l,top+t,r-l,b-t],flippedHorizontally:flip});
  }
 }
 const atlas=await sharp({create:{width:8*cellWidth,height:sheet.rows*cellHeight,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
 await writeFile(path.join(root,'characters',`${sheet.key}-atlas.png`),atlas);
 await sharp(atlas).webp({lossless:true}).toFile(path.join(root,'characters',`${sheet.key}-atlas.webp`));
 manifest.atlases.push({id:sheet.key,file:`${sheet.key}-atlas.webp`,png:`${sheet.key}-atlas.png`,rows:sheet.rows,columns:8,cellWidth,cellHeight,sourceRowCuts:rowCuts,sourceColumnCuts:columnCuts,background:matte?'border-connected-light-matte-removed':'original-alpha-preserved',frames});
 console.log(sheet.key,frames.length,'frames');
}
await writeFile(path.join(root,'characters/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
