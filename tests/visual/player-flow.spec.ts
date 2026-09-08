import {expect,test} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
test('clinical instructions stay optional and every action remains reachable',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const output=`output/player-report-fixes/${info.project.name}`;await mkdir(output,{recursive:true});
 for(const size of [{width:393,height:852},{width:852,height:393},{width:1440,height:900}]){
  await page.setViewportSize(size);await page.goto('tests/visual/player-flow.html');
  const help=page.getByLabel('本组操作说明',{exact:true});await expect(help).toBeVisible();await expect(help).not.toHaveAttribute('open','');
  await help.locator('summary').click();await expect(help).toHaveAttribute('open','');await help.locator('summary').click();
  const scroll=page.locator('.dialogue-main');await scroll.evaluate(el=>{el.scrollTop=0});
  const overflow=await scroll.evaluate(el=>el.scrollHeight>el.clientHeight+8);
  if(overflow)await expect(page.locator('.dialogue-scroll-more')).toBeVisible();
  await page.screenshot({path:`${output}/clinical-${size.width}x${size.height}.png`});
  for(const button of await page.locator('.dialogue-option,.dialogue-record').all()){await button.scrollIntoViewIfNeeded();await expect(button).toBeInViewport();}
  await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight});await expect(page.locator('.dialogue-scroll-more')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
  const box=await page.locator('.rpg-dialogue').boundingBox();expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(size.height);
 }
 expect(errors).toEqual([]);
});
