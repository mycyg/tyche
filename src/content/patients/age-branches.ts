import type { Scene } from '../../game/types';

/** C-151's second trap is expressly the source's under-eight variant, not a
 * general penalty for every school-age patient. Original source stays intact. */
export function projectPresetAgeBranches<T extends Scene>(scene:T,presetId:string,age:number):T {
  if(presetId!=='C-151')return scene;
  const hasAgeVariant=scene.options.some(o=>o.id.endsWith(':decision:trap-2'));
  const hasAgeOnlyRescue=age>=8&&scene.options.some(o=>o.id.endsWith(':rescue:defer'));
  if(!hasAgeVariant&&!hasAgeOnlyRescue)return scene;
  return {...scene,options:scene.options.flatMap(option=>{
    // Only the under-eight medication branch creates this injury. The
    // documentation-only rescue remains available for the older child.
    if(age>=8&&option.id.endsWith(':rescue:defer'))return [];
    if(!option.id.endsWith(':decision:trap-2'))return [option];
    if(age>=8)return [];
    return [{...option,label:option.label.replace(/<\s*8\s*岁变体/,'未满 8 岁的患儿')}];
  })};
}
