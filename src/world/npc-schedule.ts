import { hash } from '../game/random';
import type { Patient, Run } from '../game/types';
import type { Occupant } from './occupants';
import { patientArt, patientBody } from './patients';
import { companionCarePriority, patientCompanions } from './companions';
import { parkingPlace } from './crowd';
import { patientCanWalk } from './patient-mobility';
import type { ActionAtlasId, WalkAtlasId } from './npc-art';

export interface NpcAction { atlas: ActionAtlasId; row: number; group: number }
export interface NpcStop {
  x: number; y: number;
  /** Milliseconds spent here before leaving for the next stop. */
  dwell: number;
  /** Played while dwelling. Without one the character uses its walking pose. */
  action?: NpcAction;
  /** Direction faced while dwelling: 0 down, 1 left, 2 up, 3 right. */
  facing?: number;
  /** The leg arriving here uses the pushing or mopping frames, not walking. */
  haul?: boolean;
  /** The patient is back in bed here, so the bed sprite takes over again. */
  bed?: boolean;
}
export interface NpcDefinition {
  id: string;
  /** Shown on the map only for the five people the player can talk to. */
  label?: string;
  /** Engine actor id, for people who carry cards. */
  actor?: string;
  /** Patient whose bed sprite is replaced while this character is up. */
  patientId?: string;
  walk?: { atlas: WalkAtlasId; row: number };
  /** Frames used while moving with a cart or a mop. */
  haul?: { atlas: ActionAtlasId; row: number; right: number; left: number };
  haulWalk?: { atlas: WalkAtlasId; row: number };
  /** Tools stay with this worker during travel, pauses and conversation. */
  alwaysHauls?: boolean;
  companionOf?: string;
  talk?: NpcAction;
  stops: NpcStop[];
  /** Pixels per second. */
  speed: number;
  /** Milliseconds of head start, so the ward never departs in unison. */
  offset: number;
}

const STAFF: WalkAtlasId = 'staff-motion', LIFE: WalkAtlasId = 'ward-life-walk', PATIENT: WalkAtlasId = 'patient-motion';
const WARD_ACTIONS: ActionAtlasId = 'ward-actions';
/** Row order of every atlas, from the two handoff manifests. */
export const STAFF_ROW = { chief: 0, nurse: 1, peer: 2, research: 3, rep: 4 } as const;
export const LIFE_ROW = { nurse: 0, porter: 1, cleaner: 2, youngMan: 3, middleWoman: 4, oldMan: 5 } as const;
export const PATIENT_ROW = { man: 0, woman: 1, oldMan: 2, oldWoman: 3, child: 4, pregnant: 5 } as const;
export const ACTION_ROW = { headNurse: 0, cleaner: 1, womanRelative: 2, manRelative: 3 } as const;
export const FAMILY_ROW = { mother: 0, father: 1, partnerMale: 2, partnerFemale: 3 } as const;
export const CONFLICT_ROW = { security: 0, investigator: 1, relative: 2 } as const;
/** Action groups, in the column order of each row. */
const NURSE_WORK = { cartRight: 0, cartLeft: 1, chart: 2, listen: 3 };
const RELATIVE_WORK = { sit: 0, record: 1, hand: 2, talk: 3 };
const FAMILY_WORK = { wait: 0, phone: 1, argue: 2, luggage: 3 };
const SECURITY_WORK = { radio: 0, stop: 1, escort: 2, watch: 3 };
const INVESTIGATOR_WORK = { note: 0, badge: 1, ask: 2, collect: 3 };
const CONFLICT_RELATIVE_WORK = { record: 0, argue: 1, sit: 2, hand: 3 };

