import type { Card, Run } from './types';
import type { EventPhase } from '../content/events/types';

export const SHIFT_PHASES: EventPhase[] = ['交班','查房','门诊','结算','夜班','日终'];
export function scenePhase(r: Run, card: Card): EventPhase {
  if (card.shiftPhase) return card.shiftPhase;
  if (card.kind === 'night') return '夜班';
  if (card.kind === 'rest') return '日终';
  if (card.kind === 'ward') return '查房';
  if (card.kind === 'quick') return '门诊';
  if (card.kind === 'clinical') return r.patients.find(p=>p.uid===card.patientId)?.inpatient ? '查房' : '门诊';
  if (card.kind === 'audit') return '交班';
  return '结算';
}
export function orderPendingScenes(r: Run) {
  const completed=r.queue.slice(0,r.cursor);
  const pending=r.queue.slice(r.cursor);
  for(const card of pending) card.shiftPhase ??= scenePhase(r,card);
  pending.sort((a,b)=>SHIFT_PHASES.indexOf(a.shiftPhase!)-SHIFT_PHASES.indexOf(b.shiftPhase!)||
    Number(a.id===`rest:${r.day}`)-Number(b.id===`rest:${r.day}`));
  // Arrival triage must happen before either of its two untouched encounters.
  // Never move a card while a choice is awaiting acknowledgement.
  if(r.phase!=='roll'&&r.phase!=='feedback')for(const scene of [...pending]){
    const triage=scene as Card&{trolley?:{sourceId:string;stage:number;patientIds:string[]}};
    if(scene.shiftPhase!=='夜班'||triage.trolley?.stage!==1||!['TROLLEY-1','TROLLEY-2'].includes(triage.trolley.sourceId))continue;
    const ids=triage.trolley.patientIds;
    if(ids.length!==2||ids.some(id=>{
      const p=r.patients.find(p=>p.uid===id);
      return !p||!p.active||!!p.clinical?.outcomeId||!!p.clinical?.choices.length||!!p.presetResolved||!!r.facts[`night-started:${id}`]||r.journal.some(e=>e.scope.kind==='patient'&&e.scope.id===id&&!!e.operation);
    }))continue;
    const indexes=ids.map(id=>pending.findIndex(c=>c.patientId===id&&c.shiftPhase==='夜班'&&!!(c.clinicalGraph||c.presetNode)));
    if(indexes.some(i=>i<0))continue;
    const before=Math.min(...indexes),current=pending.indexOf(scene);
    if(current>before){pending.splice(current,1);pending.splice(before,0,scene);}
  }
  r.queue=[...completed,...pending];
}
