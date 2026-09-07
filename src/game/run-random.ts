import {die,random,shuffled} from './random';

export type RunRandomContext={id:string;seed:string};
/** Identity stays unique in storage/ledgers. Only the exact current run ID is
 * normalized in random inputs; no timestamp guessing or source-ID rewriting. */
export function runRandomKey(r:Pick<RunRandomContext,'id'>,key:string):string {
 return r.id?key.split(r.id).join('@current-run'):key;
}
export const runRandom=(r:RunRandomContext,key:string)=>random(r.seed,runRandomKey(r,key));
export const runDie=(r:RunRandomContext,key:string)=>die(r.seed,runRandomKey(r,key));
export const runShuffled=<T>(r:RunRandomContext,items:readonly T[],key:string):T[]=>shuffled([...items],r.seed,runRandomKey(r,key));