/** Named floor positions, all verified walkable by `npc-schedule.test.ts`. */
export const SPOTS = {
  officeDesk: { x: 638, y: 150 }, officeSide: { x: 700, y: 160 }, officeDoor: { x: 606, y: 192 },
  stationBack: { x: 400, y: 100 }, stationLeft: { x: 296, y: 100 }, stationRight: { x: 470, y: 100 },
  stationFront: { x: 400, y: 180 }, stationShelf: { x: 380, y: 180 },
  wardA: [{ x: 110, y: 104 }, { x: 165, y: 104 }, { x: 110, y: 166 }, { x: 165, y: 166 }],
  wardB: [{ x: 878, y: 104 }, { x: 933, y: 104 }, { x: 878, y: 166 }, { x: 933, y: 166 }],
  wardC: [{ x: 1134, y: 104 }, { x: 1189, y: 104 }, { x: 1134, y: 166 }, { x: 1189, y: 166 }],
  pharmacyBack: { x: 1400, y: 100 }, pharmacyFront: { x: 1400, y: 180 },
  erFloor: { x: 135, y: 380 }, erBack: { x: 135, y: 450 },
  archiveFloor: { x: 360, y: 400 }, archiveDoor: { x: 380, y: 300 },
  dutyFront: { x: 600, y: 355 }, dutyBack: { x: 670, y: 470 }, dutyDoor: { x: 604, y: 300 },
  familyRoom: { x: 860, y: 355 }, familyBack: { x: 920, y: 470 }, familyDoor: { x: 862, y: 300 },
  researchDesk: { x: 1150, y: 400 }, researchShelf: { x: 1120, y: 360 }, researchDoor: { x: 1150, y: 300 },
  observation: { x: 1415, y: 380 },
  hallWest: { x: 250, y: 262 }, hallStation: { x: 430, y: 250 }, hallCentre: { x: 700, y: 262 },
  hallOffice: { x: 620, y: 250 }, hallEast: { x: 1240, y: 262 }, hallFar: { x: 1460, y: 250 },
  waitWest: { x: 210, y: 276 }, waitCentre: { x: 760, y: 276 }, waitEast: { x: 960, y: 276 },
  mopWest: { x: 300, y: 272 }, mopEast: { x: 520, y: 272 },
} as const;

const stop = (p: { x: number; y: number }, dwell: number, extra: Partial<NpcStop> = {}): NpcStop => ({ x: p.x, y: p.y, dwell, ...extra });

/** Night keeps a thinner ward: fewer background people and shorter routes. */
export function isNightShift(r: Run): boolean {
  if (r.shiftPhase === '夜班' || r.shiftPhase === '日终') return true;
  const pending = r.queue.slice(r.cursor);
  return pending.some(c => c.kind === 'night') && !pending.some(c => c.kind !== 'night' && c.kind !== 'rest');
}

/** The five people who carry cards. They keep working, and the card, wherever
 * they walk; the route only changes with the shift. */
