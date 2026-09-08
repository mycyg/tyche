import type {Card,Patient,Run}from '../../game/types';
import {CASES}from '../../game/catalog';
import {getClinicalGraph}from '../clinical';
import {ENTITY_BY_ID}from '../patients';
import {entityScenario,type CompanionRole}from '../patients/scenarios';
/** Editorial identity constraints come from the actual speaker in each source,
 * not a generic “a patient exists” flag. Novel event actions remain new facts. */
export const PATIENT_EVENT_IDENTITY_RULES={
 'E-001':'成年患者，实际有女儿陪同','E-002':'实际有儿子与护工在场','E-003':'成年男性，实际有妻子陪同','E-004':'老年女性，实际有子女在场','E-009':'已有饮酒十年的记录','E-012':'老年住院患者','E-016':'老年认知障碍患者','E-021':'老年男性，有家属在场','E-030':'成年男性，实际有妻子陪同','E-031':'老年住院患者，同房另有实际吸氧者','E-032':'已到入园年龄的儿童，实际由母亲陪同','E-033':'仍在妊娠、因呼吸道症状就诊且丈夫在场','E-037':'青年住院患者',
}as const;
export function patientCanSpeak(p:Patient):boolean{
 const c=p.preset??CASES.find(c=>c.id===p.caseId);if(!c)return false;
 const recovered=p.clinical?.flags.some(f=>['pt_awake','fully_awake','consciousness_recovered','aphasia_resolved'].includes(f));
 const graph=getClinicalGraph(p.caseId),presentation=graph?.presentation;
 const observed=[c.complaint,...c.history,...c.findings,...presentation?[presentation.complaint,...presentation.history,presentation.appearance]:[]].join('；').split(/[；。]/).filter(s=>!/^\s*(?:无|否认|未见|没有)/.test(s)).join('；');
 return !!recovered||!/失语|无法言语|不能说话|不能说出完整句子|言语含糊|言语不清|说话含糊|说话含混|说话不清|构音障碍|昏迷|意识不清|呼之不应|呼叫无反应/.test(observed);
}
export function projectPatientSpeaker(card:Card,p:Patient):Card{
 if(!('authoredEventId'in card)||card.authoredEventId!=='E-019'||patientCanSpeak(p))return card;
 return{...card,text:`${p.name}目前不能清楚表达。陪同的家属看了看你的胸牌：「你是规培的吧？能不能请一位有经验的医生过来？」`,options:card.options.map(o=>({...o,result:o.result.replaceAll('患者','家属'),check:o.check?{...o.check,failureText:o.check.failureText.replaceAll('患者','家属')}:undefined}))};
}
export function patientIdentityMatches(eventId:string,r:Run,p:Patient):boolean{
 const c=p.preset??CASES.find(c=>c.id===p.caseId);if(!c)return false;
 const e=p.preset?.entityProfile??(p.entityId?ENTITY_BY_ID.get(p.entityId):undefined),scenario=e?entityScenario(e):undefined;
 const history=c.history.join(' '),has=(role:CompanionRole)=>scenario?scenario.roles.has(role):({daughter:/女儿/,son:/儿子/,spouse:/妻子|丈夫|配偶/,mother:/母亲|妈妈/,family:/家属|妻子|丈夫|母亲|父亲|子女|女儿|儿子/,child:/子女|女儿|儿子/}as Partial<Record<CompanionRole,RegExp>>)[role]?.test(history)??false;
 if(['E-001','E-003','E-006','E-007','E-008','E-009','E-012','E-014','E-019','E-020','E-023','E-025','E-026','E-027','E-030','E-034','E-038'].includes(eventId)&&!patientCanSpeak(p))return eventId==='E-019'&&has('family');
 if(['E-006','E-007','E-009','E-019','E-020','E-023','E-025','E-026','E-027','E-030','E-034','E-038','E-172'].includes(eventId)&&c.age<12)return false;
 if(eventId==='E-001')return c.age>=18&&has('daughter');
 if(eventId==='E-014')return c.age>=18;
 if(eventId==='E-038')return /腰痛|腰背痛|腰疼/.test(c.complaint);
 if(eventId==='E-034')return c.age>=18;
 if(eventId==='E-002')return has('son');
 if(eventId==='E-003'||eventId==='E-030')return c.age>=18&&c.sex==='男'&&has('spouse');
 if(eventId==='E-004')return c.age>=65&&c.sex==='女'&&has('child');
 if(eventId==='E-009')return c.age>=28&&/饮酒.*(?:十|10)年|(?:十|10)年.*饮酒/.test(history+' '+r.journal.filter(j=>j.scope.id===p.uid).map(j=>j.result).join(' '));
 if(['E-012','E-016','E-031'].includes(eventId))return c.age>=65&&p.inpatient;
 if(eventId==='E-021')return c.age>=65&&c.sex==='男'&&has('family');
 if(eventId==='E-032')return c.age>=3&&c.age<18&&has('mother');
 if(eventId==='E-033')return c.sex==='女'&&scenario?.pregnancy?.state==='pregnant'&&has('spouse')&&/咳嗽|湿啰音/.test(c.complaint+' '+history);
 if(eventId==='E-037')return c.age>=18&&c.age<=40&&p.inpatient;
 return true;
}
