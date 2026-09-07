import type {Card,Effects}from './types';

/** A refund or refusal is not acceptance merely because the speaker is a rep. */
export function isRepresentativeBenefit(card:Card|undefined,e:Effects):boolean{
 return card?.actor==='rep'&&((e.cash??0)>0||(e.income??0)>0||(e.cashPressure??0)<0);
}