export function staffRoutes(night: boolean): NpcDefinition[] {
  const chief: NpcStop[] = night
    ? [stop(SPOTS.officeDesk, 12000, { facing: 2 }), stop(SPOTS.officeSide, 5000, { facing: 1 }), stop(SPOTS.hallOffice, 2500)]
    : [stop(SPOTS.officeDesk, 8000, { facing: 2 }), stop(SPOTS.hallOffice, 1200), stop(SPOTS.stationBack, 5000, { facing: 0 }),
       stop(SPOTS.wardA[1], 4500, { facing: 3 }), stop(SPOTS.hallStation, 1500), stop(SPOTS.officeSide, 4000, { facing: 1 })];
  const nurse: NpcStop[] = night
    ? [stop(SPOTS.stationFront, 5000, { action: { atlas: WARD_ACTIONS, row: ACTION_ROW.headNurse, group: NURSE_WORK.chart }, facing: 0 }),
       stop(SPOTS.wardB[0], 4200, { haul: true, action: { atlas: WARD_ACTIONS, row: ACTION_ROW.headNurse, group: NURSE_WORK.listen }, facing: 1 }),
       stop(SPOTS.stationBack, 3600, { haul: true, action: { atlas: WARD_ACTIONS, row: ACTION_ROW.headNurse, group: NURSE_WORK.chart }, facing: 0 })]
    : [stop(SPOTS.stationFront, 3600, { action: { atlas: WARD_ACTIONS, row: ACTION_ROW.headNurse, group: NURSE_WORK.chart }, facing: 0 }),
       stop(SPOTS.wardA[0], 4200, { haul: true, action: { atlas: WARD_ACTIONS, row: ACTION_ROW.headNurse, group: NURSE_WORK.listen }, facing: 1 }),
       stop(SPOTS.wardA[2], 3000, { action: { atlas: WARD_ACTIONS, row: ACTION_ROW.headNurse, group: NURSE_WORK.chart }, facing: 1 }),
       stop(SPOTS.wardB[1], 3600, { haul: true, action: { atlas: WARD_ACTIONS, row: ACTION_ROW.headNurse, group: NURSE_WORK.listen }, facing: 3 }),
       stop(SPOTS.stationBack, 3200, { haul: true, action: { atlas: WARD_ACTIONS, row: ACTION_ROW.headNurse, group: NURSE_WORK.chart }, facing: 0 })];
  const peer: NpcStop[] = night
    ? [stop(SPOTS.dutyFront, 9000, { facing: 0 }), stop(SPOTS.dutyBack, 6000, { facing: 2 })]
    : [stop(SPOTS.dutyFront, 5000, { facing: 0 }), stop(SPOTS.hallCentre, 1600), stop(SPOTS.stationFront, 4200, { facing: 2 }),
       stop(SPOTS.wardC[2], 3600, { facing: 1 }), stop(SPOTS.dutyBack, 5200, { facing: 2 })];
  const research: NpcStop[] = night
    ? [stop(SPOTS.researchDesk, 11000, { facing: 2 }), stop(SPOTS.researchShelf, 4000, { facing: 1 })]
    : [stop(SPOTS.researchDesk, 7000, { facing: 2 }), stop(SPOTS.researchShelf, 3000, { facing: 1 }),
       stop(SPOTS.researchDoor, 1500), stop(SPOTS.hallEast, 2600), stop(SPOTS.researchDesk, 5000, { facing: 2 })];
  const rep: NpcStop[] = night
    ? [stop(SPOTS.hallCentre, 6000, { facing: 0 }), stop(SPOTS.hallOffice, 4000, { facing: 0 })]
    : [stop(SPOTS.hallCentre, 4200, { facing: 0 }), stop(SPOTS.hallOffice, 3000, { facing: 3 }),
       stop(SPOTS.waitCentre, 3600, { facing: 0 }), stop(SPOTS.hallStation, 2600, { facing: 1 })];
  const cart = { atlas: WARD_ACTIONS, row: ACTION_ROW.headNurse, right: NURSE_WORK.cartRight, left: NURSE_WORK.cartLeft };
  const people: NpcDefinition[] = [
    { id: 'chief', actor: 'chief', label: '唐济', walk: { atlas: STAFF, row: STAFF_ROW.chief }, stops: chief, speed: 46, offset: 0 },
    { id: 'nurse', actor: 'nurse', label: '姜蓉', walk: { atlas: STAFF, row: STAFF_ROW.nurse }, haul: cart, haulWalk: { atlas: 'ward-haul', row: 0 }, stops: nurse, speed: 44, offset: 2600 },
    { id: 'peer', actor: 'peer', label: '李恂', walk: { atlas: STAFF, row: STAFF_ROW.peer }, stops: peer, speed: 50, offset: 5200 },
    { id: 'research', actor: 'research', label: '周乔', walk: { atlas: STAFF, row: STAFF_ROW.research }, stops: research, speed: 44, offset: 7600 },
    { id: 'rep', actor: 'rep', label: '叶茗', walk: { atlas: STAFF, row: STAFF_ROW.rep }, stops: rep, speed: 42, offset: 9800 },
  ];
  for (const person of people) {
    const row = person.walk!.row;
    const nurse = person.id === 'nurse';
    person.alwaysHauls = nurse;
    person.talk = { atlas: nurse ? 'ward-care' : 'staff-actions', row: nurse ? 0 : row, group: 2 };
    for (const s of person.stops) {
      if (s.action) s.action = { atlas: nurse ? 'ward-care' : 'staff-actions', row: nurse ? 0 : row, group: s.action.group === NURSE_WORK.chart ? 0 : 2 };
      else if (s.dwell >= 3600) s.action = { atlas: 'staff-actions', row, group: 0 };
    }
  }
  return people;
}

