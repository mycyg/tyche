import {describe,it,expect} from 'vitest';
import {patientPlacard,placardPosition} from './placards';
import {createPatient} from '../game/cards';
import {startRun} from '../game/engine';
import {BED_PLACES} from './scene';
import {idlePose,ambientDropout} from './idle';
import {worldCamera} from './camera';
import {initialGraphState,getClinicalGraph} from '../content/clinical';
describe('bedside world identity and visual motion',()=>{
 it('keeps the actual death-investigation bedside label distinct from living care',()=>{
  const r=startRun('body-label','医生',[]),p=createPatient(r,'C020','bed');p.inpatient=true;p.bed=5;p.damage=3;p.clinical=initialGraphState(getClinicalGraph('C020')!,'body-label');p.clinical.flags.push('death_confirmed');
  expect(patientPlacard(r,p).status).toBe('5 床 · 遗体待移送');p.clinical.flags.push('body_transferred');expect(patientPlacard(r,p).status).not.toContain('待移送');
 });
 it('confines a fractured ambient glyph dropout to scenery nouns, never negation or clinical numbers',()=>{
  const text='空床边像是站着一个人。抬头再看，只有输液架。';for(const seed of ['a','b','c']){const at=ambientDropout(text,seed);expect(at).toBeGreaterThanOrEqual(0);expect(/[墙影廊床铃钟]/.test([...text][at])).toBe(true);expect(ambientDropout(text,seed)).toBe(at);}
  expect(ambientDropout('血压 186/108，不是 152/96。','a')).toBe(-1);
 });
 it('keeps patient sprites readable on portrait and landscape phones and clamps the camera inside the floor',()=>{
  for(const [width,height] of [[375,451],[597,210],[1728,578]])for(const player of [{x:132,y:104},{x:1516,y:490},{x:10,y:10}]){
   const camera=worldCamera(player,width,height);expect(camera.scale).toBeGreaterThanOrEqual(1.35);expect(camera.x).toBeGreaterThanOrEqual(0);expect(camera.y).toBeGreaterThanOrEqual(0);expect(camera.x+width/camera.scale).toBeLessThanOrEqual(1536);expect(camera.y+height/camera.scale).toBeLessThanOrEqual(512);
  }
 });
 it('labels an actual patient with public care status, not a hidden diagnosis or seeded damage',()=>{
  const r=startRun('placard','医生',[]),p=createPatient(r,'C013','bed');p.name='林先生';p.inpatient=true;p.bed=5;p.caredDay=0;
  expect(patientPlacard(r,p)).toEqual({name:'林先生',status:'5 床 · 待巡视'});p.caredDay=r.day;expect(patientPlacard(r,p).status).toBe('5 床 · 今日已巡视');p.damage=3;expect(patientPlacard(r,p).status).toBe('5 床 · 死亡记录核查');
 });
 it('does not invent an inpatient bed for an observation patient',()=>{
  const r=startRun('placard2','医生',[]),p=createPatient(r,'C013','bed');p.inpatient=false;p.bed=0;expect(patientPlacard(r,p).status).toMatch(/^留观 · /);
 });
 it('distinguishes an actual deferral from unfinished work or completed bedside care',()=>{
  const r=startRun('deferred-label','医生',[]),p=createPatient(r,'C013','bed');p.inpatient=true;p.bed=5;p.caredDay=0;
  r.journal.push({id:`ward:${p.uid}:${r.day}:wait`,day:r.day,title:'床旁随访',choice:'维持医嘱，暂不床旁复核',result:'原医嘱继续。',scope:{kind:'patient',id:p.uid},flags:[]});
  expect(patientPlacard(r,p).status).toBe('5 床 · 本班暂未复核');
  expect(patientPlacard({...r,day:r.day+1},p).status).toBe('5 床 · 待巡视');
  p.caredDay=r.day;expect(patientPlacard(r,p).status).toBe('5 床 · 今日已巡视');
 });
 it('projects DOM placards under their own bed, with screen-space readable sizing and viewport bounds',()=>{
  const bed=BED_PLACES[0],camera={x:0,y:0,scale:1},viewport={width:375,height:812};const a=placardPosition(bed,camera,viewport);
  expect(a.x).toBe(bed.x+bed.width/2);expect(a.y).toBe(bed.y+bed.height+5);expect(a.width).toBeGreaterThanOrEqual(84);expect(a.visible).toBe(true);
  expect(placardPosition(bed,{...camera,x:400},viewport).visible).toBe(false);expect(placardPosition(bed,camera,{width:375,height:90}).visible).toBe(false);
 });
 it('animates every role and patient independently without gameplay randomness, and completely stops when disabled',()=>{
  const ids=['hero','chief','nurse','peer','research','rep','patient-1','patient-2'];
  for(const id of ids){const poses=Array.from({length:80},(_,i)=>idlePose(i*200,id,true));expect(new Set(poses.map(p=>p.frame)).size).toBe(4);for(const time of [0,1000,90000])expect(idlePose(time,id,false)).toEqual({frame:0,breathe:0,lean:0});expect(idlePose(1234,id,true)).toEqual(idlePose(1234,id,true));}
  expect(new Set(ids.map(id=>JSON.stringify(idlePose(500,id,true)))).size).toBe(ids.length);
 });
});
