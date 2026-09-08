import {test,expect} from '@playwright/test';

test('the real keyboard controller crosses a stationary NPC without a body detour',async({page})=>{
  await page.goto('tests/visual/ward.html');
  await page.getByRole('button',{name:'人物通行',exact:true}).click();
  await expect(page.locator('.world-loading')).toHaveCount(0);
  await expect(page.locator('output[aria-label="主角位置"]')).toHaveAttribute('data-x','650');
  // Ye Ming stands at 700,262 with scene motion disabled. The doctor keeps
  // manual control and must pass straight through that occupied floor.
  await page.keyboard.down('d');await page.waitForTimeout(1100);await page.keyboard.up('d');
  const at=page.locator('output[aria-label="主角位置"]');
  await expect.poll(async()=>Number(await at.getAttribute('data-x'))).toBeGreaterThan(745);
  expect(Number(await at.getAttribute('data-y'))).toBeCloseTo(262);
  await page.locator('.world-viewport').screenshot({path:'output/ward-followup/crossing.png'});
});

test('scene frames advance through the new lower-body animation while feet travel',async({page})=>{
  await page.addInitScript(()=>{
    const original=CanvasRenderingContext2D.prototype.drawImage;
    const frames:Record<string,number[]>={};
    Object.defineProperty(window,'__wardFrames',{value:frames});
    CanvasRenderingContext2D.prototype.drawImage=function(...args:unknown[]){
      const [image,sx,sy]=args;
      if(image instanceof HTMLImageElement&&image.src.includes('/ward-motion-atlas.webp')&&args.length===9){
        const row=Number(sy)/128;
        (frames[row]??=[]).push(Number(sx)/128);
      }
      return Reflect.apply(original,this,args);
    };
  });
  await page.goto('tests/visual/ward.html');
  // Camera needs to see the east wards for both nurses and the porter.
  await page.getByRole('button',{name:'人物通行',exact:true}).click();
  await page.getByLabel('动态',{exact:true}).check();
  await page.waitForTimeout(16000);
  const rows=await page.evaluate(()=>{
    const frames=(window as unknown as {__wardFrames:Record<string,number[]>}).__wardFrames;
    return Object.fromEntries(Object.entries(frames).map(([row,cols])=>[row,[...new Set(cols.map(c=>c%4))]]));
  });
  for(const row of ['0','1','2'])expect(rows[row]?.sort(),`ward actor row ${row}`).toEqual([0,1,2,3]);
  await page.locator('.world-viewport').screenshot({path:'output/ward-followup/walking.png'});
});