/** Nurses, porters, cleaners and waiting visitors. None of them carry a card. */
export function backgroundRoutes(night: boolean, _inpatients: number): NpcDefinition[] {
  const people: NpcDefinition[] = [
    { id: 'ward-nurse-b', walk: { atlas: LIFE, row: LIFE_ROW.nurse }, speed: 54, offset: 1400,
      stops: [stop(SPOTS.wardB[0], 3200, { facing: 1 }), stop(SPOTS.wardB[3], 2800, { facing: 3 }),
        stop(SPOTS.hallCentre, 1800), stop(SPOTS.stationRight, 3400, { facing: 0 }), stop(SPOTS.wardB[2], 2600, { facing: 1 })] },
    { id: 'porter', walk: { atlas: LIFE, row: LIFE_ROW.porter }, speed: 58, offset: 4300,
      stops: [stop(SPOTS.pharmacyFront, 3400, { facing: 2 }), stop(SPOTS.hallEast, 1200), stop(SPOTS.stationFront, 3000, { facing: 2 }),
        stop(SPOTS.hallWest, 1200), stop(SPOTS.erFloor, 3200, { facing: 0 }), stop(SPOTS.hallStation, 1400)] },
  ];
  if (!night) {
    people.push(
      { id: 'ward-nurse-c', walk: { atlas: LIFE, row: LIFE_ROW.nurse }, speed: 52, offset: 8100,
        stops: [stop(SPOTS.wardC[1], 3000, { facing: 3 }), stop(SPOTS.wardC[2], 2600, { facing: 1 }),
          stop(SPOTS.hallEast, 1600), stop(SPOTS.pharmacyBack, 3200, { facing: 2 }), stop(SPOTS.wardC[3], 2400, { facing: 3 })] },
      { id: 'cleaner-hall', alwaysHauls: true, haulWalk: { atlas: 'ward-haul', row: 1 }, speed: 24, offset: 600,
        stops: [stop(SPOTS.mopEast, 2600, { haul: true, action: { atlas: 'ward-care', row: 1, group: 0 } }),
          stop(SPOTS.mopWest, 2400, { haul: true, action: { atlas: 'ward-care', row: 1, group: 2 } })] },
      { id: 'cleaner-rounds', walk: { atlas: LIFE, row: LIFE_ROW.cleaner }, speed: 46, offset: 6700,
        stops: [stop(SPOTS.dutyBack, 3000, { facing: 2 }), stop(SPOTS.hallCentre, 1400), stop(SPOTS.wardC[0], 2800, { facing: 1 }),
          stop(SPOTS.hallEast, 1400), stop(SPOTS.archiveFloor, 3000, { facing: 0 })] },
    );
  }
  return people;
}

const wardSpots = (bed: number) => bed >= 13 ? SPOTS.wardC : bed >= 9 ? SPOTS.wardB : SPOTS.wardA;
const bedSlot = (bed: number) => (bed - 5) % 4;

/** A companion sits beside the bed of the patient they came for, and leaves
 * with them. The recording pose appears only where a recording exists. */
