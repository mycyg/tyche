import {describe,it,expect} from 'vitest';
import {act,startRun} from './engine';
import {createPatient} from './cards';
import {decode,encode,emptySave} from './storage';
import {eventToCard,EVENT_BY_ID} from '../content/events';
import {patientPayment} from './costs';

describe('actual budget deductions',()=>{
  it('executes E171 split through the engine and offsets only subsequent spending',()=>{
    let r=startRun('actual-split-invoice','程医生',[]);
    const p=createPatient(r,'C013','claim-ledger');
    p.active=p.inpatient=true;p.budget=p.initialBudget=5000;p.spent=8000;p.charged=3000;r.patients.push(p);
    const card=eventToCard(EVENT_BY_ID['E-171'],{instanceId:'actual-split',scope:{kind:'patient',id:p.uid},patientId:p.uid,day:1,phase:'结算'});
    r.phase='play';r.shiftPhase='结算';r.cursor=0;r.queue=[card];
    const before={cash:r.cash,admitted:p.admitted,bed:p.bed};
    r=act(r,{type:'choose',id:card.options.find(o=>o.id.endsWith(':E-171-c'))!.id});
    expect(r.authored!.billingEpisodes).toHaveLength(1);
    expect(r.patients.find(x=>x.uid===p.uid)).toMatchObject({spent:8000,charged:3000,admitted:before.admitted,bed:before.bed,active:true,inpatient:true});
    expect(r.cash).toBe(before.cash);
    for(const [index,cost,expectedPayment] of [[0,600,0],[1,4400,0],[2,600,600]]){
      r.phase='play';delete r.feedback;r.shiftPhase='查房';r.cursor=0;
      const option={id:`post-split-${index}`,label:'安排后续治疗',ap:0,minutes:0,cost,result:'治疗费用已记账。',effects:{}};
      r.queue=[{id:`invoice-${index}`,kind:'ward',title:'后续治疗',text:'药房送来本次账单。',patientId:p.uid,scope:{kind:'patient',id:p.uid},options:[option]}];
      const patient=r.patients.find(x=>x.uid===p.uid)!;
      expect(patientPayment(r,patient,option).personal).toBe(expectedPayment);
      const cash=r.cash;r=act(r,{type:'choose',id:option.id});
      expect(r.cash).toBe(cash-expectedPayment);
      expect(decode(encode({...emptySave(),run:r})).run).toEqual(r);
    }
    expect(r.patients.find(x=>x.uid===p.uid)).toMatchObject({spent:13600,charged:3600});
    expect(r.budgetCharges).toEqual([{day:1,amount:600,patientId:p.uid,source:'post-split-2'}]);
  });
  it('records only new doctor deductions, once, with the actual patient and choice',()=>{
    const r=startRun('budget-charge-ledger','程医生',[]),p=createPatient(r,'C013','charge-ledger');
    p.spent=0;p.budget=100;p.initialBudget=100;p.charged=0;r.patients.push(p);
    r.phase='play';r.shiftPhase='查房';r.cursor=0;
    r.queue=[{id:'actual-invoice',kind:'clinical',shiftPhase:'查房',title:'检查',text:'检查已安排',patientId:p.uid,scope:{kind:'patient',id:p.uid},last:false,
      options:[{id:'actual-invoice-choice',label:'安排检查',ap:0,minutes:0,cost:160,result:'收到检查账单。',effects:{}}]}];
    const done=act(r,{type:'choose',id:'actual-invoice-choice'});
    expect(done.budgetCharges).toEqual([{day:1,amount:60,patientId:p.uid,source:'actual-invoice-choice'}]);
    expect(done.cash).toBe(r.cash-60);
    expect(act(done,{type:'choose',id:'actual-invoice-choice'})).toBe(done);
    expect(decode(encode({...emptySave(),run:done})).run).toEqual(done);
  });
  it('does not call a coffee purchase or borrowing a new medical deduction',()=>{
    const r=startRun('coffee-is-not-insurance','程医生',[]);
    expect(act(r,{type:'coffee'}).budgetCharges??[]).toEqual([]);
    expect(act(r,{type:'borrow'}).budgetCharges??[]).toEqual([]);
  });
});
