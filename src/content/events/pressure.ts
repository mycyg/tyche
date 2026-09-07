import type {Run}from '../../game/types';

export interface PressureState{
 pressure:number;
 pressureCharges?:{day:number;amount:number;source:string}[];
 pressureBackground?:{raw:number;value:number};
}
/** Salary/insurance deductions are gross facts on their actual charge day.
 * Later reimbursement does not erase the recent experience of that deduction. */
export function pressureFinancialBasis(r:Run,s:PressureState=r.authored??{pressure:0}):number{
 const inWindow=(charge:{day:number})=>charge.day>=r.day-2&&charge.day<=r.day;
 return r.debt/500+([...r.budgetCharges??[],...s.pressureCharges??[]].filter(inWindow).reduce((sum,c)=>sum+c.amount,0))/200;
}
function backgroundValue(r:Run,s:PressureState):number{
 const raw=pressureFinancialBasis(r,s),previous=s.pressureBackground;
 return Math.max(0,Math.min(raw,(previous?.value??0)+raw-(previous?.raw??0)));
}
export function authoredCashPressure(r:Run,s:PressureState=r.authored??{pressure:0}):number{
 return Math.max(0,Math.min(100,s.pressure+backgroundValue(r,s)));
}
/** Apply actual relief/decay to the existing pressure, never bank a reduction
 * before pressure exists. New deductions and new debt still add new pressure. */
export function changeCashPressure(r:Run,s:PressureState,delta:number):Pick<PressureState,'pressure'|'pressureBackground'>{
 if(delta>=0)return{pressure:Math.min(100,s.pressure+delta),pressureBackground:{raw:pressureFinancialBasis(r,s),value:backgroundValue(r,s)}};
 const familyReduction=Math.min(s.pressure,-delta);
 return{pressure:s.pressure-familyReduction,pressureBackground:{raw:pressureFinancialBasis(r,s),value:Math.max(0,backgroundValue(r,s)-(-delta-familyReduction))}};
}
export const PRESSURE_CHARGE_EVENTS=['E-156','E-158','E-161','E-163','E-166','E-169','E-171','E-176','E-179','E-111']as const;