export function companionRoutes(r: Run, occupants: Occupant[]): NpcDefinition[] {
  const people: NpcDefinition[] = [];
  const rooms = new Map<number, number>();
  const candidates = occupants.map(o => ({ ...o, priority: hasRecording(r, o.patient) ? 100 : companionCarePriority(o.patient) }))
    .filter(o => o.priority > 0).sort((a, b) => b.priority - a.priority || a.patient.bed - b.patient.bed);
  for (const { patient } of candidates) {
    if (!patient.inpatient || patient.bed < 5 || patient.bed > 16) continue;
    if (!patient.active) continue;
    const room = Math.floor((patient.bed - 5) / 4);
    if (people.length >= 4 || (rooms.get(room) ?? 0) >= 2) continue;
    const seed = hash(`companion:${patient.uid}`);
    const slot = bedSlot(patient.bed), spot = wardSpots(patient.bed)[slot], bedOnLeft = slot % 2 === 0;
    // One primary caregiver at a bedside, including when both parents are
    // listed in the record. Other relatives remain in their authored scenes.
    for (const [index, profile] of patientCompanions(patient).slice(0, 1).entries()) {
      const wanted = { x: spot.x + (bedOnLeft ? -14 : 14), y: spot.y + 14 + index * 20 };
      if (profile.outside) { wanted.x = Math.floor(spot.x / 256) * 256 + 210; wanted.y = 262; }
      const at = parkingPlace(wanted, people.map(p => p.stops[0]));
      if (!at) continue;
      const older = profile.ageGroup === 'older';
      const walk: NpcDefinition['walk'] = profile.sex === 'unknown'
        ? { atlas: 'companion-walk', row: older ? 2 : profile.ageGroup === 'young' ? 1 : 0 }
        : older ? { atlas: 'family-walk', row: profile.sex === '女' ? FAMILY_ROW.mother : FAMILY_ROW.father }
        : { atlas: LIFE, row: profile.sex === '女' ? LIFE_ROW.middleWoman : LIFE_ROW.youngMan };
      const action: NpcAction | undefined = profile.sex === 'unknown' ? undefined : older
        ? { atlas: 'family-actions', row: walk.row, group: hasRecording(r, patient) ? FAMILY_WORK.phone : FAMILY_WORK.wait }
        : { atlas: WARD_ACTIONS, row: profile.sex === '女' ? ACTION_ROW.womanRelative : ACTION_ROW.manRelative,
          group: hasRecording(r, patient) ? RELATIVE_WORK.record : RELATIVE_WORK.sit };
      people.push({ id: `companion:${patient.uid}:${index}`, companionOf: patient.uid, walk, speed: older ? 28 : 36, offset: seed % 9000,
        stops: [stop(at, 7000, { facing: profile.outside ? 0 : bedOnLeft ? 1 : 3, action }), stop(at, 1800, { facing: 0, action })] });
      rooms.set(room, (rooms.get(room) ?? 0) + 1);
    }
  }
  return people;
}

/** Bed-bound patients keep the bed sprite. Those allowed up walk a short loop
 * inside their own room and return; infants and the worst cases never do. */
export function ambulatoryRoutes(r: Run, occupants: Occupant[], night: boolean): NpcDefinition[] {
  const people: NpcDefinition[] = [];
  for (const { patient } of occupants) {
    if (!patient.inpatient || patient.bed < 5 || patient.bed > 16) continue;
    if (!patientCanWalk(r, patient)) continue;
    const row = ambulatoryRow(patient);
    if (row === undefined) continue;
    const seed = hash(`ambulatory:${r.day}:${patient.uid}`);
    if (seed % 100 >= (night ? 12 : 34)) continue;
    const spots = wardSpots(patient.bed), slot = bedSlot(patient.bed);
    const bedside = { x: spots[slot].x + (slot % 2 ? 14 : -14), y: spots[slot].y }, window = { x: spots[slot % 2 ? 1 : 0].x, y: 78 };
    people.push({ id: `ambulatory:${patient.uid}`, patientId: patient.uid, walk: { atlas: PATIENT, row }, speed: 28, offset: seed % 12000,
      stops: [stop(bedside, 9000, { facing: slot < 2 ? 2 : 0, bed: true }), stop(window, 5200, { facing: 2 }),
        stop({ x: spots[slot < 2 ? 2 : 0].x, y: 132 }, 4200, { facing: slot % 2 ? 3 : 1 }), stop(bedside, 7000, { facing: 0, bed: true })] });
  }
  return people;
}
/** Age and body decide the sprite row; damage and the mortuary case stay in bed. */
export function ambulatoryRow(patient: Patient): number | undefined {
  if (patient.damage >= 2 || patient.caseId === 'C020' || !patient.active) return undefined;
  const body = patientBody(patient);
  if (body.age === undefined || body.age < 18 || body.pregnant) return undefined;
  const art = patientArt(patient);
  return art.atlas === 'original' ? art.index : undefined;
}

