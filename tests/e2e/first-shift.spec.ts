import {test,expect,type Page}from '@playwright/test';
import {readFileSync}from 'node:fs';
import {voiceKey,voiceSentences}from '../../src/ui/voice-text';

async function startAtDesk(page:Page){
  await page.goto('./');
  await page.getByRole('button',{name:'新的轮转',exact:true}).click();
  await page.getByLabel('轮转码',{exact:true}).fill('browser-audit-first-shift');
  for(let count=0;count<3;count++)await page.getByRole('button',{name:/^选入/}).and(page.locator(':enabled')).first().click();
  await page.getByRole('button',{name:'接过胸牌 →',exact:true}).click();
  await page.getByRole('button',{name:'开始值班 ▸',exact:true}).click();
  await expect(page.getByRole('region',{name:'南屏医院',exact:true})).toBeVisible();
  await expect(page.locator('.world-loading')).toHaveCount(0);
}
test('fresh start, readable HUD, map navigation and modal focus',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const played:string[]=[];
  await page.exposeFunction('__tycheAudioPlayed',(src:string)=>played.push(src));
  await page.addInitScript(()=>{
    const nativePlay=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){
      const result=nativePlay.call(this);
      // Observe real decoder playback; do not replace media or report requests as playback.
      void result.then(()=>{
        const report=(window as unknown as {__tycheAudioPlayed:(src:string)=>Promise<void>}).__tycheAudioPlayed;
        if(!this.paused&&this.readyState>=2)void report(this.currentSrc);
      }).catch(()=>{});
      return result;
    };
  });
  await startAtDesk(page);
  const hud=await page.locator('.rpg-hud').boundingBox(),map=await page.locator('.world-viewport').boundingBox();
  expect(hud).not.toBeNull();expect(map).not.toBeNull();
  expect(map!.y).toBeGreaterThanOrEqual(hud!.y+hud!.height-1);
  await page.getByRole('button',{name:'打开病区地图',exact:true}).click();
  const overview=page.getByRole('dialog',{name:'病区地图',exact:true});await expect(overview).toBeVisible();
  await expect(overview.getByRole('button',{name:/A病房/})).toBeVisible();
  await page.keyboard.press('Escape');await expect(overview).not.toBeVisible();
  await page.getByRole('button',{name:'暂停与设置',exact:true}).click();
  const settings=page.locator('dialog[open]');await expect(settings).toHaveCount(1);
  const voiceIndex=JSON.parse(readFileSync('dist/audio/voice/index.json','utf8'));
  const audition=voiceIndex[voiceKey(voiceSentences('先核对床号和姓名。家属刚送来的药也看一下，别漏了院外用药。')[0],'nurse')];
  expect(audition).toBeDefined();expect(audition.version).toMatch(/^[a-f0-9]{12}$/);
  await settings.getByRole('button',{name:'试听语音',exact:true}).click();
  await expect.poll(()=>played.some(src=>src.endsWith('/'+audition.file+'?v='+audition.version))).toBe(true);
  // ward-rounds and the other new scene tracks ship as .ogg first, .mp3 as the compatibility fallback.
  await expect.poll(()=>played.some(src=>/\/audio\/music\/[^/]+\.(mp3|ogg)$/.test(src))).toBe(true);
  await page.keyboard.press('Escape');await expect(settings).toHaveCount(0);
  await page.getByRole('button',{name:/当班待办/}).click();
  const agenda=page.getByRole('dialog',{name:'当班待办',exact:true});await expect(agenda).toBeVisible();
  await agenda.locator('.rpg-menu-row').first().click();
  await expect(page.locator('.rpg-dialogue,.bedside-view')).not.toHaveCount(0,{timeout:30_000});
  expect(errors).toEqual([]);
});
