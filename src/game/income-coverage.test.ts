import {it,expect}from 'vitest';
import {incomeCoverage,recordDailyIncome}from './income-coverage';
import {startRun}from './engine';
import {decode,encode,emptySave,storageRunIssues}from './storage';

it('smooths actual income across salary days and leave without adding fictional cash',()=>{
 const r=startRun('coverage','程医生',[]);const cash=r.cash;
 for(let day=1;day<=7;day++){r.day=day;r.income=day===7?2100:200;recordDailyIncome(r);}
 r.day=8;r.income=0;recordDailyIncome(r);
 expect(incomeCoverage(r)).toEqual({daily:3100/7,days:7,total:3100});expect(r.cash).toBe(cash);
 r.day=9;recordDailyIncome(r);expect(incomeCoverage(r).daily).toBe(2900/7);
});
it('keeps negative performance adjustments but never counts borrowed or gifted cash',()=>{
 const r=startRun('earned-only','程医生',[]);r.day=1;r.income=200;recordDailyIncome(r);r.day=2;r.income=-100;r.cash+=10000;r.debt=10000;recordDailyIncome(r);
 expect(incomeCoverage(r)).toEqual({daily:50,days:2,total:100});
});
it('records each completed day once and does not replace it with the next screen current income',()=>{
 const r=startRun('income-once','程医生',[]);r.income=500;recordDailyIncome(r);r.income=0;recordDailyIncome(r);
 expect(r.incomeHistory).toEqual([{day:1,amount:500}]);expect(incomeCoverage(r).daily).toBe(500);
 const restored=decode(encode({...emptySave(),run:r})).run!;expect(restored).toBeDefined();expect(incomeCoverage(restored)).toEqual(incomeCoverage(r));
});
it('keeps missing legacy history unknown rather than treating fourteen absent days as zero',()=>{
 const r=startRun('legacy-income','程医生',[]);r.day=10;r.income=300;delete r.incomeHistory;
 expect(incomeCoverage(r)).toEqual({daily:300,days:0,total:300});recordDailyIncome(r);expect(incomeCoverage(r)).toEqual({daily:300,days:1,total:300});
});
it('rejects future, duplicate and nonfinite income snapshots',()=>{
 for(const incomeHistory of [[{day:2,amount:20}],[{day:1,amount:20},{day:1,amount:30}],[{day:1,amount:NaN}]]){
  const r=startRun('income-invalid','程医生',[]);r.incomeHistory=incomeHistory;expect(storageRunIssues(r).length).toBeGreaterThan(0);
 }
});
