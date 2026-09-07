import {describe,it,expect} from 'vitest';
import {CASE_PRESETS,PATIENT_ENTITIES,compatibleEntities} from '../content/patients';
import {patientArt,patientArtFile,patientArtIndex} from './patients';
import type {InstantiatedPreset} from '../content/patients';
import {CASES} from '../game/catalog';
import {CLINICAL_IDENTITIES,patientAgeLabel} from '../content/clinical/identity';
const identity=(age:number,sex:'男'|'女',flags:string[]=[])=>({caseId:'C-001',preset:{age,sex,entityProfile:{id:'fixture',ageYears:age,sex,flags}} as InstantiatedPreset});
describe('patient identity artwork',()=>{
  it('matches all original case identities to compatible portraits without changing physical atlas frames',()=>{
    const femaleOriginal=new Set([3,4,6,9,10,13,17,18]),femaleExtended=new Set([1,4,5,6,7]);
    for(const c of CASES){const art=patientArt({caseId:c.id});expect(c).toMatchObject({age:CLINICAL_IDENTITIES[c.id].age,sex:CLINICAL_IDENTITIES[c.id].sex});expect((art.atlas==='original'?femaleOriginal:femaleExtended).has(art.index)).toBe(c.sex==='女');expect(patientArtIndex(c.id)).toBe(Number(c.id.slice(1))-1);}
    expect(patientArt({caseId:'C003'})).toMatchObject({atlas:'original',index:3});expect(patientArt({caseId:'C009'})).toMatchObject({atlas:'original',index:3});
    expect(patientArt({caseId:'C008'})).toMatchObject({atlas:'extended',index:1});expect(patientArt({caseId:'C019'})).toMatchObject({atlas:'extended',index:7});
    expect(Number.isFinite(patientArtIndex('C-001'))).toBe(true);
  });
  it('keeps infant and toddler ages intelligible and preserves the family encounter identity',()=>{
    expect(patientAgeLabel(14/12)).toBe('14 个月');expect(patientAgeLabel(7/12)).toBe('7 个月');expect(patientAgeLabel(2.25)).toBe('2 岁 3 个月');expect(patientAgeLabel(2+4/12)).toBe('2 岁 4 个月');
    expect(CLINICAL_IDENTITIES.C019.members).toEqual(['父亲，42岁','母亲，39岁，孕24周','女儿，8岁']);
  });
  it.each([[.02,'男',0],[.2,'女',1],[8,'男',2],[15,'男',3],[10,'女',4],[16,'女',5]] as const)('matches age %s and sex %s to the correct juvenile image',(age,sex,index)=>expect(patientArt(identity(age,sex))).toEqual({index,atlas:'extended',columns:4,rows:2}));
  it('does not use pregnancy art for possible pregnancy, breastfeeding or all gynaecology patients',()=>{
    expect(patientArt(identity(29,'女',['孕晚期'])).index).toBe(6);
    expect(patientArt(identity(42,'女',['孕晚期'])).index).toBe(7);
    for(const flags of [[],['哺乳期'],['可能怀孕']])expect(patientArt(identity(29,'女',flags)).atlas).toBe('original');
    expect(patientArt(identity(42,'男',['孕晚期'])).atlas).toBe('original');
  });
  it('uses the saved age, sex and entity flags rather than a case number',()=>{
    const child=PATIENT_ENTITIES.find(p=>p.ageYears>=6&&p.ageYears<13&&p.sex==='女')!;
    expect(patientArt({caseId:'C-200',entityId:child.id})).toMatchObject({atlas:'extended',index:4});
    expect(patientArt({...identity(16,'男'),entityId:child.id})).toMatchObject({atlas:'extended',index:3});
  });
  it('gives every compatible preset/entity pair a finite in-bounds frame and correct gender group',()=>{
    const femaleOriginal=new Set([3,4,6,9,10,13,17,18]),femaleExtended=new Set([1,4,5,6,7]);
    const used=new Set<string>();let pairs=0;
    for(const preset of CASE_PRESETS)for(const entity of compatibleEntities(preset)){
      const art=patientArt({caseId:preset.id,entityId:entity.id});pairs++;used.add(`${art.atlas}:${art.index}`);
      expect(Number.isInteger(art.index)).toBe(true);expect(art.index).toBeGreaterThanOrEqual(0);expect(art.index).toBeLessThan(art.columns*art.rows);
      expect((art.atlas==='original'?femaleOriginal:femaleExtended).has(art.index)).toBe(entity.sex==='女');
      for(const kind of ['portrait','bedside','world'] as const)expect(patientArtFile(art,kind)).toMatch(/\.webp$/);
      expect(patientArt({caseId:preset.id,entityId:entity.id})).toEqual(art);
    }
    expect(pairs).toBeGreaterThan(208);expect(used.size).toBeGreaterThanOrEqual(20);
  });
});