const fact = (r: Run, key: string) => !!r.facts[key] || !!r.authored?.activeFacts[key];
function hasRecording(r: Run, patient: Patient): boolean {
  return !!r.facts[`clinical:${patient.uid}:recording-exists`] || !!r.facts[`clinical:${patient.uid}:unrest_filed`]
    || !!r.facts[`clinical:${patient.uid}:unrest_escalated`] || r.authored?.dispute?.patientId === patient.uid;
}
/** Read from the settings once the engine carries one; the default keeps the
 * written relationship rather than inventing a second character. */
export function partnerRow(r: Run): number {
  return r.partner === 'male' || r.partner === undefined && fact(r, '伴侣-男') ? FAMILY_ROW.partnerMale : FAMILY_ROW.partnerFemale;
}
/** A broken relationship stops the visits instead of only moving a number. */
export function familyVisitsStopped(r: Run): boolean {
  return fact(r, '家庭-断联') || r.relations.family <= -3;
}

/** Relatives and the partner come in on the family events of this run. */
export function familyRoutes(r: Run): NpcDefinition[] {
  const people: NpcDefinition[] = [];
  const parentsVisit = !familyVisitsStopped(r);
  const family: WalkAtlasId = 'family-walk', actions: ActionAtlasId = 'family-actions';
  const bereaved = fact(r, '家庭-丧亲') || fact(r, 'father-deceased');
  const admitted = fact(r, '家庭-车祸-ICU中') || fact(r, '家庭-父母住院');
  if (parentsVisit && (admitted || fact(r, '家庭-婚事') || fact(r, '家庭-婚事已付'))) {
    people.push({ id: 'family-mother', label: '母亲', walk: { atlas: family, row: FAMILY_ROW.mother }, speed: 34, offset: 2400,
      stops: [stop(SPOTS.waitCentre, 6200, { action: { atlas: actions, row: FAMILY_ROW.mother, group: FAMILY_WORK.wait }, facing: 0 }),
        stop(SPOTS.hallCentre, 2000), stop(SPOTS.familyDoor, 1600),
        stop(SPOTS.familyRoom, 5200, { action: { atlas: actions, row: FAMILY_ROW.mother, group: FAMILY_WORK.phone }, facing: 0 })] });
  }
  if (parentsVisit && !bereaved && (fact(r, '家庭-婚事') || fact(r, '家庭-婚礼未到'))) {
    people.push({ id: 'family-father', label: '父亲', walk: { atlas: family, row: FAMILY_ROW.father }, speed: 32, offset: 6100,
      stops: [stop(SPOTS.waitEast, 5000, { action: { atlas: actions, row: FAMILY_ROW.father, group: FAMILY_WORK.wait }, facing: 0 }),
        stop(SPOTS.hallCentre, 2400),
        stop(SPOTS.familyRoom, 4600, { action: { atlas: actions, row: FAMILY_ROW.father, group: fact(r, '家庭-婚礼未到') ? FAMILY_WORK.argue : FAMILY_WORK.wait }, facing: 0 })] });
  }
  const row = partnerRow(r);
  const hasPartner = r.partner === 'male' || r.partner === 'female' || r.partner === undefined && fact(r, '伴侣-在册');
  if (hasPartner && !fact(r, '伴侣-分开') && fact(r, '伴侣-矛盾')) {
    const leaving = fact(r, '家庭-卖车') || fact(r, '家庭-降级');
    people.push({ id: 'family-partner', label: '对象', walk: { atlas: family, row }, speed: 38, offset: 9200,
      stops: [stop(SPOTS.familyRoom, 5400, { action: { atlas: actions, row, group: leaving ? FAMILY_WORK.luggage : FAMILY_WORK.argue }, facing: 0 }),
        stop(SPOTS.familyDoor, 1800), stop(SPOTS.hallCentre, 2600),
        stop(SPOTS.waitCentre, 4200, { action: { atlas: actions, row, group: FAMILY_WORK.phone }, facing: 0 })] });
  }
  return people;
}

/** Security and the inspection team come from the events, and stay away when
 * nothing has happened. */
