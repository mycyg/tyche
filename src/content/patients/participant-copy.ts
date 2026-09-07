import type {Option,Scene} from '../../game/types';
import type {PatientEntity} from './types';
import {entityScenario} from './scenarios';
import {ENTRY_HISTORY_CHECKS,isPrivateEntryHistory} from './entry-copy';

/** Only generic dialogue is projected. A minor remains the subject of physical
 * findings; an accompanying adult is not automatically granted signing rights. */
export function minorDialogue(entity:PatientEntity){
 if(entity.ageYears>=18)return;
 const context=entityScenario(entity),present=!context.alone;
 const listener=present?entity.companion.replace(/[（(]录音者[）)]/g,''):'监护人';
 const authorization=context.roles.has('parent')?'监护人的具体决定':'监护人授权或紧急备案的具体事项';
 return {listener,authorization,present};
}
export function projectParticipantOption(saved:Option,entity:PatientEntity):Option{
 const role=minorDialogue(entity);if(!role)return saved;
 const {listener,authorization}=role;
 let o={...saved};
 if(o.id.endsWith(':entry:history')&&!isPrivateEntryHistory(o.id)&&o.mechanics?.operation==='history'&&Object.keys(ENTRY_HISTORY_CHECKS).some(id=>o.id.startsWith(`preset:${id}:`))){
  o.mechanics={...o.mechanics,actor:'family'};
 }
 if(o.id.endsWith(':communication:explain')){
  o.label=`${role.present?'向':'联系'}${listener}讲清风险、可选安排和费用，请对方复述`;
  o.result=o.result.replace('患者复述了下一步安排。你记录了已说明的风险与本人决定：',`${listener}复述了下一步安排。你记录了告知内容与${authorization}：`);
  if(entity.ageYears>=6&&!o.result.includes('同时听取患儿能够表达的感受与疑问。'))o.result+='你同时听取患儿能够表达的感受与疑问。';
  if(o.check)o.check={...o.check,purpose:`确认${listener}理解照护安排与风险`,failureHint:`${listener}尚未完整理解安排，需要补充说明。`,failureText:`${listener}仍有顾虑，没有完整复述后续安排。此前的治疗仍然有效，你还需要把告知内容说明白。`};
  o.mechanics={...o.mechanics,operation:o.mechanics?.operation??'comfort',actor:'family',quality:o.mechanics?.quality??'correct'};
 }else if(o.id.endsWith(':communication:refusal')){
  o.label='核实监护人决定或备案依据，记录具体拒绝并落实替代支持';
  o.result='记录写明拒绝的项目、已说明的风险、监护人权限或备案依据，以及仍继续提供的照护。一般陪同者不能仅凭陪诊关系代签。';
  o.mechanics={...o.mechanics,operation:o.mechanics?.operation??'refusal-signature',actor:'family',quality:o.mechanics?.quality??'correct'};
 }else if(o.id.endsWith(':communication:promise')){
  o.result=o.result.replace('患者记住了',`${listener}记住了`);
 }else if(o.id.endsWith(':investigate:verbal')){
  o.label=`先向${listener}与原接诊人核对，暂缓新增检查`;
  o.mechanics={...o.mechanics,operation:'history',actor:'family',quality:o.mechanics?.quality??'correct'};
 }else if(o.id.endsWith(':handoff:complete')){
  o.result=o.result.replace('本人决定',authorization);
 }else if(o.id.endsWith(':echo:closed')){
  o.result=o.result.replace('患者知道下一次该找谁',`${listener}知道下一次该找谁`);
 }
 return o;
}
export function projectParticipantScene<T extends Scene>(scene:T,entity:PatientEntity):T{
 const role=minorDialogue(entity);if(!role)return scene;
 let text=scene.text,title=scene.title;
 if(scene.id.endsWith(':communication')||scene.id.includes(':communication:visit:')){
  title=title.replace('患者的决定','家属沟通与决定');
  text=text.replace('处置计划需要患者理解。',`处置计划需要向${role.listener}说明。`).replace('患者还关心费用、能否回家，以及谁负责接下来的照护。','你需要说清费用、能否回家，以及接下来的照护安排。');
  if(entity.ageYears>=6&&!text.includes('患儿能够参与的说明与决定'))text+='患儿能够参与的说明与决定，仍应听取本人意见。';
  if(!entityScenario(entity).roles.has('parent')&&!text.includes('陪同关系不等于监护人授权'))text+='陪同关系不等于监护人授权，签字须核实权限或紧急备案。';
 }else if(scene.id.endsWith(':echo')||scene.id.includes(':echo:visit:'))text=text.replace('患者也有了回应',`${role.listener}也反馈了照护情况`);
 return {...scene,title,text,options:scene.options.map(o=>projectParticipantOption(o,entity))};
}
