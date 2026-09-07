import type {Card,Patient,Run}from '../../game/types';
import type {EventPhase}from './types';
import {RULES}from '../../game/rules';
import {CASES}from '../../game/catalog';
import {runRandom}from '../../game/run-random';
import {isPlayerResponsibleForPatient}from './clinical-ownership';
import {patientAssessmentComplete}from '../../game/care-completion';

export interface GlucoseTranscriptionCard extends Card {glucoseTranscription:{stage:'report'|'write';reportDay:number};}
export function glucoseTranscriptionCard(r:Run,p:Patient,stage:'report'|'write',reportDay=r.day):GlucoseTranscriptionCard{
 const id=`${r.id}:glucose-transcription:${stage}:${reportDay}:${p.uid}`,t=RULES.handoverTranscription;
 const header={id,kind:'story' as const,chain:'GLUCOSE-HANDOVER',patientId:p.uid,scope:{kind:'patient' as const,id:p.uid},shiftPhase:'结算' as const,glucoseTranscription:{stage,reportDay}};
 if(stage==='report')return{...header,actor:'nurse',title:'晚间的血糖复测',
  text:`姜蓉把${p.name}的复测单放在交班本旁边：“这次的结果出来了，别抄上一回那个。”`,
  options:[{id:`${id}:read`,label:'查看本次复测单',ap:0,minutes:0,cost:0,mechanics:{operation:'observe'},
   effects:{flags:[`glucose-report:${p.uid}:${reportDay}`]},result:`第 ${reportDay} 天晚间复测：血糖 16.1 mmol/L。原单已夹入${p.name}的病历，待记入交班本。`}],
 };
 const correct={flags:[`glucose-transcribed:${p.uid}:${reportDay}`]},wrong={flags:[`glucose-transcription-error:${p.uid}:${reportDay}`]};
 return{...header,title:'交班本还差一行',text:`${p.name}第 ${reportDay} 天的复测结果已经读过。交班本的血糖栏空着，原单夹在病历里。`,options:[
  {id:`${id}:verify`,label:'翻出原单核对，写入交班本',ap:t.carefulAp,minutes:t.carefulMinutes,cost:0,mechanics:{operation:'record'},effects:correct,
   result:'你对照原单，把血糖写为 16.1 mmol/L，并记下本次复测时间。'},
  {id:`${id}:memory`,label:'不翻原单，凭印象填写',ap:0,minutes:t.memoryMinutes,cost:0,mechanics:{operation:'record'},effects:{...correct,emotion:-t.memoryEmotion},
   result:'你把血糖写为 16.1 mmol/L，合上交班本。',
   check:{skill:'record',dc:t.dc,purpose:'记准复测数值',failure:{...wrong,emotion:-t.memoryEmotion},failureText:'你在交班本上把血糖写成 6.1 mmol/L，合上本子。病历里的复测原单仍是 16.1 mmol/L。'}},
 ]};
}

/** This is a new dated monitoring result, not a replacement for an earlier
 * diagnostic report. It never completes treatment or creates clinical harm. */
export function pendingGlucoseTranscription(r:Run,phase:EventPhase):GlucoseTranscriptionCard|undefined{
 const s=r.authored,t=RULES.handoverTranscription;
 if(!s||phase!=='结算'||r.day<t.start||r.day>t.end||Object.values(s.published).some(c=>'glucoseTranscription'in c)
  ||runRandom(r,`glucose-transcription:${r.day}`)>=t.chance)return;
 const p=r.patients.find(p=>{
  const c=p.preset??CASES.find(c=>c.id===p.caseId),history=c?.history.join(' ')??'';
  return p.active&&p.inpatient&&p.damage<2&&patientAssessmentComplete(p)&&p.caredDay===r.day&&isPlayerResponsibleForPatient(r,p)
   &&(c?.age??0)>=18&&/糖尿病|高血糖/.test(history)&&!/无糖尿病|否认糖尿病/.test(history);
 });
 return p?glucoseTranscriptionCard(r,p,'report'):undefined;
}