export function conflictRoutes(r: Run): NpcDefinition[] {
  const people: NpcDefinition[] = [];
  const walkAtlas: WalkAtlasId = 'conflict-walk', actions: ActionAtlasId = 'conflict-actions';
  const disputed = r.patients.find(p => p.active && hasRecording(r, p));
  const escalated = r.patients.some(p => !!r.facts[`clinical:${p.uid}:unrest_escalated`]) || fact(r, '医闹升级') || fact(r, '视频上网');
  const inspection = fact(r, '飞检-进驻') || fact(r, '飞检-约谈') || fact(r, '飞检-追回') || fact(r, '飞检-通报');
  if (escalated || (disputed && (r.authored?.dispute?.stage ?? 0) >= 2)) {
    people.push({ id: 'security', label: '保安', walk: { atlas: walkAtlas, row: CONFLICT_ROW.security }, speed: 44, offset: 1900,
      stops: [stop(SPOTS.hallStation, 4200, { action: { atlas: actions, row: CONFLICT_ROW.security, group: SECURITY_WORK.watch }, facing: 0 }),
        stop(SPOTS.hallCentre, 3000, { action: { atlas: actions, row: CONFLICT_ROW.security, group: SECURITY_WORK.radio }, facing: 0 }),
        stop(SPOTS.hallEast, 2600), stop(SPOTS.waitEast, 3400, { action: { atlas: actions, row: CONFLICT_ROW.security, group: SECURITY_WORK.escort }, facing: 0 }),
        stop(SPOTS.hallWest, 2800, { action: { atlas: actions, row: CONFLICT_ROW.security, group: SECURITY_WORK.stop }, facing: 0 })] });
  }
  if (inspection) {
    people.push({ id: 'investigator', label: '调查员', walk: { atlas: walkAtlas, row: CONFLICT_ROW.investigator }, speed: 42, offset: 5400,
      stops: [stop(SPOTS.archiveFloor, 6000, { action: { atlas: actions, row: CONFLICT_ROW.investigator, group: INVESTIGATOR_WORK.note }, facing: 0 }),
        stop(SPOTS.archiveDoor, 1600), stop(SPOTS.hallStation, 2200),
        stop(SPOTS.stationFront, 4800, { action: { atlas: actions, row: CONFLICT_ROW.investigator, group: INVESTIGATOR_WORK.ask }, facing: 2 }),
        stop(SPOTS.stationBack, 3600, { action: { atlas: actions, row: CONFLICT_ROW.investigator, group: INVESTIGATOR_WORK.collect }, facing: 0 })] });
  }
  if (disputed) {
    const spots = disputed.inpatient && disputed.bed >= 5 && disputed.bed <= 16 ? wardSpots(disputed.bed) : SPOTS.wardA;
    people.push({ id: 'conflict-relative', label: '家属', walk: { atlas: walkAtlas, row: CONFLICT_ROW.relative }, speed: 40, offset: 8700,
      stops: [stop({ x: spots[1].x, y: 132 }, 4600, { action: { atlas: actions, row: CONFLICT_ROW.relative, group: CONFLICT_RELATIVE_WORK.record }, facing: 1 }),
        stop(SPOTS.hallCentre, 2400),
        stop(SPOTS.stationFront, 4200, { action: { atlas: actions, row: CONFLICT_ROW.relative, group: CONFLICT_RELATIVE_WORK.argue }, facing: 2 }),
        stop(SPOTS.waitCentre, 5000, { action: { atlas: actions, row: CONFLICT_ROW.relative, group: CONFLICT_RELATIVE_WORK.sit }, facing: 0 })] });
  }
  return people;
}

/** Everyone on the floor for this run state. */
export function wardCast(r: Run, occupants: Occupant[]): NpcDefinition[] {
  const night = isNightShift(r);
  const inpatients = occupants.filter(o => o.patient.inpatient).length;
  return [...staffRoutes(night), ...backgroundRoutes(night, inpatients), ...companionRoutes(r, occupants),
    ...ambulatoryRoutes(r, occupants, night), ...familyRoutes(r), ...conflictRoutes(r)];
}
