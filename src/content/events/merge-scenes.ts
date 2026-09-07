import type {Card}from '../../game/types';
import type {ButterflyMergeCard,ButterflyCard}from '../../game/director';

/** New merges own exact scene IDs. Old saves retain their original coarse
 * chain binding until that already-published encounter has been resolved. */
export function mergeClaimsScene(merge:Card,source:Card):boolean {
 if(!('butterflyMerge'in merge))return false;
 const data=(merge as ButterflyMergeCard).butterflyMerge;
 if(data.claimedSceneIds)return data.claimedSceneIds.includes(source.id);
 return 'butterfly'in source&&data.chainStateIds.includes((source as ButterflyCard).butterfly.chainStateId);
}
