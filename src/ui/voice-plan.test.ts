import {describe,expect,it} from 'vitest';
import {createVoicePlanner,voiceAssetUrl,type VoiceClip} from './voice-plan';
const clip=(text:string,speaker='narrator'):VoiceClip=>({file:`${speaker}-${text}.mp3`,text,speaker});
const plan=(lines:VoiceClip[])=>createVoicePlanner(Object.fromEntries(lines.map((x,i)=>[String(i),x])));
describe('offline voice composition',()=>{
 it('changes the request URL when the same named recording is replaced',()=>{
  const old={...clip('核对床号'),version:'old'},next={...old,version:'new'};
  expect(voiceAssetUrl('/tyche/',old)).not.toBe(voiceAssetUrl('/tyche/',next));
  expect(voiceAssetUrl('/tyche/',next)).toBe('/tyche/audio/voice/narrator-核对床号.mp3?v=new');
  expect(voiceAssetUrl('/tyche/',clip('核对床号'))).toBe('/tyche/audio/voice/narrator-核对床号.mp3');
  expect(plan([next])('核对床号')?.[0].version).toBe('new');
 });
 it('assembles a dynamic name and amount without dropping any words',()=>{
  const read=plan(['韩峻','的诊疗费为','一','千','八','百','元'].map(s=>clip(s)));
  expect(read('韩峻的诊疗费为¥1,800。')?.map(c=>c.text)).toEqual(['韩峻','的诊疗费为','一','千','八','百','元']);
 });
 it('never silently skips an unknown word or a negation',()=>{
  const read=plan([clip('已经排除风险')]);expect(read('尚未排除风险')).toBeUndefined();
 });
 it('keeps explicit comparisons rather than treating them as punctuation',()=>{
  const read=plan([clip('血糖'),clip('小于'),clip('三')]);expect(read('血糖<3')?.length).toBe(3);expect(read('血糖>3')).toBeUndefined();
 });
 it('backtracks when a locally longer clip would strand the rest of a sentence',()=>{
  const read=plan([clip('你已经'),clip('你'),clip('已经接过电话')]);expect(read('你已经接过电话')?.map(c=>c.text)).toEqual(['你','已经接过电话']);
 });
 it('prefers the requested character for equal-length recordings',()=>{
  const read=plan([clip('先核对床号'),clip('先核对床号','nurse')]);expect(read('先核对床号。','nurse')?.[0].speaker).toBe('nurse');
 });
});
