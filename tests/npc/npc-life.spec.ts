import {test,expect,type Page}from '@playwright/test';
import {mkdirSync}from 'node:fs';
import {resolve}from 'node:path';

const SHOTS=resolve(import.meta.dirname,'../../docs/npc-verification');
mkdirSync(SHOTS,{recursive:true});
/** Evidence frames stay small enough to keep in the repository. */
const shot=(name:string)=>({path:`${SHOTS}/${name}.jpg`,type:'jpeg' as const,quality:72});

async function startAtDesk(page:Page,seed='npc-life-check'){
  await page.goto('./');
  await page.getByRole('button',{name:'新的轮转',exact:true}).click();
  await page.getByLabel('轮转码',{exact:true}).fill(seed);
  for(let count=0;count<3;count++)await page.getByRole('button',{name:/^选入/}).and(page.locator(':enabled')).first().click();
  await page.getByRole('button',{name:'接过胸牌 →',exact:true}).click();
  await page.getByRole('button',{name:'开始值班 ▸',exact:true}).click();
  await expect(page.getByRole('region',{name:'南屏医院',exact:true})).toBeVisible();
  await expect(page.locator('.world-loading')).toHaveCount(0);
  await page.waitForTimeout(1500);
}
/** A downscaled greyscale sample of the map, taken straight from the canvas. */
async function sample(page:Page){
  return page.evaluate(()=>{
    const canvas=document.querySelector('canvas.world-canvas') as HTMLCanvasElement;
    const ctx=canvas.getContext('2d')!;
    const {width,height}=canvas,step=4,columns=Math.floor(width/step),rows=Math.floor(height/step);
    const data=ctx.getImageData(0,0,width,height).data,out:number[]=[];
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      const i=((y*step)*width+x*step)*4;
      out.push((data[i]+data[i+1]+data[i+2])/3);
    }
    return {columns,rows,pixels:out};
  });
}
/** Columns of the map whose pixels changed between two samples. */
function movedColumns(a:Awaited<ReturnType<typeof sample>>,b:typeof a){
  const columns=new Set<number>();
  for(let y=0;y<a.rows;y++)for(let x=0;x<a.columns;x++){
    const i=y*a.columns+x;
    if(Math.abs(a.pixels[i]-b.pixels[i])>18)columns.add(x);
  }
  return columns;
}

test('the ward keeps working while the doctor stands still',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await startAtDesk(page);
  const samples=[];
  for(let i=0;i<8;i++){
    samples.push(await sample(page));
    await page.locator('.world-viewport').screenshot(shot(`cycle-${String(i+1).padStart(2,'0')}`));
    await page.waitForTimeout(1600);
  }
  const busy=[],spread=new Set<number>();
  for(let i=1;i<samples.length;i++){
    const moved=movedColumns(samples[i-1],samples[i]);
    busy.push(moved.size);
    for(const column of moved)spread.add(column);
  }
  // Someone is moving in every window, and the movement is not one sprite.
  expect(Math.min(...busy)).toBeGreaterThan(4);
  const bands=new Set([...spread].map(column=>Math.floor(column/24)));
  expect(bands.size).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

test('a task can be followed to the person who carries it',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await startAtDesk(page,'npc-follow-check');
  const quests=page.getByRole('button',{name:/当班待办/});
  await quests.click();
  const list=page.getByRole('dialog',{name:'当班待办',exact:true});
  await expect(list).toBeVisible();
  const row=list.locator('.rpg-menu-row').first();
  await expect(row).toBeVisible();
  const owner=(await row.locator('small').innerText()).trim();
  const before=await sample(page);
  await row.click();
  await expect(list).toBeHidden();
  // The doctor walks the route to whoever holds the card; arriving opens it.
  await expect(page.locator('.rpg-dialogue')).toBeVisible({timeout:60_000});
  const title=await page.locator('.rpg-dialogue').getAttribute('aria-label');
  const after=await sample(page);
  expect(movedColumns(before,after).size,`walked to ${owner}`).toBeGreaterThan(20);
  expect(title??'').not.toBe('');
  await page.locator('.world-viewport').screenshot(shot(`follow-task`));
  expect(errors).toEqual([]);
});

test('the ward stays legible with motion turned off',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await startAtDesk(page,'npc-reduced-motion');
  const first=await sample(page);
  await page.waitForTimeout(4000);
  const second=await sample(page);
  const moved=movedColumns(first,second);
  expect(moved.size).toBeLessThan(4);
  // The floor is still drawn: people and furniture, not an empty canvas.
  const lit=first.pixels.filter(value=>value>40).length;
  expect(lit/first.pixels.length).toBeGreaterThan(.5);
  await page.locator('.world-viewport').screenshot(shot(`reduced-motion`));
});

async function walkIntoWardA(page:Page){
  await page.getByRole('button',{name:'打开病区地图',exact:true}).click();
  const overview=page.getByRole('dialog',{name:'病区地图',exact:true});
  await expect(overview).toBeVisible();
  await overview.getByRole('button',{name:/A病房/}).click();
  await expect(overview).toBeHidden();
  await page.waitForTimeout(6000);
}

test('beds and bedside people stay visible on a phone, upright and sideways',async({page})=>{
  await startAtDesk(page,'npc-viewport-check');
  await walkIntoWardA(page);
  await page.locator('.world-viewport').screenshot(shot(`desktop-1440x900`));
  const hud=await page.locator('.rpg-hud').boundingBox();
  const map=await page.locator('.world-viewport').boundingBox();
  expect(map!.y).toBeGreaterThanOrEqual(hud!.y+hud!.height-1);
  await expect(page.locator('.world-placard:not([hidden])').first()).toBeVisible();
  for(const [name,size] of [['portrait-375x812',{width:375,height:812}],['landscape-812x375',{width:812,height:375}]] as const){
    await page.setViewportSize(size);
    await page.waitForTimeout(2500);
    const bar=await page.locator('.rpg-hud').boundingBox();
    const view=await page.locator('.world-viewport').boundingBox();
    expect(view!.width,name).toBeGreaterThan(0);
    expect(view!.height,name).toBeGreaterThan(120);
    expect(bar!.y+bar!.height,name).toBeLessThanOrEqual(view!.y+1);
    // A bed label is on screen and clear of the status bar.
    const placard=page.locator('.world-placard:not([hidden])').first();
    await expect(placard,name).toBeVisible();
    const box=await placard.boundingBox();
    expect(box!.y,name).toBeGreaterThan(bar!.y+bar!.height-1);
    await page.locator('.world-viewport').screenshot(shot(`${name}`));
  }
});

test('the draw loop holds its frame budget on a phone-sized viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await startAtDesk(page,'npc-frame-budget');
  const timing=await page.evaluate(()=>new Promise<{frames:number;seconds:number;worst:number}>(resolve=>{
    const marks:number[]=[];
    let previous=performance.now();
    const tick=()=>{
      const now=performance.now();marks.push(now-previous);previous=now;
      if(marks.length<420)requestAnimationFrame(tick);
      else resolve({frames:marks.length,seconds:marks.reduce((s,v)=>s+v,0)/1000,worst:Math.max(...marks.slice(30))});
    };
    requestAnimationFrame(tick);
  }));
  const fps=timing.frames/timing.seconds;
  console.log(`npc frame budget: ${fps.toFixed(1)} fps average, worst frame ${timing.worst.toFixed(1)} ms`);
  expect(fps).toBeGreaterThan(30);
  expect(timing.worst).toBeLessThan(120);
});
