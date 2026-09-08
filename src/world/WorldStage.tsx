import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { availableEncounters } from '../game/engine';
import { ACTORS, RULES, VITAL_LABELS } from '../game/rules';
import type { Action, Card, Patient, Run, Vital } from '../game/types';
import { distance, findPath, followPath, move, nearestFloor, roomName, routeTo, SPAWN, walkable, WORLD, type Point } from './navigation';
import { BED_PLACES, PROPS, paintProp, paintWorldMap, CORRIDOR_BED_PROP, CORRIDOR_BED_FOOT_PROP, CORRIDOR_BED_OBSTACLE } from './scene';
import { idlePose,ambientDropout } from './idle';
import { patientArt } from './patients';
import { awaitingBed } from '../game/cards';
import {underObservation}from '../game/clinical-admission';
import { ROOMS } from './layout';
import { worldOccupants, worldWaitingPatients, patientWorldBed, corridorBedInUse,temporaryPatients } from './occupants';
import { ambientPerception, perceptionBand } from '../game/perception';
import { liveCap } from '../game/traits';
import {patientPlacard,placardPosition} from './placards';
import {worldCamera} from './camera';
import {worldCoffeeOffering,worldNapOffering} from './refreshments';
import {observeLayout} from './observe-layout';
import {wardCast} from './npc-schedule';
import {createWardLife,actorAction,actorStep,restingInBed,type NpcActor} from './npc-runtime';
import {ATLASES,actionFrame,walkFrame} from './npc-art';
import {bedTransitionFrame} from './bed-transition';
import './world-stage.css';

interface Target extends Point { id: string; label: string; actor?: string; npc?: string; patientId?: string; waitingPatients?:Patient[]; cards?: Card[]; action?: 'coffee' | 'nap' | 'borrow' | 'journal' | 'ward' | 'schedule'; text?: string }
export function liveTargetPoint(target: Target, actors: Map<string, NpcActor>): Point {
  const actor = actors.get(target.npc ?? '');
  return actor && !restingInBed(actor) ? { x: actor.x, y: actor.y } : target;
}
function ToolIcon({ kind }: { kind: 'journal' | 'character' | 'map' | 'zoom' }) {
  const paths = {
    journal: 'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h8',
    character: 'M12 3 21 12 12 21 3 12Z',
    map: 'M3 3h18v18H3z M9 3v18 M15 3v18 M3 9h18 M3 15h18',
    zoom: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M14.5 14.5 21 21',
  };
  return <svg class="rpg-tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={paths[kind]} /></svg>;
}
/** Fallback positions and idle-sheet rows for the five people who carry cards.
 * The live route in `npc-schedule` moves them; these keep the map complete
 * while the walking atlas is still decoding. */
