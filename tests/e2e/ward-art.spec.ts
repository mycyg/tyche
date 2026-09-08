import { test, expect } from '@playwright/test';
import { ATLASES } from '../../src/world/npc-art';

test('every used motion frame decodes, has clear margins and preserves bed identity', async ({ page }) => {
  await page.goto('./');
  const adults = [15,1,5,12,14,16,2,11,10,4,18,8,17,9,3];
  const specs = ATLASES.filter(a => ['patient-motion','staff-motion','staff-actions','ward-haul','ward-care','companion-walk'].includes(a.id));
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
        frames++;
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
  expect(result.frames).toBe(432);
  expect(result.failures).toEqual([]);
});
