import type {ButterflyState}from './butterfly';

/** Portraits identify the person in this scene, not the owner of its chain. */
export function butterflySceneActor(chain:Pick<ButterflyState,'chain'|'cursor'|'entrySource'|'receivable'|'facts'>,facts:readonly string[]=chain.facts.map(f=>f.type)):string|undefined{
 const node=chain.cursor.split(':').at(-1);
 if(chain.chain==='BTF-001')return node==='N05'?'nurse':node==='N06'?'chief':['N07','N08'].includes(node??'')?undefined:'peer';
 if(chain.chain==='BTF-002'){
  if(['N04','N05'].includes(node??''))return'rep';
  if(node==='N06')return chain.receivable>0||facts.includes('repayment_received')?'peer':'rep';
  if(node==='N07')return'mother';
  if(node==='N08')return facts.includes('review_opened')?undefined:'chief';
  return'peer';
 }
 if(chain.chain==='BTF-004'){
  if(['N01','N03','N06'].includes(node??''))return'chief';
  if(node==='N05')return chain.entrySource==='department-teaching'?'research':'rep';
  return ['N02','N04'].includes(node??'')?'research':undefined;
 }
 // Patient scenes retain their patient portrait/voice. Named relatives in a
 // quotation are resolved independently by the dialogue segmenter.
 return undefined;
}

export function butterflyResultVoiceActor(choiceId:string,fallback?:string):string|undefined{
 return /BTF-001:N(?:01b|03c)$/.test(choiceId)?'hero':fallback;
}
