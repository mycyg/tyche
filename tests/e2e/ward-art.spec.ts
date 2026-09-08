import { test, expect } from '@playwright/test';
import { ATLASES } from '../../src/world/npc-art';

test('every used motion frame decodes, has clear margins and preserves bed identity', async ({ page }) => {
  await page.goto('./');
  const adults = [15,1,5,12,14,16,2,11,10,4,18,8,17,9,3];
  const specs = ATLASES.filter(a => ['patient-motion','staff-motion','ward-motion','staff-actions','ward-haul','ward-care','companion-walk'].includes(a.id));
  const result = await page.evaluate(async ({specs,adults}) => {
    async function pixels(file: string) {
      const image = new Image(); image.src = new URL(`art/${file}`, location.href).href; await image.decode();
      const c = document.createElement('canvas'); c.width=image.width; c.height=image.height;
      const ctx=c.getContext('2d')!; ctx.drawImage(image,0,0);
      return {width:c.width,height:c.height,ctx};
    }
    const failures:string[]=[]; let frames=0;
    for(const s of specs) {
      const sheet=await pixels(s.file);
      if(sheet.width!==s.columns*s.cellWidth||sheet.height!==s.rows*s.cellHeight) failures.push(`${s.id}:dimensions`);
      const rows=s.id==='patient-motion'?adults:Array.from({length:s.rows},(_,i)=>i);
      for(const row of rows) for(let col=0;col<s.columns;col++) {
        const rgba=sheet.ctx.getImageData(col*s.cellWidth,row*s.cellHeight,s.cellWidth,s.cellHeight).data;
        let count=0,edge=0,matte=0;
        for(let y=0;y<s.cellHeight;y++)for(let x=0;x<s.cellWidth;x++) {
          const i=(y*s.cellWidth+x)*4;if(!rgba[i+3])continue;count++;
          if(x===0||x===s.cellWidth-1||y===0||y>s.anchorY)edge++;
          if(rgba[i]>180&&rgba[i+2]>180&&rgba[i+1]<60)matte++;
        }
        if(count<200||edge||matte)failures.push(`${s.id}:${row}:${col}: pixels=${count},edge=${edge},matte=${matte}`);
        // The actual connected body must reach the foot anchor. A stray piece
        // of the next row's hair cannot count as a correctly aligned shoe.
        const visited=new Uint8Array(s.cellWidth*s.cellHeight);let largest=0,bodyBottom=0;
        for(let p=0;p<visited.length;p++)if(rgba[p*4+3]&&!visited[p]){
          const queue=[p];visited[p]=1;let bottom=0;
          for(let q=0;q<queue.length;q++){
            const at=queue[q],x=at%s.cellWidth,y=Math.floor(at/s.cellWidth);bottom=Math.max(bottom,y);
            for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
              const next=at+dy*s.cellWidth+dx;
              if(x+dx>=0&&x+dx<s.cellWidth&&y+dy>=0&&y+dy<s.cellHeight&&!visited[next]&&rgba[next*4+3]){visited[next]=1;queue.push(next);}
            }
          }
          if(queue.length>largest){largest=queue.length;bodyBottom=bottom;}
        }
        // Tool sheets place cart wheels and buckets a few pixels in front of
        // the shoes on the floor plane. Plain standing bodies have no such prop.
        const footTolerance=s.id==='ward-care'||s.id==='ward-haul'?8:2;
        if(bodyBottom<s.anchorY-footTolerance)failures.push(`${s.id}:${row}:${col}: floating body bottom=${bodyBottom}`);
        if ((s.id==='staff-motion'||s.id==='staff-actions') && row===4) {
          // The crown must not contain transparent islands. The lower bob has
          // intentional gaps by the neck and earrings, outside this region.
          const h=44,w=s.cellWidth,seen=new Uint8Array(w*h),queue:number[]=[];
          const add=(p:number)=>{if(!seen[p]&&!rgba[p*4+3]){seen[p]=1;queue.push(p);}};
          for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}
          for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
          for(let q=0;q<queue.length;q++){
            const p=queue[q],x=p%w;
            if(x>0)add(p-1);if(x+1<w)add(p+1);if(p>=w)add(p-w);if(p+w<w*h)add(p+w);
          }
          let holes=0;for(let p=0;p<w*h;p++)if(!seen[p]&&!rgba[p*4+3])holes++;
          if(holes)failures.push(`${s.id}:${row}:${col}: hair holes=${holes}`);
        }
        frames++;
      }
      if(s.id==='ward-motion')for(const row of rows)for(let dir=0;dir<4;dir++){
        const legs=Array.from({length:4},(_,step)=>sheet.ctx.getImageData((dir*4+step)*128,row*128+84,128,39).data);
        // Check lower-body silhouettes, so a blink, changed face or palette
        // cannot disguise the old repeated-leg sliding animation.
        for(let step=0;step<4;step++){
          let changed=0;const a=legs[step],b=legs[(step+1)%4];
          for(let i=3;i<a.length;i+=4)if((a[i]>0)!==(b[i]>0))changed++;
          if(changed<24)failures.push(`ward gait:${row}:${dir}:${step}: leg silhouette changes=${changed}`);
        }
      }
    }
    const bed=await pixels('bed-patients.webp'), transition=await pixels('patient-transitions-atlas.webp');
    for(const row of adults) {
      const a=bed.ctx.getImageData(row%5*128,Math.floor(row/5)*128,128,128).data;
      const b=transition.ctx.getImageData(0,row*128,128,128).data;
      // Compare visible pixels; fully transparent RGB is immaterial to compositing.
      if(a.some((v,i)=>i%4===3?v!==b[i]:a[i-i%4+3]>0&&v!==b[i]))failures.push(`bed identity:${row}`);
      for(let pose=1;pose<4;pose++)if(!transition.ctx.getImageData(pose*128,row*128,128,128).data.some((v,i)=>i%4===3&&v>0))failures.push(`missing transition:${row}:${pose}`);
    }
    return {frames,failures};
  },{specs,adults});
  expect(result.frames).toBe(480);
  expect(result.failures).toEqual([]);
});
