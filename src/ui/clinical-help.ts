import type { Card, Option, Run } from '../game/types';
import { fullGraph } from '../game/clinical';
import { advanceClinicalGraph } from '../content/clinical/runtime';

export function clinicalActionHelp(r:Run,card:Card):string|undefined {
  const p=r.patients.find(p=>p.uid===card.patientId);
  if(!card.clinicalGraph||!p?.clinical||p.clinical.nodeId!==card.clinicalGraph.nodeId||p.clinical.outcomeId)return;
  const node=fullGraph(card.clinicalGraph.caseId)?.nodes.find(n=>n.id===card.clinicalGraph!.nodeId);
  if(node?.kind!=='multi')return;
  const count=p.clinical.selected[node.id]?.length??0;
  return `本组已完成 ${count} 项，至少完成 ${node.min} 项，最多 ${node.max} 项。每项单独确认、立即执行并计费，不能撤回。标注「结束本组」的选择会提前进入下一步；其他操作达到最低数量后，可点「本轮操作已完成，继续处理」。`;
}

/** Inspect only whether the authored transition leaves this operation group.
 * Do not disclose its destination, hidden reports or clinical outcome. */
export function clinicalChoiceHelp(r:Run,card:Card|undefined,option:Option):string|undefined {
  const p=r.patients.find(p=>p.uid===card?.patientId),state=p?.clinical;
  if(!card?.clinicalGraph||!state||!option.clinicalChoice||option.interaction==='graph-continue'||state.outcomeId||state.nodeId!==card.clinicalGraph.nodeId)return;
  const graph=fullGraph(card.clinicalGraph.caseId),node=graph?.nodes.find(n=>n.id===state.nodeId);
  if(!graph||node?.kind!=='multi')return;
  const leaves=(success:boolean)=>advanceClinicalGraph(graph,state,option.clinicalChoice!,success).state.nodeId!==state.nodeId;
  const pass=leaves(true),fail=option.check?leaves(false):pass;
  if(pass&&fail)return '这项会结束本组操作；如需补充本组其他检查或沟通，请先完成再选这一项。';
  if(pass)return '检定通过后会结束本组操作；如需补充本组其他事项，请先完成。';
  if(fail)return '检定未通过时会结束本组操作；如需补充本组其他事项，请先完成。';
}
