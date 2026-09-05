// Mechanical atlas extraction: preserve generated alpha, normalize cell size
// and foot anchors. No new art is drawn here.
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sharp = require(process.env.TYCHE_SHARP_PATH || 'sharp');
const [manifest] = process.argv.slice(2);
if (!manifest) throw new Error('Provide the image-generation manifest.');
const data = JSON.parse(await readFile(manifest, 'utf8'));
await mkdir('public/art', { recursive: true });
const assets = data.assets;
const map = assets.find(x => !x.hasAlpha);
await sharp(map.path).webp({quality:92, effort:6}).toFile('public/art/ward-map.webp');
for (const [id, name, cols, rows] of [['protagonist_walk','hero-walk',4,4],['npc_atlas','npc-sprites',3,2]]) {
  const asset = assets.find(x=>x.id===id), metadata = await sharp(asset.path).metadata(), parts = [];
  for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
    const bounds=asset.cellLocalVisibleBoundsAtAlpha128[row][col];
    const cellX=asset.grid.xCuts?.[col] ?? col*metadata.width/cols;
    const cellY=asset.grid.yCuts?.[row] ?? row*metadata.height/rows;
    const left=Math.max(0,cellX+bounds[0]-3),top=Math.max(0,cellY+bounds[1]-3);
    const width=Math.min(metadata.width-left,bounds[2]-bounds[0]+6),height=Math.min(metadata.height-top,bounds[3]-bounds[1]+6);
    const resized=await sharp(asset.path).extract({left,top,width,height}).resize({height:116,kernel:'nearest'}).png().toBuffer({resolveWithObject:true});
    parts.push({input:resized.data,left:col*128+Math.floor((128-resized.info.width)/2),top:row*128+122-resized.info.height});
  }
  await sharp({create:{width:cols*128,height:rows*128,channels:4,background:'#00000000'}}).composite(parts).webp({lossless:true,effort:6}).toFile(`public/art/${name}.webp`);
}
