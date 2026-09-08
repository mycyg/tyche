import {expect,test} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

const people=['chief','nurse','peer','research','rep','father','mother','auditor','patient'];
const sizes=[
  {width:375,height:667},{width:390,height:844},{width:412,height:780},
  {width:768,height:1024},{width:844,height:390},{width:1440,height:900},
];

for(const size of sizes) test(`complete dialogue portraits at ${size.width} × ${size.height}`,async({page},info)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize(size);
  await page.goto('tests/visual/dialogue.html');
  const output=`output/dialogue-portrait/${info.project.name}/${size.width}x${size.height}`;
  await mkdir(output,{recursive:true});
  for(const person of people){
    await page.getByLabel('人物',{exact:true}).selectOption(person);
    const frame=page.locator('.dialogue-portrait');
    await expect(frame).toBeVisible();
    if(person!=='patient'){
      const portrait=page.locator('.dialogue-actor-art');
      await expect(portrait).toHaveAccessibleName(/，/);
      const art=await portrait.evaluate(async(element)=>{
        const svg=element as SVGSVGElement,image=svg.querySelector('image')!;
        const source=new Image();source.src=image.getAttribute('href')!;await source.decode();
        const view=svg.viewBox.baseVal,matrix=svg.getScreenCTM()!;
        const top=new DOMPoint(view.x,view.y).matrixTransform(matrix);
        const bottom=new DOMPoint(view.x+view.width,view.y+view.height).matrixTransform(matrix);
        const container=svg.parentElement!.getBoundingClientRect();
        // Letterboxing must clip the source sheet first, otherwise neighboring people bleed in.
        const clip=getComputedStyle(image).clipPath;
        const id=clip.match(/#([^\)"]+)/)?.[1];
        const clipShape=id?document.getElementById(id)?.firstElementChild as SVGGraphicsElement|null:null;
        return {top:{x:top.x,y:top.y},bottom:{x:bottom.x,y:bottom.y},frame:container.toJSON(),
          scaleX:matrix.a,scaleY:matrix.d,sourceWidth:source.naturalWidth,clip,
          croppedWidth:clipShape?.getBBox().width,viewWidth:view.width};
      });
      expect(art.sourceWidth).toBeGreaterThan(0);
      expect(art.clip).not.toBe('none');
      expect(Number(art.croppedWidth)).toBe(art.viewWidth);
      expect(art.scaleX).toBeCloseTo(art.scaleY,5);
      expect(art.top.x).toBeGreaterThanOrEqual(art.frame.x-1);
      expect(art.top.y).toBeGreaterThanOrEqual(art.frame.y-1);
      expect(art.bottom.x).toBeLessThanOrEqual(art.frame.right+1);
      expect(art.bottom.y).toBeLessThanOrEqual(art.frame.bottom+1);
    }else{
      const box=await frame.boundingBox(),portrait=await page.locator('.dialogue-patient .patient-portrait').boundingBox();
      expect(portrait!.x).toBeGreaterThanOrEqual(box!.x-1);
      expect(portrait!.x+portrait!.width).toBeLessThanOrEqual(box!.x+box!.width+1);
      expect(portrait!.y).toBeGreaterThanOrEqual(box!.y-1);
      expect(portrait!.y+portrait!.height).toBeLessThanOrEqual(box!.y+box!.height+1);
    }
    const dialogue=await page.locator('.rpg-dialogue').boundingBox();
    expect(dialogue!.x).toBeGreaterThanOrEqual(0);
    expect(dialogue!.y).toBeGreaterThanOrEqual(0);
    expect(dialogue!.x+dialogue!.width).toBeLessThanOrEqual(size.width);
    expect(dialogue!.y+dialogue!.height).toBeLessThanOrEqual(size.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
    const end=page.getByRole('button',{name:'结束交谈 ▸'});
    await end.scrollIntoViewIfNeeded();
    await expect(end).toBeInViewport();
    if([390,844,1440].includes(size.width)) await page.locator('.rpg-dialogue').screenshot({path:`${output}/${person}.png`});
    await end.click();
    await expect(page.locator('.rpg-dialogue')).toHaveCount(0);
  }
  await page.getByLabel('人物',{exact:true}).selectOption('research');
  await page.getByLabel('大号文字',{exact:true}).check();
  // On a short landscape screen large-text mode reserves the whole box for readable dialogue.
  if(size.height<=600&&size.width>size.height) await expect(page.locator('.dialogue-portrait')).toBeHidden();
  else await expect(page.locator('.dialogue-actor-art')).toBeVisible();
  await page.getByRole('button',{name:'结束交谈 ▸'}).click();
  expect(errors).toEqual([]);
});
