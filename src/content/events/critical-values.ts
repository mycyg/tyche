import type {Patient,Run}from '../../game/types';
/** Authored critical values are separate dated reports, not retroactive edits
 * of the patient's preset findings or full clinical graph. */
export function authoredPatientReports(r:Run,p:Patient):{id:string;title:string;full:string}[]{
 return r.journal.filter(e=>e.scope.kind==='patient'&&e.scope.id===p.uid&&e.id.endsWith(':critical-report')&&e.flags.includes(`critical-potassium-received:${p.uid}`)).map(e=>({id:e.id,title:`第${e.day}天 · 检验科危急值通知`,full:e.result}));
}
