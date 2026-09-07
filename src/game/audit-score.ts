import type {Run}from './types';
/** Q counts decisions, not individual fields. Remediation cannot erase that a
 * decision occurred; repeat render/rollback must not count it twice. */
export function auditScore(r:Run):number {
  const groups=new Map<string,{causal:boolean;concealed:boolean}>();
  for(const h of r.hazards){const key=h.choiceId||h.id,old=groups.get(key)??{causal:false,concealed:false};old.causal||=h.causal;old.concealed||=/隐瞒|篡改|覆盖原|销毁|统方|回扣|不实|虚构|利益交换/.test(`${h.reason} ${h.choice}`);groups.set(key,old);}
  for(const [key,value]of Object.entries(r.facts))if(/(?:^|:)(?:prescriptions?-exported|kickback-received|tampered|药代-4统方|药代-5回扣|篡改)(?::|$)/.test(key)){
    const g=groups.get(value.source)??{causal:false,concealed:true};g.concealed=true;groups.set(value.source,g);
  }
  return [...groups.values()].reduce((sum,g)=>sum+1+Number(g.causal)+2*Number(g.concealed),0);
}
