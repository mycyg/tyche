import {describe,it,expect} from 'vitest';
import {CASE_PRESETS,compatibleEntities,instantiatePreset} from '../content/patients';
import {PRESET_ARCHIVE_PROBES,presetArchiveChecks} from '../content/patients/archive-links';
import {canonicalTrapId,archivedTrapIds,archiveCheckMatched,archiveNotices,validArchiveTrap,collectTrapArchive} from './trap-archive';
import {checkContext} from './traits';
import {talentCheck} from './talents';
import {startRun} from './engine';
import type {Card} from './types';
import {tribunalEnding} from './endings';

function fixture(id='C-001',probe=1){
  const source=CASE_PRESETS.find(p=>p.id===id)!,definition=instantiatePreset(source,compatibleEntities(source)[0],'new-encounter');
  const option=definition.steps.flatMap(n=>n.options).find(o=>o.id.includes(`source-probe-${probe}`)&&!o.id.endsWith(':private'))!;
  const card:Card={id:'archive-fixture',kind:'quick',caseId:id,patientId:'new-encounter',scope:{kind:'patient',id:'new-encounter'},title:definition.title,text:'',options:[option]};
  const r=startRun('archive-check','程医生',[]);r.archiveTraps=[`${id}:preset:${id}:old-encounter:decision:trap-1`];
  return {r,card,option,definition};
}
describe('source-specific cross-run trap recognition',()=>{
  it('validates owner source traps and collects non-seed hazards only after actual tribunal readout',()=>{
    expect(validArchiveTrap('C-001:decision:trap-1',true)).toBe(true);
    for(const bad of ['C-999:decision:trap-1','C-001:decision:trap-99','C-001:investigate:targeted','C001:s5_consult','C002:s5_discharge'])expect(validArchiveTrap(bad,true),bad).toBe(false);
    const r=startRun('collector','程医生',[]),p=r.patients[0];p.caseId='C-001';
    r.hazards=[{id:'non-seed-C',type:'C',weight:10,reason:'告知缺项',norm:'本院制度',causal:false,day:1,scope:{kind:'patient',id:p.uid},choice:'作无风险保证',choiceId:`preset:C-001:${p.uid}:communication:promise`}];
    expect(collectTrapArchive(r).keys).toEqual([]);r.day=15;r.phase='ending';r.ending=tribunalEnding(r,'facts');
    expect(collectTrapArchive(r).keys).toEqual([]);r.tribunalResponse='records';
    expect(collectTrapArchive(r).keys).toEqual(['C-001:communication:promise']);
    r.hazards.push({...r.hazards[0],id:'external-source',choiceId:'outside:missing'});
    expect(collectTrapArchive(r).unmappedHazardIds).toEqual(['external-source']);
  });
  it('normalizes old encounter IDs without crossing case or domain boundaries',()=>{
    expect(canonicalTrapId('C-001','preset:C-001:old-uid:decision:trap-1')).toBe('C-001:decision:trap-1');
    expect(canonicalTrapId('C001','old-uid:graph:s5_consult:0')).toBe('C001:s5_consult');
    expect(canonicalTrapId('C-001','C-002:decision:trap-1')).toBeUndefined();
    expect(canonicalTrapId('C001','decision:trap-1')).toBeUndefined();
    expect([...archivedTrapIds({archiveTraps:['C-001:decision:trap-1'],priorSeeds:[{runId:'old',caseId:'C-001',trapId:'preset:C-001:old:decision:trap-1'}]})]).toEqual(['C-001:decision:trap-1']);
  });
  it('applies +2 or T04 +3 to a real preset history die with no new clinical die',()=>{
    const {r,card,option}=fixture();expect(option.check).toBeDefined();
    const snapshot=JSON.stringify(option);expect(archiveCheckMatched(r,card,option)).toBe(true);
    expect(talentCheck({talents:[],debuffs:[],day:1},checkContext(r,card,option)).modifier).toBe(2);
    expect(talentCheck({talents:['T04'],debuffs:[],day:1},checkContext(r,card,option)).modifier).toBe(3);
    expect(JSON.stringify(option)).toBe(snapshot);
    const noDie={...option,check:undefined};expect(archiveCheckMatched(r,card,noDie)).toBe(false);
  });
  it('does not award a case-wide bonus for unrelated history, recording or family checks',()=>{
    const {r,card,option}=fixture('C-075',2);expect(archiveCheckMatched(r,card,option)).toBe(false);
    const another={...card,caseId:'C-002'};expect(archiveCheckMatched(r,another,option)).toBe(false);
    const exact=fixture('C-019',1);exact.r.archiveTraps=['C-019:decision:trap-2'];expect(archiveCheckMatched(exact.r,exact.card,exact.option)).toBe(true);
    expect(presetArchiveChecks('C-019','communication:explain')).toEqual([]);
  });
  it('keeps every explicit link attached to an existing check and source trap',()=>{
    for(const [number,probes]of Object.entries(PRESET_ARCHIVE_PROBES)) {
      const p=CASE_PRESETS.find(p=>p.id===`C-${number.padStart(3,'0')}`)!,options=p.scenes.flatMap(n=>n.options);
      probes.forEach((traps,index)=>{
        const check=options.find(o=>o.id.includes(`:source-probe-${index+1}`));expect(check?.check,`${p.id}/${index+1}`).toBeDefined();
        for(const trap of traps)expect(options.some(o=>o.id.endsWith(`:decision:trap-${trap}`)),`${p.id}/trap-${trap}`).toBe(true);
      });
    }
  });
  it('returns a pure one-per-encounter notice contract and consumes only its own flag',()=>{
    const {r,card}=fixture(),snapshot=JSON.stringify(r),notice=archiveNotices(r,card)[0];
    expect(notice.trapId).toBe('C-001:decision:trap-1');expect(JSON.stringify(r)).toBe(snapshot);
    expect(notice.text).toContain('头孢哌酮舒巴坦');expect(notice.text).toContain('加 2');expect(notice.text).not.toContain('C-001');
    r.talents=['T04'];expect(archiveNotices(r,card)[0].text).toContain('加 3');
    r.facts[notice.flag]={day:r.day,source:'displayed-archive-notice',sequence:0};expect(archiveNotices(r,card)).toEqual([]);
    expect(archiveNotices(r,{...card,patientId:'another-encounter'})).toHaveLength(1);
  });
});
