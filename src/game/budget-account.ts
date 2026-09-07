import type {Run}from './types';
/** Gross actual deductions, not hypothetical excess and not patient revenue.
 * Historical refunds remain separate: they do not erase a published notice. */
export function chargedBudgetTotal(r:Run):number {
  const regular=r.budgetCharges===undefined?r.patients.reduce((n,p)=>n+Math.max(0,p.charged),0):r.budgetCharges.reduce((n,c)=>n+c.amount,0);
  const eventPatients=(r.authored?.pressureCharges??[]).filter(c=>c.source.endsWith(':event-patient-bill')).reduce((n,c)=>n+c.amount,0);
  return regular+eventPatients;
}
