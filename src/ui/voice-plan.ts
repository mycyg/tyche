import {pronounce} from './voice-text';

export interface VoiceClip {file:string;text:string;speaker:string;version?:string}
export function voiceAssetUrl(base:string,clip:Pick<VoiceClip,'file'|'version'>,directory='voice'):string {
 return `${base}audio/${directory}/${clip.file}${clip.version?`?v=${encodeURIComponent(clip.version)}`:''}`;
}
interface Node {next:Map<string,Node>;clip?:VoiceClip}
const ignored=/[\s，,。；;！!？?、：:·“”「」『』（）()【】\[\]]/g;
/** Keep comparisons, units and negations. Only phrasing punctuation may be
 * crossed when a dynamic line is assembled from its authored fragments. */
const content=(s:string)=>pronounce(s).replace(ignored,'');
export function createVoicePlanner(catalog:Record<string,VoiceClip>) {
 const voices=new Map<string,Node>();
 for(const clip of Object.values(catalog)){
  const key=content(clip.text);if(!key)continue;
  let node:Node=voices.get(clip.speaker)??{next:new Map()};voices.set(clip.speaker,node);
  for(const character of key){let next:Node|undefined=node.next.get(character);if(!next){next={next:new Map()};node.next.set(character,next);}node=next;}
  node.clip??=clip;
 }
 return (text:string,speaker='narrator'):VoiceClip[]|undefined=>{
  const value=content(text),memo=new Map<number,VoiceClip[]|undefined>();
  const solve=(offset:number):VoiceClip[]|undefined=>{
   if(offset===value.length)return [];
   if(memo.has(offset))return memo.get(offset);
   const candidates:{end:number;clip:VoiceClip;voice:number}[]=[];
   for(const [rank,name] of [...new Set([speaker,'narrator'])].entries()){
    let node=voices.get(name);if(!node)continue;
    for(let end=offset;end<value.length;end++){node=node.next.get(value[end]);if(!node)break;if(node.clip)candidates.push({end:end+1,clip:node.clip,voice:rank});}
   }
   candidates.sort((a,b)=>b.end-a.end||a.voice-b.voice);
   for(const candidate of candidates){const rest=solve(candidate.end);if(rest){const result=[candidate.clip,...rest];memo.set(offset,result);return result;}}
   memo.set(offset,undefined);return undefined;
  };
  return solve(0);
 };
}
