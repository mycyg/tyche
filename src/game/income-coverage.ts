import type {Run}from './types';
import {RULES}from './rules';

/** Salary days and approved leave are uneven cash-flow dates. Coverage uses
 * earned income already recorded, not an invented daily salary or a loan. */
export function incomeCoverage(r:Pick<Run,'day'|'income'|'incomeHistory'>):{daily:number;days:number;total:number}{
 const days=new Map((r.incomeHistory??[]).filter(x=>x.day<=r.day&&x.day>r.day-RULES.incomeWindow).map(x=>[x.day,x.amount]));
 if(!days.size)return{daily:r.income,days:0,total:r.income};
 const total=[...days.values()].reduce((sum,n)=>sum+n,0);
 return{daily:total/days.size,days:days.size,total};
}
export function recordDailyIncome(r:Pick<Run,'day'|'income'|'incomeHistory'>):void{
 const history=r.incomeHistory??=[];
 if(!history.some(x=>x.day===r.day))history.push({day:r.day,amount:r.income});
}
