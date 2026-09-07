import type {Hazard,HazardType,Scope} from './types';

/** Remediation reduces an existing scoped deficiency, never its history or
 * causal flag. Every consumer uses the same accounting, including old saves. */
export function relieveHazards(hazards:Hazard[],scope:Scope,type:HazardType,value:number,source:string,day:number,fromChoice?:string):number {
  let left=Math.max(0,value);
  for(const h of hazards) {
    if(left<=0)break;
    if(h.type!==type||h.scope.kind!==scope.kind||h.scope.id!==scope.id||h.weight<=0||fromChoice&&!h.choiceId.includes(fromChoice))continue;
    const amount=Math.min(left,h.weight);
    h.originalWeight??=h.weight;
    h.weight-=amount;left-=amount;
    (h.mitigations??=[]).push({source,day,amount});
  }
  return Math.max(0,value)-left;
}
