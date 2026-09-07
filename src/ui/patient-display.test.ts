import { describe, expect, it } from 'vitest';
import { startRun } from '../game/engine';
import { createPatient } from '../game/cards';
import { initialGraphState, getClinicalGraph } from '../content/clinical';
import { patientDisplay } from './patient-display';
import { priorShiftHandover } from './record-notes';

describe('patient location and duration copy', () => {
  it('shows an actual discharge as a finished record, not a new emergency place', () => {
    const r=startRun('record-place','程医生',[]),p=createPatient(r,'C013','display');
    p.active=false;p.bed=0;p.inpatient=true;p.admitted=1;p.dischargedDay=3;r.day=10;
    expect(patientDisplay(r,p)).toMatchObject({status:'已出院',place:'已出院 · 病历记录',stay:3,duration:'本次住院 3 天'});
  });
  it('uses the last actual clinical action date and ignores later telephone or billing entries', () => {
    const r=startRun('transfer-display','程医生',[]),p=createPatient(r,'C013','display');
    p.clinical=initialGraphState(getClinicalGraph('C013')!,r.seed);
    Object.assign(p.clinical,{choices:['s5_transfer','s6_record'],flags:['transferred'],outcomeId:'o_good'});
    p.active=false;p.inpatient=false;p.bed=0;p.admitted=1;r.day=14;
    r.journal=[{id:`${p.uid}:graph:s6_record:0`,day:2,title:'记录',choice:'记录转运',result:'已完成。',scope:{kind:'patient',id:p.uid},flags:[]},
      {id:'later-call',day:7,title:'回访',choice:'电话',result:'已联系。',scope:{kind:'patient',id:p.uid},flags:[]}];
    expect(patientDisplay(r,p)).toMatchObject({status:'已转院',stay:2,lastDay:2});
    r.journal=[];
    expect(patientDisplay(r,p)).toMatchObject({stay:undefined,duration:'结束日期未登记'});
  });
  it('does not treat a past discharge as the end date of a real readmission', () => {
    const r=startRun('return-display','程医生',[]),p=createPatient(r,'C013','display');
    p.active=p.inpatient=true;p.admitted=3;p.dischargedDay=2;p.readmitted=true;r.day=5;
    expect(patientDisplay(r,p)).toMatchObject({status:'在院',stay:3,duration:'住院第 3 天'});
  });
  it('labels source handovers without inventing a normal lab result or a player examination', () => {
    expect(priorShiftHandover({uid:'D1-C-067-census0'})).toContain('不能据此认定化验已恢复正常');
    expect(priorShiftHandover({uid:'D2-C-001-handover1'})).toContain('需要核实');
    expect(priorShiftHandover({uid:'D1-C-067-patient'})).toBeUndefined();
  });
});
