import type {Run,Scope}from '../../game/types';
function modifier(r:Run,target:string,scope?:Scope):number{return(r.authored?.ledger.modifiers??[]).filter(m=>m.target===target&&m.starts<=r.day&&m.expires>=r.day&&(!scope||m.scope.kind===scope.kind&&m.scope.id===scope.id)).reduce((n,m)=>n+(m.value??0),0);}
export const courtPreparationModifier=(r:Run,skill:'record'|'endure')=>modifier(r,`court-preparation:${skill}`);
export const paperDefenseModifier=(r:Run,scope:Scope)=>modifier(r,'paper-defense',scope);
export const historyEventModifier=(r:Run,scope:Scope)=>modifier(r,'history-check',scope);
export const paperStepCredit=(r:Run,scope:Scope)=>Math.min(1,Math.max(0,modifier(r,'paper-step-credit',scope)));
