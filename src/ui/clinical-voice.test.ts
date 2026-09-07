import {it,expect} from 'vitest';
import {clinicalVoiceActor} from './clinical-voice';
import {getClinicalGraph} from '../content/clinical';
it('uses the documented guardian, not an adult male voice for an infant boy',()=>{
 expect(clinicalVoiceActor('C001','男')).toBe('mother');
 expect(clinicalVoiceActor('C007','男')).toBe('mother');
 expect(clinicalVoiceActor('C008','女')).toBe('father');
 const history=getClinicalGraph('C001')!.nodes.flatMap(n=>n.options).find(o=>o.mechanics?.operation==='history')!;
 expect(clinicalVoiceActor('C001','男',history.id)).toBe('mother');
});
it('separates the doctor’s quoted explanation from quoted chart findings',()=>{
 expect(clinicalVoiceActor('C008','女','s3_sign')).toBe('hero');
 expect(clinicalVoiceActor('C014','女','s4_threat')).toBe('hero');
 expect(clinicalVoiceActor('C014','女','s3_discharge_dip')).toBe('narrator');
 expect(clinicalVoiceActor('C003','女','unknown-old-choice')).toBe('narrator');
});
