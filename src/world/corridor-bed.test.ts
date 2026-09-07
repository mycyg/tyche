import {describe,it,expect}from 'vitest';
import {startRun}from '../game/engine';
import {createPatient}from '../game/cards';
import {worldOccupants,corridorBedInUse}from './occupants';
import {worldTargets}from './WorldStage';
import {BED_PLACES,CORRIDOR_BED_OBSTACLE,CORRIDOR_BED_PLACE,CORRIDOR_BED_PROP}from './scene';
import {ROOMS}from './layout';
import {SPAWN,findPath,followPath,walkable,type Point}from './navigation';
describe('a documented corridor bed is furniture, not extra routine capacity',()=>{
 it('requires the actual admission and vanishes after discharge, not after a historic fact',()=>{
  const r=startRun('corridor-render','程医生',[]),p=createPatient(r,'C013','corridor');r.patients=[p];p.bed=17;p.active=p.inpatient=true;
  expect(corridorBedInUse(r)).toBe(false);expect(worldOccupants(r,[])).toEqual([]);
  r.facts[`corridor-bed:${p.uid}`]={day:1,source:'E-048-a:admission',sequence:0};
  expect(corridorBedInUse(r)).toBe(true);expect(worldOccupants(r,[])).toEqual([{patient:p,place:CORRIDOR_BED_PLACE}]);
  expect(worldTargets(r).find(t=>t.id==='bed:17')).toMatchObject({patientId:p.uid,...CORRIDOR_BED_PLACE.target});
  p.active=false;p.bed=0;expect(corridorBedInUse(r)).toBe(false);expect(worldOccupants(r,[])).toEqual([]);
  expect(BED_PLACES).toHaveLength(12);expect(CORRIDOR_BED_PROP.depth).toBeLessThan(CORRIDOR_BED_PLACE.depth);
 });
 it('blocks only the occupied footprint and retains a route to every ward and room',()=>{
  const extra=[CORRIDOR_BED_OBSTACLE],centre={x:1020,y:250};
  expect(walkable(centre)).toBe(true);expect(walkable(centre,extra)).toBe(false);
  for(const target of [CORRIDOR_BED_PLACE.target,...BED_PLACES.map(b=>b.target),...ROOMS.map(r=>r.interaction)]){
    const path=findPath(SPAWN,target,extra);expect(path.length,JSON.stringify(target)).toBeGreaterThan(0);
    let point:Point={...SPAWN};
    for(let tick=0;tick<3000&&path.length;tick++){point=followPath(point,path,3.5,extra);expect(walkable(point,extra)).toBe(true);}
    expect(path,JSON.stringify(target)).toHaveLength(0);expect(point).toEqual(target);
  }
 });
 it('renders an imported bed only for its original patient without inventing an admission',()=>{
  const r=startRun('legacy-corridor-render','程医生',[]),p=createPatient(r,'C013','legacy-corridor');r.patients=[p];p.bed=17;p.active=p.inpatient=true;
  r.authored!.legacyBedNumbers=[{patientId:'someone-else',bed:17,source:'schema-1-before-authored'}];
  expect(corridorBedInUse(r)).toBe(false);
  r.authored!.legacyBedNumbers=[{patientId:p.uid,bed:17,source:'schema-1-before-authored'}];
  expect(corridorBedInUse(r)).toBe(true);expect(worldOccupants(r,[])).toEqual([{patient:p,place:CORRIDOR_BED_PLACE}]);
  expect(r.facts[`corridor-bed:${p.uid}`]).toBeUndefined();
  p.active=false;expect(corridorBedInUse(r)).toBe(false);
 });
});
