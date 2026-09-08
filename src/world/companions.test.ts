import { describe, expect, it } from 'vitest';
import type { Patient } from '../game/types';
import { companionCarePriority, patientCompanions } from './companions';
const patient = (companion: string, age = 35): Patient => ({ caseId: 'C-002', preset: { age, sex: '男', companion } } as Patient);
describe('companions follow the medical record', () => {
  it('does not turn an absent or telephone contact into a visitor', () => {
    for (const text of ['无', '本人', '患者', '患儿', '子女（电话）', '远程家属', '']) expect(patientCompanions(patient(text))).toEqual([]);
  });
  it('uses the named full-case family member and the stated waiting place', () => {
    expect(patientCompanions({ caseId: 'C008' } as Patient)).toMatchObject([{ role: '父亲', sex: '男', ageGroup: 'adult' }]);
    expect(patientCompanions({ caseId: 'C005' } as Patient)).toMatchObject([{ role: '母亲', sex: '女', outside: true }]);
  });
  it('keeps parents distinct and renders grandparents as older adults', () => {
    expect(patientCompanions(patient('父母', 9)).map(p => p.sex)).toEqual(['女', '男']);
    expect(patientCompanions(patient('祖母', 7))).toMatchObject([{ sex: '女', ageGroup: 'older' }]);
    expect(patientCompanions(patient('母亲', 45))).toMatchObject([{ sex: '女', ageGroup: 'older' }]);
    expect(patientCompanions(patient('儿子', 72))).toMatchObject([{ sex: '男', ageGroup: 'adult' }]);
  });
  it('uses a neutral appearance when the record does not specify gender', () => {
    for (const role of ['配偶', '朋友', '护工', '同事', '子女']) expect(patientCompanions(patient(role))[0].sex).toBe('unknown');
    expect(patientCompanions(patient('同学', 14))[0].ageGroup).toBe('young');
  });
  it('does not populate every adult bed merely because a family contact is listed', () => {
    for (const role of ['子女','配偶','朋友','母亲','同事']) expect(companionCarePriority(patient(role,72))).toBe(0);
    expect(companionCarePriority(patient('母亲',8))).toBeGreaterThan(0);
    expect(companionCarePriority(patient('护工',72))).toBeGreaterThan(0);
  });
});
