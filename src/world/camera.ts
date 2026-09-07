import {WORLD,type Point} from './navigation';
/** Keep people readable on narrow viewports; the camera reveals the rest of the
 * room as the doctor walks instead of shrinking an entire floor to phone size. */
export function worldCamera(player:Point,width:number,height:number,zoom=1){
 const scale=Math.max(1.35,width/WORLD.width,height/WORLD.height,Math.min(2.4,width/700))*zoom;
 const viewW=width/scale,viewH=height/scale;
 return {x:Math.max(0,Math.min(WORLD.width-viewW,player.x-viewW/2)),y:Math.max(0,Math.min(WORLD.height-viewH,player.y-viewH*.49)),scale};
}
