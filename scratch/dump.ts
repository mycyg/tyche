import {AUTHORED_EVENTS,EVENT_BY_ID} from '../src/content/events/catalog';
const ids=process.argv.slice(2);
for(const id of ids){
  const e=EVENT_BY_ID[id];
  if(!e){console.log(id,'MISSING');continue;}
  console.log('##',e.id,e.title,'phases',e.phases.join('/'),'scope',e.scopeKind,'group',e.exclusiveGroup??'-','repeatable',e.repeatable,'quals',JSON.stringify(e.requiredQualifiers));
  for(const o of e.options){
    console.log('  ',o.id,'ap',o.ap,'| effects',JSON.stringify(o.effects),'| failTotal',JSON.stringify(o.failureTotal??null));
    console.log('     check',JSON.stringify(o.check??null));
    console.log('     deferred',JSON.stringify(o.deferred),'| mods',JSON.stringify(o.modifiers));
    console.log('     hint',JSON.stringify(o.hint),'| facts',JSON.stringify(o.emittedFacts));
  }
  console.log();
}
console.log('total',AUTHORED_EVENTS.length);
