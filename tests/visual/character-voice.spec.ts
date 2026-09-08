import {test,expect} from '@playwright/test';
import {CHARACTER_VOICES} from '../../src/shared/character-voices';

test('all character reactions really play, rotate within their role, and leave narration silent',async({page})=>{
  test.setTimeout(60_000);
  const played:string[]=[],errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('__characterPlayed',(src:string)=>played.push(src));
  await page.addInitScript(()=>{
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){
      const result=play.call(this);
      void result.then(()=>{if(!this.paused&&this.readyState>=2)void (window as unknown as {__characterPlayed:(src:string)=>Promise<void>}).__characterPlayed(this.currentSrc);}).catch(()=>{});
      return result;
    };
  });
  await page.goto('tests/visual/character-voice.html');
  for(const actor of Object.keys(CHARACTER_VOICES)){
    await page.getByLabel('角色',{exact:true}).selectOption(actor);
    const clips:string[]=[];
    for(let i=0;i<3;i++){
      const before=played.length;await page.getByRole('button',{name:'交谈',exact:true}).click();
      await expect.poll(()=>played.length).toBe(before+1);
      const src=played.at(-1)!;expect(src).toMatch(new RegExp(`/audio/character-voice/reaction-${actor}-[123]\\.mp3\\?v=[a-f0-9]{12}$`));clips.push(src);
    }
    expect(new Set(clips).size).toBe(3);
    const before=played.length;await page.getByRole('button',{name:'重听角色短语音',exact:true}).click();
    await expect.poll(()=>played.length).toBe(before+1);expect(played.at(-1)).toBe(clips.at(-1));
  }
  const before=played.length;
  await page.getByRole('button',{name:'查看文字',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'文字记录',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'重听角色短语音',exact:true})).toHaveCount(0);
  await page.getByLabel('角色短语音',{exact:true}).uncheck();
  await page.getByRole('button',{name:'交谈',exact:true}).click();await page.waitForTimeout(350);
  expect(played).toHaveLength(before);expect(errors).toEqual([]);
});