const PEOPLE = [
  { id: 'chief', x: 638, y: 159, cell: 0 },
  { id: 'nurse', x: 397, y: 183, cell: 1 },
  { id: 'peer', x: 587, y: 394, cell: 2 },
  { id: 'research', x: 1154, y: 404, cell: 3 },
  { id: 'rep', x: 659, y: 278, cell: 4 },
];
export function worldTargets(r: Run): Target[] {
  const coffee=worldCoffeeOffering(r);
  const nap=worldNapOffering(r);
  const encounters = availableEncounters(r);
  const occupants = worldOccupants(r, encounters);
  const waiting=worldWaitingPatients(r,encounters);
  const targets: Target[] = PEOPLE.map(p => ({ ...p, actor: p.id, npc: p.id, label: ACTORS[p.id].name,
    text: ({ chief: '“这层楼还有人等着住院呢。病人能不能出院，你得评估清楚，再签字。”', nurse: '“病历夹都放在床头了。你先核对患者的情况，没问过的病史还得问，也别把没查清的结果写成正常啊。”', peer: '李恂把手机扣在桌上。“你今天还有几位患者没看完啊？”', research: '周乔抬头看了一眼钟。“我还得整理数据，病历也没写完。今天又不知道要忙到几点。”', rep: '“有需要，随时找我。”叶茗收起手机，没有离开走廊。' } as Record<string, string>)[p.id] }));
  targets.push(
    { id: 'phone', x: 54, y: 270, label: '走廊电话', actor: r.facts['father-deceased']||r.authored?.activeFacts['father-deceased']?'mother':'father', text: r.facts['family-accident']||r.authored?.activeFacts['家庭-车祸'] ? '通话记录里，家里的号码排在最上面。' : '屏幕上有家里的号码。你把音量调高了一格。' },
    { id: 'coffee', x: 556, y: 426, label: coffee.label, action: coffee.allowed?'coffee':undefined,text:coffee.text },
    { id: 'nap', x: 690, y: 455, label: nap.label, action: nap.allowed?'nap':undefined,text:nap.text },
    { id: 'borrow', x: 343, y: 180, label: '排班表', action: 'schedule' },
    { id: 'journal', x: 326, y: 398, label: '档案柜 · 旧病历', action: 'journal' },
    { id: 'auditor', x: 362, y: 398, label: '稽核材料交接', actor:'auditor',text:'资料接收单按患者和日期分开装订。核查人员请你先列清材料来源，再说明自己经手的部分。' },
    { id: 'ward', x: 440, y: 183, label: '住院台账', action: 'ward' },
  );
  for (const {patient,place} of occupants) {
    targets.push({...place.target,id:patient.inpatient?`bed:${patient.bed}`:`observation:${patient.uid}`,
      label:`${patient.inpatient?`${patient.bed} 床`:place.target.x<256?'急救室':'留观'} · ${patient.name}`,patientId:patient.uid,npc:`ambulatory:${patient.uid}`});
  }
  for(const group of waiting)targets.push({...group.place.target,id:group.id,label:`${group.label} · ${group.patients.length} 位`,waitingPatients:group.patients});
  for (const card of encounters) {
    let key: string, point: Point, label: string;
    const waitingGroup=waiting.find(g=>g.patients.some(p=>p.uid===card.patientId));
    const assignedPlace=occupants.find(o=>o.patient.uid===card.patientId);
    if('authoredEventId'in card&&card.authoredEventId==='E-058'){key='nurse';point=targets.find(t=>t.id==='nurse')!;label='护理站 · 医嘱系统';}
    else if(waitingGroup){key=waitingGroup.id;point=waitingGroup.place.target;label=`${waitingGroup.label} · ${waitingGroup.patients.length} 位`;}
    else if(assignedPlace){const p=assignedPlace.patient;key=p.inpatient?`bed:${p.bed}`:`observation:${p.uid}`;point=assignedPlace.place.target;label=`${p.inpatient?`${p.bed} 床`:point.x<256?'急救室':'留观'} · ${p.name}`;}
    else if (card.patientId && card.kind !== 'night' && card.kind !== 'quick') {
      const p = r.patients.find(p => p.uid === card.patientId);
      if(!p){
        // Event-only patients belong to the director, not the ward bed ledger.
        const participant=r.authored?.participants.find(p=>p.id===card.patientId);
        const station=targets.find(t=>t.id==='nurse')!;
        (station.cards??=[]).push(card);station.label=participant?.name??'护理站';
        continue;
      }
      const place = patientWorldBed(r,p);
      key = !p.active ? 'phone' : place ? `bed:${p.bed}` : `observation:${p.uid}`;
      point = !p.active?{x:54,y:270}:place?.target ?? occupants.find(o=>o.patient.uid===p.uid)?.place.target ?? {x:1412,y:367};
      label = !p.active?`出院回访 · ${p.name}`:place?`${p.bed} 床 · ${p.name}`:`留观 · ${p.name}`;
    } else if (card.kind === 'night') { key = 'emergency'; point = { x: 132, y: 367 }; label = '急救呼叫'; }
    else if (card.kind === 'quick') { key = 'outpatient'; point = { x: 316, y: 273 }; label = '待诊患者'; }
    else if (card.kind === 'rest') { key = 'day-end'; point = { x: 678, y: 373 }; label = '日终 · 休息与结算'; }
    else if (card.actor === 'father'||card.actor === 'mother'||card.actor === 'partner') { key = 'phone'; point = { x: 54, y: 270 }; label = '家里来电'; }
    else { key = card.actor ?? 'nurse'; point = targets.find(t=>t.id===key)??PEOPLE.find(p => p.id === key) ?? PEOPLE[1]; label = ACTORS[key]?.name ?? card.title; }
    const existing = targets.find(t => t.id === key);
    if (existing) { (existing.cards ??= []).push(card); existing.label = label; }
    else targets.push({ ...point, id: key, label, cards: [card], actor: card.actor, patientId:card.patientId });
  }
  return targets;
}
interface Props {
  r: Run;
  frozen: boolean;
  motion: boolean;
  visualInterference?: boolean;
  dialogueOpen?: boolean;
  children?: ComponentChildren;
  onEncounter: (card: Card) => void;
  onPatient: (id: string) => void;
  onBedNear?: () => void;
  guide?: ComponentChildren;
  onAmbient: (label: string, text: string, actor?: string) => void;
  onAction: (a: Action) => void;
  onMenu: (panel: 'settings' | 'journal' | 'ward' | 'character' | 'archive' | 'schedule') => void;
  onPosition: (p: NonNullable<Run['world']>) => void;
  onTitle: () => void;
}
export function WorldStage(props: Props) {
  const { r, children } = props;
  const canvas = useRef<HTMLCanvasElement>(null), frame = useRef<HTMLDivElement>(null), guideBox=useRef<HTMLDivElement>(null);
  const [guideHeight,setGuideHeight]=useState(0);
  const latest = useRef(props); latest.current = props;
  const targets = useMemo(() => worldTargets(r), [r]);
  const targetsRef = useRef(targets); targetsRef.current = targets;
  const occupants=useMemo(()=>worldOccupants(r,availableEncounters({...r,phase:'play'})),[r]);
  const occupantsRef=useRef(occupants);occupantsRef.current=occupants;
  const waiting=useMemo(()=>worldWaitingPatients(r,availableEncounters({...r,phase:'play'})),[r]);
  const waitingRef=useRef(waiting);waitingRef.current=waiting;
  const cast=useMemo(()=>wardCast(r,occupants),[r,occupants]);
  const castRef=useRef(cast);castRef.current=cast;
  const life=useRef(createWardLife()).current;
  const hold=useRef<{id:string;at:Point;since:number}|null>(null);
  /** Names, markers, click areas and route ends all read the live position, so
   * a card never stays behind at the spot its owner left. */
  const livePoint=(t:Target):Point=>liveTargetPoint(t,life.byId);
  const placards=useRef(new Map<string,HTMLButtonElement>());
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const [nearby, setNearby] = useState<Target | null>(null), [room, setRoom] = useState('南屏医院 · 住院部');
  const [selection, setSelection] = useState<Target | null>(null), [quests, setQuests] = useState(false);
  const [overview,setOverview]=useState(false);
  const menu=useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const pad = useRef({ x: 0, y: 0, pointer: -1 });
  const stick = useRef<HTMLSpanElement>(null);
  const input = useRef(new Set<string>());
  const state = useRef({ x: SPAWN.x, y: SPAWN.y, facing: SPAWN.facing, moving: false, path: [] as Point[], destination: '', arrive: '' });
  const camera = useRef({ x: 0, y: 0, scale: 1 });
  const engine = useRef({ interact: (_t?: Target) => {}, navigate: (_t: Target) => {} });
  const open = (t: Target) => {
    if (latest.current.frozen || latest.current.r.phase !== 'play') return;
    // The character stops and turns to the doctor for as long as they talk.
    hold.current = t.npc ? { id: t.npc, at: { x: state.current.x, y: state.current.y }, since: performance.now() } : null;
    latest.current.onPosition({ x:state.current.x, y:state.current.y, facing:state.current.facing, day:latest.current.r.day });
    if(t.waitingPatients?.length)setSelection(t);
    else if (t.cards?.length === 1) latest.current.onEncounter(t.cards[0]);
    else if (t.cards?.length) setSelection(t);
    else if (t.patientId) latest.current.onPatient(t.patientId);
    else if (t.action === 'journal' || t.action === 'ward' || t.action === 'schedule') latest.current.onMenu(t.action);
    else if (t.action) latest.current.onAction({ type: t.action });
    else latest.current.onAmbient(t.label, t.text ?? '暂时没有新的消息。', t.actor);
  };
  const openRef = useRef(open); openRef.current = open;
  useLayoutEffect(()=>{
    const el=menu.current;
    if(!el) return;
    const previous=document.activeElement as HTMLElement|null;
    el.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||document.querySelector('dialog[open]'))return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setSelection(null);setQuests(false);setOverview(false);}
      if(event.key==='Tab') {
        const buttons=[...el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const first=buttons[0],last=buttons.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    el.addEventListener('keydown',onKey);
    return()=>{el.removeEventListener('keydown',onKey);previous?.focus({preventScroll:true});};
  },[!!selection,quests,overview]);
  useEffect(()=>{
    const el=guideBox.current;
    if(!el){setGuideHeight(0);return;}
    return observeLayout(el,()=>setGuideHeight(el.getBoundingClientRect().height));
  },[!!props.guide]);
  useLayoutEffect(() => {
    const saved = latest.current.r.world;
    const pos = saved?.day === r.day && walkable(saved,corridorBedInUse(r)?[CORRIDOR_BED_OBSTACLE]:[]) ? saved : SPAWN;
    state.current = { ...pos, moving: false, path: [], destination: '', arrive: '' };
  }, [r.id, r.day]);
  useLayoutEffect(() => {
    if (props.frozen || selection || quests || overview) {
      input.current.clear(); pad.current.x = pad.current.y = 0;
      state.current.path = []; state.current.destination = '';
      if (stick.current) stick.current.style.transform = 'translate(0, 0)';
    }
  }, [props.frozen, selection, quests, overview]);
  const blocked = useRef(false); blocked.current = props.frozen || !!selection || quests || overview;
  useEffect(() => {
    const c = canvas.current!, container = frame.current!;
    const ctx = c.getContext('2d', { alpha: false });
    if (!ctx) { setFailed(true); return; }
    const load = (src: string) => { const img = new Image(); img.src = `${import.meta.env.BASE_URL}art/${src}`; return img; };
    const sources = ['ward-map.webp', 'hero-walk.webp', 'npc-idle.webp', 'bed-patients.webp','extended-bed-patients.webp'];
    const images = sources.map(load);
    // The four ward sheets arrive with the map; the family, conflict and
    // patient sheets stream in behind it and only their own people wait.
    const atlases = new Map(ATLASES.filter(a => a.core && a.id !== 'staff-walk').map(a => [a.id, load(a.file)] as const));
    let transitions: HTMLImageElement | undefined;
    const drawable = (img?: HTMLImageElement) => !!img?.complete && img.naturalWidth > 0;
    let stopped = false, raf = 0, width = 1, height = 1, last = 0, wasMoving = false, lastNear = '', lastRoom = '', lastTick = 0, lastFollow = 0, follows = 0;
    const resize = () => { width = container.clientWidth; height = container.clientHeight; if(c.width!==Math.round(width))c.width = Math.round(width); if(c.height!==Math.round(height))c.height = Math.round(height); };
    const stopObserving = observeLayout(container,resize); resize();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const nearest = () => targetsRef.current.filter(t => distance(state.current, livePoint(t)) < 45).sort((a, b) => distance(state.current, livePoint(a)) - distance(state.current, livePoint(b)))[0];
    const interact = (target?: Target) => { if (!blocked.current) { const t = target ?? nearest(); if (t && distance(state.current, livePoint(t)) < 52) openRef.current(t); } };
    const obstacles=()=>corridorBedInUse(latest.current.r)?[CORRIDOR_BED_OBSTACLE]:[];
    const navigate = (t: Target) => { const to=livePoint(t); follows = 0; state.current.path = routeTo(state.current, to,obstacles()); state.current.destination = t.id; state.current.arrive = t.id; if (distance(state.current, to) < 30) interact(t); };
    engine.current = { interact, navigate };
    // Depth entries are reused between frames so a busy floor allocates nothing
    // per frame beyond the movement step itself.
    interface Layer { depth: number; kind: 0 | 1 | 2 | 3; index: number }
    const layers: Layer[] = [], layerPool: Layer[] = [], propList = [...PROPS];
    const byDepth = (a: Layer, b: Layer) => a.depth - b.depth;
    const pushLayer = (depth: number, kind: Layer['kind'], index: number) => {
      const slot = layerPool[layers.length] ?? (layerPool[layers.length] = { depth: 0, kind: 0, index: 0 });
      slot.depth = depth; slot.kind = kind; slot.index = index; layers.push(slot);
    };
    /** Patients who are out of bed right now, keyed by patient. */
    const upright = new Map<string, NpcActor>();
    let synced: unknown = null;
    const syncCast = () => {
      if (synced === castRef.current) return;
      synced = castRef.current;
      life.sync(castRef.current);
      for (const def of castRef.current) {
        const needed = [def.walk?.atlas, def.haulWalk?.atlas, ...def.stops.map(s => s.action?.atlas)];
        for (const id of needed) if (id && !atlases.has(id)) atlases.set(id, load(ATLASES.find(a => a.id === id)!.file));
        if (def.patientId && !transitions) transitions = load('patient-transitions-atlas.webp');
      }
      upright.clear();
      for (const actor of life.actors) if (actor.def.patientId) upright.set(actor.def.patientId, actor);
    };
    const paintActor = (actor: NpcActor, motion: boolean, time: number) => {
      if (actor.transition && drawable(transitions)) {
        const occupant = occupantsRef.current.find(o => o.patient.uid === actor.def.patientId);
        if (occupant) {
          const f = bedTransitionFrame(actor, occupant.place);
          ctx.save();
          if (f.sx < 256) clipBlanket(f.dx, f.dy, f.dw, f.dh);
          ctx.drawImage(transitions!, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
          ctx.restore();
          return;
        }
      }
      const hauling = actor.state === 'walk' && (actor.hauling || actor.def.alwaysHauls) && !actor.held ? actor.def.haulWalk : undefined;
      const work = hauling ? undefined : actorAction(actor), step = motion ? actorStep(actor) : 0;
      const walk = hauling ?? (actor.def.alwaysHauls ? actor.def.haulWalk : actor.def.walk);
      const image = work ? atlases.get(work.atlas) : walk && atlases.get(walk.atlas);
      if (!drawable(image)) {
        // Only the five staff have a fallback sheet; it covers the first frames
        // while the walking atlas is still decoding.
        const cell = PEOPLE.findIndex(person => person.id === actor.id);
        if (cell < 0 || !drawable(images[2])) return;
        const pose = idlePose(time, actor.id, motion), sheet = images[2], cw = sheet.width / 4, ch = sheet.height / 6;
        ctx.drawImage(sheet, pose.frame * cw, PEOPLE[cell].cell * ch, cw, ch, Math.round(actor.x - 36), Math.round(actor.y - 67), 72, 72);
        return;
      }
      ctx.fillStyle = 'rgba(8, 14, 28, .38)'; ctx.beginPath(); ctx.ellipse(actor.x, actor.y - 2, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
      const frame = work ? actionFrame(work.atlas, work.row, work.group, step, actor.x, actor.y)
        : walkFrame(walk!.atlas, walk!.row, actor.facing, actor.moving && !actor.held || actor.def.companionOf && walk!.atlas === 'companion-walk' ? step : 0, actor.x, actor.y);
      ctx.drawImage(image!, frame.sx, frame.sy, frame.sw, frame.sh, frame.dx, frame.dy, frame.dw, frame.dh);
    };
    const clipBlanket = (x: number, y: number, w: number, h: number) => {
      // Heads and arms can extend beyond a blanket; its lower half remains
      // inside the mattress rails even for a broad or asymmetric cutout.
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x+w, y); ctx.lineTo(x+w, y+h*.61);
      ctx.lineTo(x+w*.775, y+h*.61); ctx.lineTo(x+w*.775, y+h); ctx.lineTo(x+w*.225, y+h);
      ctx.lineTo(x+w*.225, y+h*.61); ctx.lineTo(x, y+h*.61); ctx.closePath(); ctx.clip();
    };
    const savePosition = () => latest.current.onPosition({ x: state.current.x, y: state.current.y, facing: state.current.facing, day: latest.current.r.day });
    const reset = () => { input.current.clear(); pad.current.x = pad.current.y = 0; state.current.path = []; state.current.destination = ''; if (stick.current) stick.current.style.transform = 'translate(0, 0)'; if (wasMoving) savePosition(); wasMoving = false; };
    const keydown = (e: KeyboardEvent) => {
      if (e.defaultPrevented||document.querySelector('dialog[open]')||blocked.current || (e.target as HTMLElement)?.closest('input,textarea,select,dialog,[role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'shift'].includes(key)) { e.preventDefault(); input.current.add(key); state.current.path = []; state.current.destination = ''; }
      if ((key === 'e' || key === ' ') && !e.repeat) { e.preventDefault(); interact(); }
      if (key === 'j' && !e.repeat) latest.current.onMenu('journal');
      if (key === 'escape' && !e.repeat) latest.current.onMenu('settings');
    };
    const keyup = (e: KeyboardEvent) => input.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
    const draw = (time: number) => {
      if (stopped) return;
      const dt = Math.min(.04, last ? (time - last) / 1000 : 0); last = time;
      const player = state.current, p = latest.current;
      const motion = p.motion && !reducedMotion.matches;
      syncCast();
      let dx = 0, dy = 0;
      if (!blocked.current) {
        const keys = input.current;
        dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')) + pad.current.x;
        dy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')) + pad.current.y;
        const speed = WORLD.speed * (keys.has('shift') ? 1.45 : 1);
        let next:Point;
        if(!dx&&!dy&&player.path.length){
          next=followPath(player,player.path,speed*dt,obstacles());
          dx=next.x-player.x;dy=next.y-player.y;
        }else{
          const length=Math.hypot(dx,dy);if(length>1){dx/=length;dy/=length;}
          next=move(player,dx*speed*dt,dy*speed*dt,obstacles());
        }
        player.moving = distance(player, next) > .01;
        player.x = next.x; player.y = next.y;
        if (Math.abs(dx) > Math.abs(dy)) player.facing = dx > 0 ? 3 : 1;
        else if (dy) player.facing = dy > 0 ? 0 : 2;
        // Stop within speaking distance when deliberately approaching a target.
        // People themselves never obstruct manual movement or another route.
        const approached = player.destination && targetsRef.current.find(t => t.id === player.destination);
        if (approached && distance(player, livePoint(approached)) < 30) player.path = [];
        if (player.destination && !player.path.length) {
          // A route that ends short of a character who kept walking is issued
          // again, so a required card is never lost to the walk.
          const t = targetsRef.current.find(t => t.id === player.destination);
          const to = t?.npc ? livePoint(t) : undefined;
          if (to && distance(player, to) > 46 && follows < 8) { follows++; player.path = routeTo(player, to, obstacles()); }
          if (!player.path.length) {
            player.destination = '';
            // A deliberate walk opens the target from beside it even when a counter or bed keeps the last step away.
            const intended = player.arrive === t?.id; player.arrive = '';
            if (t && (intended ? distance(player, livePoint(t)) < 110 : distance(player, livePoint(t)) < 52) && !blocked.current) openRef.current(t);
          }
        } else if (player.destination && time - lastFollow > 260) {
          // Following a walking character: keep the route pointed at them.
          lastFollow = time;
          const t = targetsRef.current.find(t => t.id === player.destination);
          const to = t?.npc ? livePoint(t) : undefined;
          if (to && distance(player.path[player.path.length - 1], to) > 22) { const next = routeTo(player, to, obstacles()); if (next.length) player.path = next; }
        }
      } else player.moving = false;
      if(corridorBedInUse(p.r)&&!walkable(player,obstacles())){
        const safe=nearestFloor(player,64,obstacles());if(safe){player.x=safe.x;player.y=safe.y;player.path=[];player.destination='';}
      }
      if (wasMoving && !player.moving) savePosition();
      wasMoving = player.moving;
      if (hold.current && !p.frozen && !p.dialogueOpen && !blocked.current && time - hold.current.since > 400) hold.current = null;
      life.step(dt, { motion, freeze: blocked.current, extra: obstacles(), hold: hold.current,
        ready: actor => !actor.def.patientId || drawable(atlases.get('patient-motion')) && drawable(transitions) });
      const cam=worldCamera(player,width,height,zoom),{scale}=cam;
      camera.current = cam;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#08101b'; ctx.fillRect(0, 0, width, height);
      ctx.save(); ctx.scale(scale, scale); ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
      paintWorldMap(ctx, images[0]);
      const night = p.r.queue.slice(p.r.cursor).some(c => c.kind === 'night') && !p.r.queue.slice(p.r.cursor).some(c => c.kind !== 'night' && c.kind !== 'rest');
      if (player.path.length && !blocked.current) {
        ctx.fillStyle = '#ffe5a2'; player.path.forEach((p, i) => { if (i % 3 === 0) ctx.fillRect(p.x - 1, p.y - 1, 2, 2); });
      }
      if (propList.length !== PROPS.length + (corridorBedInUse(p.r) ? 2 : 0)) {
        propList.length = 0; propList.push(...PROPS); if (corridorBedInUse(p.r)) propList.push(CORRIDOR_BED_PROP,CORRIDOR_BED_FOOT_PROP);
      }
      layers.length = 0;
      for (let i = 0; i < propList.length; i++) pushLayer(propList[i].depth, 0, i);
      const occupantList = occupantsRef.current;
      for (let i = 0; i < occupantList.length; i++) {
        const away = upright.get(occupantList[i].patient.uid);
        if (!away || restingInBed(away) || !drawable(atlases.get('patient-motion')) || !drawable(transitions)) pushLayer(occupantList[i].place.depth, 1, i);
      }
      for (let i = 0; i < life.actors.length; i++) {
        const a = life.actors[i];
        if (a.def.patientId && (restingInBed(a) || !drawable(atlases.get('patient-motion')) || !drawable(transitions))) continue;
        const bed = a.transition && occupantList.find(o => o.patient.uid === a.def.patientId)?.place;
        pushLayer(bed ? bedTransitionFrame(a, bed).depth : a.y, 2, i);
      }
      pushLayer(player.y, 3, 0);
      layers.sort(byDepth);
      for (const layer of layers) {
        if (layer.kind === 0) { paintProp(ctx, images[0], propList[layer.index]); continue; }
        if (layer.kind === 1) {
          const { patient, place: bed } = occupantList[layer.index];
          const art = patientArt(patient), { index, columns } = art;
          // Keep the blanket registered to the mattress instead of stretching
          // the entire cutout on a breathing timer.
          ctx.save(); clipBlanket(bed.x, bed.y, bed.width, bed.height);
          ctx.drawImage(images[art.atlas === 'original' ? 3 : 4], index % columns * 128, Math.floor(index / columns) * 128, 128, 128, bed.x, bed.y, bed.width, bed.height);
          ctx.restore();
          continue;
        }
        if (layer.kind === 2) { paintActor(life.actors[layer.index], motion, time); continue; }
        const pose = idlePose(time, 'hero', motion && !player.moving);
        ctx.fillStyle = 'rgba(8, 14, 28, .38)'; ctx.beginPath(); ctx.ellipse(player.x, player.y - 2, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
        const img = images[1], cellW = img.width / 4, cellH = img.height / 4;
        const step = player.moving && motion ? Math.floor(time / 145) % 4 : pose.frame === 2 ? 3 : 1;
        ctx.drawImage(img, step * cellW, player.facing * cellH, cellW, cellH, Math.round(player.x - 34 + pose.lean), Math.round(player.y - 63 - pose.breathe), 68, 68 + Math.round(pose.breathe));
      }
      if (night || p.r.day > 5) { ctx.fillStyle = night ? 'rgba(14, 20, 69, .23)' : `rgba(35, 18, 46, ${Math.min(.17, (p.r.day - 5) * .014)})`; ctx.fillRect(0, 0, WORLD.width, WORLD.height); }
      if (p.visualInterference !== false) {
        const band = perceptionBand(p.r.vitals.san);
        if (band !== 'clear') {
          ctx.fillStyle = band === 'tense' ? 'rgba(83, 84, 89, .08)' : band === 'distorted' ? 'rgba(28, 31, 43, .19)' : 'rgba(17, 20, 38, .30)';
          ctx.fillRect(0, 0, WORLD.width, WORLD.height);
          if (band === 'fractured') {
            // The apparition has no hitbox or quest marker; genuine patients remain visible.
            const ghostX = Math.max(32, Math.min(WORLD.width - 32, player.x + 155));
            const opacity = motion ? .05 + .09 * (1 + Math.sin(time / 3000)) / 2 : .08;
            ctx.fillStyle = `rgba(164, 169, 189, ${opacity})`;
            ctx.fillRect(ghostX - 5, 242, 10, 10); ctx.fillRect(ghostX - 9, 252, 18, 27);
          }
        }
      }
      const near = nearest();
      for (const t of targetsRef.current) {
        const quest = !!t.cards?.length, at = livePoint(t), dist = distance(player, at);
        if (quest) {
          const y = at.y - (t.actor && t.id !== 'phone' ? 63 : 22);
          const bob = motion ? Math.round(Math.sin(time / 400) * 2) : 0;
          ctx.fillStyle = '#151a35'; ctx.fillRect(at.x - 6, y - 9 + bob, 12, 16);
          ctx.fillStyle = t.id === 'emergency' ? '#ff787e' : '#ffe3a0'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.fillText('!', at.x, y + 4 + bob);
        }
        if (!t.patientId&&dist < 84 && (quest || t.id === near?.id)) {
          ctx.font = '10px sans-serif'; const w = Math.min(190, ctx.measureText(t.label).width + 14);
          ctx.fillStyle = 'rgba(9, 14, 33, .9)'; ctx.fillRect(at.x - w / 2, at.y + 7, w, 17);
          ctx.fillStyle = '#f3eddd'; ctx.textAlign = 'center'; ctx.fillText(t.label, at.x, at.y + 19, w - 10);
        }
      }
      ctx.restore();
      for(const occupant of occupantsRef.current){
        const label=placards.current.get(occupant.patient.uid);if(!label)continue;
        const away=upright.get(occupant.patient.uid);
        const place=away&&!restingInBed(away)&&drawable(atlases.get('patient-motion'))
          ? {...occupant.place,x:away.x-occupant.place.width/2,y:away.y-occupant.place.height}
          : occupant.place;
        const position=placardPosition(place,cam,{width,height});
        label.hidden=!position.visible;label.style.width=`${position.width}px`;
        label.style.transform=`translate(${Math.round(position.x-position.width/2)}px,${Math.round(position.y)}px)`;
      }
      for(const group of waitingRef.current){
        const label=placards.current.get(group.id);if(!label)continue;
        const position=placardPosition(group.place,cam,{width,height});
        label.hidden=!position.visible;label.style.width=`${position.width}px`;
        label.style.transform=`translate(${Math.round(position.x-position.width/2)}px,${Math.round(position.y)}px)`;
      }
      if (time - lastTick > 100) {
        lastTick = time;
        const nearKey = near ? [near.id,near.label,near.text,near.action,near.cards?.map(c=>c.id).join(',')].join(':') : '';
        if (nearKey !== lastNear) { lastNear = nearKey; setNearby(near ?? null); if(near?.patientId) latest.current.onBedNear?.(); }
        const name = roomName(player); if (name !== lastRoom) { lastRoom = name; setRoom(name); }
      }
      raf = requestAnimationFrame(draw);
    };
    Promise.all(images.map(img => img.decode())).then(() => { if (!stopped) { setReady(true); raf = requestAnimationFrame(draw); } }).catch(() => { if (!stopped) setFailed(true); });
    return () => { stopped = true; cancelAnimationFrame(raf); stopObserving(); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', reset); document.removeEventListener('visibilitychange', reset); };
  }, [zoom, r.id]);
  const usePad = (e: PointerEvent) => {
    if (blocked.current || pad.current.pointer !== e.pointerId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(), x = e.clientX - rect.left - rect.width / 2, y = e.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(x, y), max = 30, k = length > max ? max / length : 1;
    pad.current.x = Math.abs(x) < 5 ? 0 : x * k / max; pad.current.y = Math.abs(y) < 5 ? 0 : y * k / max;
    state.current.path = []; state.current.destination = '';
    if (stick.current) stick.current.style.transform = `translate(${x * k}px, ${y * k}px)`;
  };
  const releasePad = (e: PointerEvent) => { if (pad.current.pointer === e.pointerId) { pad.current = { x: 0, y: 0, pointer: -1 }; if (stick.current) stick.current.style.transform = 'translate(0, 0)'; } };
  const band=props.visualInterference===false?'clear':perceptionBand(r.vitals.san);
  const perceptionText=band==='clear'?'':ambientPerception(r)??'',dropout=ambientDropout(perceptionText,`${r.seed}:${r.day}:${r.cursor}`);
  return <section class={`world-stage world-stage-readable ${props.dialogueOpen ? 'with-dialogue' : ''}`} data-perception={band} data-motion={props.motion?'on':'off'} style={{'--guide-space':`${props.guide?guideHeight:0}px`}} aria-label="南屏医院">
    <div ref={frame} class="world-viewport">
    <canvas ref={canvas} class="world-canvas" tabIndex={0} aria-label="医院地图。方向键或 WASD 移动，E 或空格交互，J 打开病历。也可点击目的地行走。"
      onPointerDown={e => {
        if (blocked.current) return; canvas.current?.focus();
        const rect = canvas.current!.getBoundingClientRect(), cam = camera.current;
        const point = { x: (e.clientX - rect.left) / cam.scale + cam.x, y: (e.clientY - rect.top) / cam.scale + cam.y };
        const hit = (t: Target) => { const at = livePoint(t); return distance(point, { x: at.x, y: at.y - 20 }); };
        const target = targetsRef.current.filter(t => hit(t) < 32).sort((a, b) => hit(a) - hit(b))[0];
        if (target) engine.current.navigate(target);
        else { state.current.path = findPath(state.current, point,corridorBedInUse(latest.current.r)?[CORRIDOR_BED_OBSTACLE]:[]); state.current.destination = ''; }
      }} />
    <div class="world-placards">{occupants.map(occupant=>{const label=patientPlacard(r,occupant.patient);return <button type="button" key={occupant.patient.uid} hidden ref={element=>{if(element)placards.current.set(occupant.patient.uid,element);else placards.current.delete(occupant.patient.uid);}} class="world-placard" aria-label={`${label.name}，${label.status}，前往床旁`} disabled={props.frozen} onClick={()=>{if(blocked.current)return;const target=targetsRef.current.find(t=>t.patientId===occupant.patient.uid);if(target)engine.current.navigate(target);}}><span class="world-placard-content"><b>{label.name}</b><small>{label.status}</small></span></button>;})}</div>
    <div class="world-placards">{waiting.map(group=><button type="button" key={group.id} hidden ref={element=>{if(element)placards.current.set(group.id,element);else placards.current.delete(group.id);}} class="world-placard" aria-label={`${group.label}，${group.patients.length} 位，前往查看名单`} disabled={props.frozen} onClick={()=>{if(blocked.current)return;const target=targetsRef.current.find(t=>t.id===group.id);if(target)engine.current.navigate(target);}}><span class="world-placard-content"><b>{group.label}</b><small>{group.patients.length} 位 · 查看名单</small></span></button>)}</div>
    {band!=='clear'&&<p class="world-perception-message"><span aria-hidden="true">{[...perceptionText].map((glyph,index)=><span key={index} class={index===dropout?'world-ambient-dropout':undefined}>{glyph}</span>)}</span><span class="sr-only">{perceptionText}</span></p>}
    </div>
    {!ready && <div class="world-loading" role="status">{failed ? '病区画面未能载入，请刷新重试。进度已保留。' : '南屏医院 · 住院部'}</div>}
    <div class="world-vignette" aria-hidden="true" />
    <header class="rpg-hud">
      <button class="rpg-avatar" onClick={() => props.onMenu('character')} aria-label="角色状态"><img src={`${import.meta.env.BASE_URL}art/hero-walk.webp`} alt="" /></button>
      <div class="rpg-vitals">{(['stamina', 'san', 'emotion'] as Vital[]).map(v => <div class={`rpg-meter meter-${v}`} key={v}>
        <span>{VITAL_LABELS[v]}</span><div role="meter" aria-label={VITAL_LABELS[v]} aria-valuenow={r.vitals[v]} aria-valuemin={0} aria-valuemax={liveCap(r,v)}><i style={{ width: `${Math.max(0, Math.min(100,r.vitals[v] / liveCap(r,v) * 100))}%` }} /></div><b>{Math.round(r.vitals[v])}<small>/{liveCap(r,v)}</small></b>
      </div>)}</div>
      <div class="rpg-ap" title={`行动值 ${r.ap}，今日已预支 ${r.borrowed} 点`}><strong>行动 <b>{r.ap}</b></strong><div>{Array.from({ length: Math.max(RULES.ap,r.ap) }, (_, i) => <i class={i < r.ap ? 'filled' : ''} key={i} />)}</div><small>预支 {r.borrowed}/{RULES.borrowMax}</small></div>
      <div class="rpg-wallet"><strong>余额 ¥ {Math.round(r.cash).toLocaleString('zh-CN')}</strong><small>负债 ¥{Math.round(r.debt + r.privateDebt).toLocaleString('zh-CN')}</small></div>
      <button class="rpg-pause" aria-label="暂停与设置" onClick={() => props.onMenu('settings')}>Ⅱ</button>
    </header>
    <div class="rpg-location"><span>第 {String(r.day).padStart(2, '0')} 天</span><b>{room}</b><small>{r.day === 15 ? '医疗纠纷复核' : `距本次轮转结束 ${15 - r.day} 天`}</small></div>
    <div class="rpg-quest-button"><button onClick={() => setQuests(true)} disabled={props.frozen}><span>！</span>当班待办 <b>{availableEncounters({...r,phase:'play'}).length}</b></button></div>
    {props.guide && <div class="world-guide" ref={guideBox}>{props.guide}</div>}
    <div class="rpg-tools">
      <button onClick={() => props.onMenu('journal')} aria-label="病历夹"><ToolIcon kind="journal"/><span>病历</span></button>
      <button onClick={() => props.onMenu('character')} aria-label="角色与天赋"><ToolIcon kind="character"/><span>角色</span></button>
      <button onClick={()=>setOverview(true)} aria-label="打开病区地图"><ToolIcon kind="map"/><span>地图</span></button>
      <button onClick={() => setZoom(z => z === 1 ? 1.3 : 1)} aria-label="切换地图缩放"><ToolIcon kind="zoom"/><span>视野</span></button>
    </div>
    {!props.frozen && !selection && !quests && !overview && <>
      <div class="rpg-controls">
        <div class="joystick" role="group" aria-label="移动摇杆" onPointerDown={e => { if (pad.current.pointer !== -1) return; pad.current.pointer = e.pointerId; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); usePad(e); }} onPointerMove={usePad} onPointerUp={releasePad} onPointerCancel={releasePad} onLostPointerCapture={releasePad}><span class="joystick-cross" /><span ref={stick} class="joystick-knob" /></div>
        <button class="rpg-interact" disabled={!nearby} onClick={() => engine.current.interact()}><span>E</span><b>{nearby ? nearby.cards?.length ? '交互' : nearby.action ? '查看' : '交谈' : '交互'}</b></button>
      </div>
      <div class="rpg-nearby" aria-live="polite">{nearby ? nearby.label : props.visualInterference !== false ? ambientPerception(r) ?? '走近人物、病床或物件' : '走近人物、病床或物件'}</div>
      <p class="rpg-controls-hint">WASD / 方向键移动 · E / 空格交互 · J 病历 · Esc 设置 · 点击地面行走</p>
    </>}
    {(selection || quests) && <div ref={menu} class="rpg-map-menu" role="dialog" aria-modal="true" aria-label={selection?.label ?? '当班待办'}>
      <div class="rpg-menu-heading"><h2>{selection?.label ?? '当班待办'}</h2><button aria-label="关闭" onClick={() => { setSelection(null); setQuests(false); }}>×</button></div>
      {quests&&<p class="rpg-agenda-scope">当前阶段：{r.shiftPhase??'当班'}。这里只列本阶段待办；后续门诊、复评和突发情况可能继续增加任务。</p>}
      {(selection?.cards ?? availableEncounters(r)).map(card => {const patient=r.patients.find(p=>p.uid===card.patientId),title=card.title==='信息'?'入院核查':card.title,who=patient?`${patient.bed?`${patient.bed} 床 · `:awaitingBed(r,patient)||underObservation(r,patient)?'留观 · ':''}${patient.name}`:ACTORS[card.actor ?? '']?.name ?? '值班室';return <button class="rpg-menu-row" key={card.id} aria-label={`${title}，${who}，${selection?'开始交互':'前往办理'}`} onClick={() => { setSelection(null); setQuests(false); if (selection) props.onEncounter(card); else { const t = targets.find(t => t.cards?.some(c => c.id === card.id)); if (t) engine.current.navigate(t); } }}><span aria-hidden="true">▸</span><b>{title}</b><small>{who}</small></button>;})}
      {selection?.waitingPatients?.map(patient=><button class="rpg-menu-row" key={`waiting:${patient.uid}`} onClick={()=>{setSelection(null);props.onPatient(patient.uid);}}><span aria-hidden="true">▤</span><b>{patient.name}</b><small>候床 · 查看现有病历</small></button>)}
      {!selection && <p>选定目的地后沿路线前往。</p>}
    </div>}
    {overview && <div ref={menu} class="rpg-map-menu hospital-overview" role="dialog" aria-modal="true" aria-label="病区地图">
      <div class="rpg-menu-heading"><h2>住院部 · 楼层图</h2><button aria-label="关闭地图" onClick={()=>setOverview(false)}>×</button></div>
      <div class="hospital-map-grid">{ROOMS.map((place,index)=>{
        const beds=BED_PLACES.filter(b=>b.target.x>=place.target.x&&b.target.x<place.target.x+place.target.w);
        const occupied=r.patients.filter(p=>p.active&&p.inpatient&&beds.some(b=>b.bed===p.bed)).length;
        return <>{index===6&&<div class="hospital-map-corridor">公共走廊</div>}<button key={place.id} class={`map-room map-room-${place.kind}`} onClick={()=>{setOverview(false);engine.current.navigate({...place.interaction,id:`room:${place.id}`,label:place.name});}}><b>{place.name}</b><small>{place.kind==='ward'?`${occupied} / 4 床`:place.id==='observation'||place.id==='er'?`${temporaryPatients(r,availableEncounters(r),place.id).length} 位患者`:room===place.name?'你在这里':'前往'}</small></button></>;
      })}</div><div class="map-amenities">{[{id:'coffee',label:'前往咖啡台'},{id:'nap',label:'前往午睡沙发'},{id:'borrow',label:'前往排班表'}].map(item=><button class="rpg-menu-row" key={item.id} onClick={()=>{setOverview(false);const target=targets.find(t=>t.id===item.id);if(target)engine.current.navigate(target);}}><b>{item.label}</b><small>{item.id==='borrow'?'护士站':targets.find(t=>t.id===item.id)?.label}</small></button>)}</div>{corridorBedInUse(r)&&<button class="rpg-menu-row" onClick={()=>{setOverview(false);const target=targets.find(t=>t.id==='bed:17');if(target)engine.current.navigate(target);}}><b>公共走廊 · 17 加床</b><small>{r.patients.find(p=>p.active&&p.inpatient&&p.bed===17)?.name}</small></button>}<p>点选房间后沿走廊前往。病床与人物处按 E 或点交互。</p>
    </div>}
    {children}
  </section>;
}
