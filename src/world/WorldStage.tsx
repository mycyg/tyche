import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { availableEncounters } from '../game/engine';
import { ACTORS, VITAL_LABELS } from '../game/rules';
import type { Action, Card, Run, Vital } from '../game/types';
import { distance, findPath, move, roomName, SPAWN, walkable, WORLD, type Point } from './navigation';
import { BED_PLACES, PROPS, paintProp, paintWorldMap } from './scene';
import { idlePose } from './idle';
import { patientArtIndex } from './patients';
import { awaitingBed } from '../game/cards';
import { ROOMS } from './layout';
import { worldOccupants } from './occupants';

interface Target extends Point { id: string; label: string; actor?: string; patientId?: string; cards?: Card[]; action?: 'coffee' | 'nap' | 'borrow' | 'journal' | 'ward'; text?: string }
const PEOPLE = [
  { id: 'chief', x: 638, y: 159, cell: 0 },
  { id: 'nurse', x: 397, y: 183, cell: 1 },
  { id: 'peer', x: 587, y: 394, cell: 2 },
  { id: 'research', x: 1154, y: 404, cell: 3 },
  { id: 'rep', x: 659, y: 278, cell: 4 },
];
export function worldTargets(r: Run): Target[] {
  const encounters = availableEncounters(r);
  const occupants = worldOccupants(r, encounters);
  const targets: Target[] = PEOPLE.map(p => ({ ...p, actor: p.id, label: ACTORS[p.id].name,
    text: ({ chief: '“这层楼的床位要转起来。病人能不能走，你签字。”', nurse: '“床头夹都在。没问过的，别当成没有；没排除的，别写成正常。”', peer: '李恂把手机扣在桌上。“你今天还有几个没看完？”', research: '周乔抬头看了一眼钟。“数据不会自己长出来，病历也不会自己写完。”', rep: '“有需要，随时找我。”叶茗收起手机，没有离开走廊。' } as Record<string, string>)[p.id] }));
  targets.push(
    { id: 'phone', x: 54, y: 270, label: '走廊电话', actor: 'father', text: r.facts['family-accident'] ? '通话记录里，家里的号码排在最上面。' : '屏幕上有家里的号码。你把音量调高了一格。' },
    { id: 'coffee', x: 556, y: 426, label: '咖啡 · ¥15', action: 'coffee' },
    { id: 'nap', x: 690, y: 455, label: '值班沙发 · 午睡', action: 'nap' },
    { id: 'borrow', x: 343, y: 180, label: '排班表 · 预支行动', action: 'borrow' },
    { id: 'journal', x: 326, y: 398, label: '档案柜 · 旧病历', action: 'journal' },
    { id: 'ward', x: 440, y: 183, label: '住院台账', action: 'ward' },
  );
  for (const {patient,place} of occupants.filter(o=>o.patient.inpatient||awaitingBed(r,o.patient))) {
    targets.push({...place.target,id:patient.inpatient?`bed:${patient.bed}`:`observation:${patient.uid}`,
      label:`${patient.inpatient?`${patient.bed} 床`:'留观'} · ${patient.name}`,patientId:patient.uid});
  }
  for (const card of encounters) {
    let key: string, point: Point, label: string;
    if (card.patientId && card.kind !== 'night' && card.kind !== 'quick') {
      const p = r.patients.find(p => p.uid === card.patientId)!;
      const place = BED_PLACES.find(b => b.bed === p.bed);
      key = !p.active ? 'phone' : place ? `bed:${p.bed}` : `observation:${p.uid}`;
      point = !p.active?{x:54,y:270}:place?.target ?? occupants.find(o=>o.patient.uid===p.uid)?.place.target ?? {x:1412,y:367};
      label = !p.active?`出院回访 · ${p.name}`:place?`${p.bed} 床 · ${p.name}`:`留观 · ${p.name}`;
    } else if (card.kind === 'night') { key = 'emergency'; point = { x: 132, y: 367 }; label = '急救呼叫'; }
    else if (card.kind === 'quick') { key = 'outpatient'; point = { x: 316, y: 273 }; label = '待诊患者'; }
    else if (card.kind === 'rest') { key = 'day-end'; point = { x: 678, y: 373 }; label = '交班 · 结束本日'; }
    else if (card.actor === 'father') { key = 'phone'; point = { x: 54, y: 270 }; label = '家里来电'; }
    else { key = card.actor ?? 'nurse'; point = PEOPLE.find(p => p.id === key) ?? PEOPLE[1]; label = ACTORS[key]?.name ?? card.title; }
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
  dialogueOpen?: boolean;
  children?: ComponentChildren;
  onEncounter: (card: Card) => void;
  onPatient: (id: string) => void;
  onBedNear?: () => void;
  guide?: ComponentChildren;
  onAmbient: (label: string, text: string, actor?: string) => void;
  onAction: (a: Action) => void;
  onMenu: (panel: 'settings' | 'journal' | 'ward' | 'character' | 'archive') => void;
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
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const [nearby, setNearby] = useState<Target | null>(null), [room, setRoom] = useState('南屏医院 · 住院部');
  const [selection, setSelection] = useState<Target | null>(null), [quests, setQuests] = useState(false);
  const [overview,setOverview]=useState(false);
  const menu=useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const pad = useRef({ x: 0, y: 0, pointer: -1 });
  const stick = useRef<HTMLSpanElement>(null);
  const input = useRef(new Set<string>());
  const state = useRef({ x: SPAWN.x, y: SPAWN.y, facing: SPAWN.facing, moving: false, path: [] as Point[], destination: '' });
  const camera = useRef({ x: 0, y: 0, scale: 1 });
  const engine = useRef({ interact: (_t?: Target) => {}, navigate: (_t: Target) => {} });
  const open = (t: Target) => {
    if (latest.current.frozen || latest.current.r.phase !== 'play') return;
    latest.current.onPosition({ x:state.current.x, y:state.current.y, facing:state.current.facing, day:latest.current.r.day });
    if (t.cards?.length === 1) latest.current.onEncounter(t.cards[0]);
    else if (t.cards?.length) setSelection(t);
    else if (t.patientId) latest.current.onPatient(t.patientId);
    else if (t.action === 'journal' || t.action === 'ward') latest.current.onMenu(t.action);
    else if (t.action) latest.current.onAction({ type: t.action });
    else latest.current.onAmbient(t.label, t.text ?? '暂时没有新的消息。', t.actor);
  };
  const openRef = useRef(open); openRef.current = open;
  useEffect(()=>{
    const el=menu.current;
    if(!el) return;
    const previous=document.activeElement as HTMLElement|null;
    el.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey=(event:KeyboardEvent)=>{
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
    const observer=new ResizeObserver(()=>setGuideHeight(el.getBoundingClientRect().height));
    observer.observe(el);return()=>observer.disconnect();
  },[!!props.guide]);
  useEffect(() => {
    const saved = latest.current.r.world;
    const pos = saved?.day === r.day && walkable(saved) ? saved : SPAWN;
    state.current = { ...pos, moving: false, path: [], destination: '' };
  }, [r.id, r.day]);
  useEffect(() => {
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
    const sources = ['ward-map.webp', 'hero-walk.webp', 'npc-idle.webp', 'bed-patients.webp'];
    const images = sources.map(src => { const img = new Image(); img.src = `${import.meta.env.BASE_URL}art/${src}`; return img; });
    let stopped = false, raf = 0, width = 1, height = 1, last = 0, wasMoving = false, lastNear = '', lastRoom = '', lastTick = 0;
    const resize = () => { width = container.clientWidth; height = container.clientHeight; c.width = Math.round(width); c.height = Math.round(height); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const nearest = () => targetsRef.current.filter(t => distance(state.current, t) < 45).sort((a, b) => distance(state.current, a) - distance(state.current, b))[0];
    const interact = (target?: Target) => { if (!blocked.current) { const t = target ?? nearest(); if (t && distance(state.current, t) < 52) openRef.current(t); } };
    const navigate = (t: Target) => { state.current.path = findPath(state.current, t); state.current.destination = t.id; if (distance(state.current, t) < 30) interact(t); };
    engine.current = { interact, navigate };
    const savePosition = () => latest.current.onPosition({ x: state.current.x, y: state.current.y, facing: state.current.facing, day: latest.current.r.day });
    const reset = () => { input.current.clear(); pad.current.x = pad.current.y = 0; state.current.path = []; state.current.destination = ''; if (stick.current) stick.current.style.transform = 'translate(0, 0)'; if (wasMoving) savePosition(); wasMoving = false; };
    const keydown = (e: KeyboardEvent) => {
      if (blocked.current || (e.target as HTMLElement)?.closest('input,textarea,select,dialog,[role="dialog"]')) return;
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
      let dx = 0, dy = 0;
      if (!blocked.current) {
        const keys = input.current;
        dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')) + pad.current.x;
        dy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')) + pad.current.y;
        if (!dx && !dy && player.path.length) {
          const target = player.path[0], dist = distance(player, target);
          if (dist < 3) player.path.shift();
          else { dx = (target.x - player.x) / dist; dy = (target.y - player.y) / dist; }
        }
        const length = Math.hypot(dx, dy);
        if (length > 1) { dx /= length; dy /= length; }
        const speed = WORLD.speed * (keys.has('shift') ? 1.45 : 1);
        const next = move(player, dx * speed * dt, dy * speed * dt);
        player.moving = distance(player, next) > .01;
        player.x = next.x; player.y = next.y;
        if (Math.abs(dx) > Math.abs(dy)) player.facing = dx > 0 ? 3 : 1;
        else if (dy) player.facing = dy > 0 ? 0 : 2;
        if (player.destination && !player.path.length) {
          const t = targetsRef.current.find(t => t.id === player.destination); player.destination = ''; if (t) interact(t);
        }
      } else player.moving = false;
      if (wasMoving && !player.moving) savePosition();
      wasMoving = player.moving;
      const scale = Math.max(width / WORLD.width, height / WORLD.height, Math.min(2.4, width / 700)) * zoom;
      const viewW = width / scale, viewH = height / scale;
      const cam = { x: Math.max(0, Math.min(WORLD.width - viewW, player.x - viewW / 2)), y: Math.max(0, Math.min(WORLD.height - viewH, player.y - viewH * .49)), scale };
      camera.current = cam;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#08101b'; ctx.fillRect(0, 0, width, height);
      ctx.save(); ctx.scale(scale, scale); ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
      paintWorldMap(ctx, images[0]);
      const night = p.r.queue.slice(p.r.cursor).some(c => c.kind === 'night') && !p.r.queue.slice(p.r.cursor).some(c => c.kind !== 'night' && c.kind !== 'rest');
      if (player.path.length && !blocked.current) {
        ctx.fillStyle = '#ffe5a2'; player.path.forEach((p, i) => { if (i % 3 === 0) ctx.fillRect(p.x - 1, p.y - 1, 2, 2); });
      }
      const sprites = [...PEOPLE.map(person => ({ ...person, hero: false })), { x: player.x, y: player.y, id: 'hero', cell: 0, hero: true }];
      const layers = PROPS.map(prop => ({depth:prop.depth,draw:()=>paintProp(ctx,images[0],prop)}));
      for(const {patient,place:bed} of worldOccupants(p.r,availableEncounters({...p.r,phase:'play'}))) {
        const index=Math.min(19,patientArtIndex(patient.caseId));
        layers.push({depth:bed.depth,draw:()=>{
          const pose=idlePose(time,patient.uid,motion&&patient.damage<3&&patient.caseId!=='C020');
          const rise=pose.breathe*.55;
          ctx.drawImage(images[3],index%5*128,Math.floor(index/5)*128,128,128,bed.x,bed.y-rise,bed.width,bed.height+rise);
        }});
      }
      for (const sp of sprites) layers.push({depth:sp.y,draw:()=>{
        const pose=idlePose(time,sp.id,motion && !(sp.hero && player.moving));
        ctx.fillStyle = 'rgba(8, 14, 28, .38)'; ctx.beginPath(); ctx.ellipse(sp.x, sp.y - 2, sp.hero ? 13 : 12, 5, 0, 0, Math.PI * 2); ctx.fill();
        if (sp.hero) {
          const img = images[1], cellW = img.width / 4, cellH = img.height / 4;
          const step = player.moving && motion ? Math.floor(time / 145) % 4 : pose.frame === 2 ? 3 : 1;
          ctx.drawImage(img, step * cellW, player.facing * cellH, cellW, cellH, Math.round(sp.x - 34+pose.lean), Math.round(sp.y - 63-pose.breathe), 68, 68+Math.round(pose.breathe));
        } else {
          const img = images[2], cellW = img.width / 4, cellH = img.height / 6;
          ctx.drawImage(img, pose.frame * cellW, sp.cell * cellH, cellW, cellH, Math.round(sp.x - 36+pose.lean), Math.round(sp.y - 67-pose.breathe), 72, 72+Math.round(pose.breathe));
        }
      }});
      layers.sort((a,b)=>a.depth-b.depth).forEach(layer=>layer.draw());
      if (night || p.r.day > 5) { ctx.fillStyle = night ? 'rgba(14, 20, 69, .23)' : `rgba(35, 18, 46, ${Math.min(.17, (p.r.day - 5) * .014)})`; ctx.fillRect(0, 0, WORLD.width, WORLD.height); }
      const near = nearest();
      for (const t of targetsRef.current) {
        const quest = !!t.cards?.length, dist = distance(player, t);
        if (quest) {
          const y = t.y - (t.actor && t.id !== 'phone' ? 63 : 22);
          const bob = motion ? Math.round(Math.sin(time / 400) * 2) : 0;
          ctx.fillStyle = '#151a35'; ctx.fillRect(t.x - 6, y - 9 + bob, 12, 16);
          ctx.fillStyle = t.id === 'emergency' ? '#ff787e' : '#ffe3a0'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.fillText('!', t.x, y + 4 + bob);
        }
        if (dist < 84 && (quest || t.id === near?.id)) {
          ctx.font = '10px sans-serif'; const w = Math.min(190, ctx.measureText(t.label).width + 14);
          ctx.fillStyle = 'rgba(9, 14, 33, .9)'; ctx.fillRect(t.x - w / 2, t.y + 7, w, 17);
          ctx.fillStyle = '#f3eddd'; ctx.textAlign = 'center'; ctx.fillText(t.label, t.x, t.y + 19, w - 10);
        }
      }
      ctx.restore();
      if (time - lastTick > 100) {
        lastTick = time;
        const nearKey = near ? near.id + ':' + (near.cards?.map(c=>c.id).join(',') ?? '') : '';
        if (nearKey !== lastNear) { lastNear = nearKey; setNearby(near ?? null); if(near?.patientId) latest.current.onBedNear?.(); }
        const name = roomName(player); if (name !== lastRoom) { lastRoom = name; setRoom(name); }
      }
      raf = requestAnimationFrame(draw);
    };
    Promise.all(images.map(img => img.decode())).then(() => { if (!stopped) { setReady(true); raf = requestAnimationFrame(draw); } }).catch(() => { if (!stopped) setFailed(true); });
    return () => { stopped = true; cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', reset); document.removeEventListener('visibilitychange', reset); };
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
  return <section class={`world-stage ${props.dialogueOpen ? 'with-dialogue' : ''}`} style={{'--guide-space':`${props.guide?guideHeight:0}px`}} aria-label="南屏医院">
    <div ref={frame} class="world-viewport">
    <canvas ref={canvas} class="world-canvas" tabIndex={0} aria-label="医院地图。方向键或 WASD 移动，E 或空格交互，J 打开病历。也可点击目的地行走。"
      onPointerDown={e => {
        if (blocked.current) return; canvas.current?.focus();
        const rect = canvas.current!.getBoundingClientRect(), cam = camera.current;
        const point = { x: (e.clientX - rect.left) / cam.scale + cam.x, y: (e.clientY - rect.top) / cam.scale + cam.y };
        const target = targetsRef.current.filter(t => distance(point, { x: t.x, y: t.y - 20 }) < 32).sort((a, b) => distance(point, a) - distance(point, b))[0];
        if (target) engine.current.navigate(target);
        else { state.current.path = findPath(state.current, point); state.current.destination = ''; }
      }} />
    </div>
    {!ready && <div class="world-loading" role="status">{failed ? '病区画面未能载入，请刷新重试。进度已保留。' : '南屏医院 · 住院部'}</div>}
    <div class="world-vignette" aria-hidden="true" />
    <header class="rpg-hud">
      <button class="rpg-avatar" onClick={() => props.onMenu('character')} aria-label="角色状态"><img src={`${import.meta.env.BASE_URL}art/hero-walk.webp`} alt="" /></button>
      <div class="rpg-vitals">{(['stamina', 'san', 'emotion'] as Vital[]).map(v => <div class={`rpg-meter meter-${v}`} key={v}>
        <span>{VITAL_LABELS[v]}</span><div role="meter" aria-label={VITAL_LABELS[v]} aria-valuenow={r.vitals[v]} aria-valuemin={0} aria-valuemax={r.caps[v]}><i style={{ width: `${Math.max(0, r.vitals[v] / r.caps[v] * 100)}%` }} /></div><b>{Math.round(r.vitals[v])}<small>/{r.caps[v]}</small></b>
      </div>)}</div>
      <div class="rpg-ap" title={`行动值 ${r.ap}，今日已预支 ${r.borrowed} 点`}><strong>行动 <b>{r.ap}</b></strong><div>{Array.from({ length: 10 }, (_, i) => <i class={i < r.ap ? 'filled' : ''} key={i} />)}</div><small>预支 {r.borrowed}/4</small></div>
      <div class="rpg-wallet"><strong>¥ {Math.round(r.cash).toLocaleString('zh-CN')}</strong><small>负债 ¥{Math.round(r.debt + r.privateDebt).toLocaleString('zh-CN')}</small></div>
      <button class="rpg-pause" aria-label="暂停与设置" onClick={() => props.onMenu('settings')}>Ⅱ</button>
    </header>
    <div class="rpg-location"><span>第 {String(Math.min(14, r.day)).padStart(2, '0')} 天</span><b>{room}</b><small>{r.day === 15 ? '鉴定日' : `距鉴定庭 ${15 - r.day} 天`}</small></div>
    <div class="rpg-quest-button"><button onClick={() => setQuests(true)} disabled={props.frozen}><span>！</span>当班待办 <b>{availableEncounters({...r,phase:'play'}).length}</b></button></div>
    {props.guide && <div class="world-guide" ref={guideBox}>{props.guide}</div>}
    <div class="rpg-tools"><button onClick={() => props.onMenu('journal')} aria-label="病历夹">▤<span>病历</span></button><button onClick={() => props.onMenu('character')} aria-label="角色与天赋">◇<span>角色</span></button><button onClick={()=>setOverview(true)} aria-label="打开病区地图">▦<span>地图</span></button><button onClick={() => setZoom(z => z === 1 ? 1.3 : 1)} aria-label="切换地图缩放">⌕<span>视野</span></button></div>
    {!props.frozen && !selection && !quests && !overview && <>
      <div class="rpg-controls">
        <div class="joystick" role="group" aria-label="移动摇杆" onPointerDown={e => { if (pad.current.pointer !== -1) return; pad.current.pointer = e.pointerId; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); usePad(e); }} onPointerMove={usePad} onPointerUp={releasePad} onPointerCancel={releasePad} onLostPointerCapture={releasePad}><span class="joystick-cross" /><span ref={stick} class="joystick-knob" /></div>
        <button class="rpg-interact" disabled={!nearby} onClick={() => engine.current.interact()}><span>E</span><b>{nearby ? nearby.cards?.length ? '交互' : nearby.action ? '查看' : '交谈' : '交互'}</b></button>
      </div>
      <div class="rpg-nearby" aria-live="polite">{nearby ? nearby.label : '走近人物、病床或物件'}</div>
      <p class="rpg-controls-hint">WASD / 方向键 移动 · E 交互 · 点击地面行走</p>
    </>}
    {(selection || quests) && <div ref={menu} class="rpg-map-menu" role="dialog" aria-modal="true" aria-label={selection?.label ?? '当班待办'}>
      <div class="rpg-menu-heading"><h2>{selection?.label ?? '当班待办'}</h2><button aria-label="关闭" onClick={() => { setSelection(null); setQuests(false); }}>×</button></div>
      {(selection?.cards ?? availableEncounters(r)).map(card => {const patient=r.patients.find(p=>p.uid===card.patientId);return <button class="rpg-menu-row" key={card.id} onClick={() => { setSelection(null); setQuests(false); if (selection) props.onEncounter(card); else { const t = targets.find(t => t.cards?.some(c => c.id === card.id)); if (t) engine.current.navigate(t); } }}><span>▸</span><b>{card.title==='信息'?'入院核查':card.title}</b><small>{patient?`${patient.bed?`${patient.bed} 床 · `:awaitingBed(r,patient)?'留观 · ':''}${patient.name}`:ACTORS[card.actor ?? '']?.name ?? '值班室'}</small></button>;})}
      {!selection && <p>选定目的地后沿路线前往。</p>}
    </div>}
    {overview && <div ref={menu} class="rpg-map-menu hospital-overview" role="dialog" aria-modal="true" aria-label="病区地图">
      <div class="rpg-menu-heading"><h2>住院部 · 楼层图</h2><button aria-label="关闭地图" onClick={()=>setOverview(false)}>×</button></div>
      <div class="hospital-map-grid">{ROOMS.map((place,index)=>{
        const beds=BED_PLACES.filter(b=>b.target.x>=place.target.x&&b.target.x<place.target.x+place.target.w);
        const occupied=r.patients.filter(p=>p.active&&p.inpatient&&beds.some(b=>b.bed===p.bed)).length;
        return <>{index===6&&<div class="hospital-map-corridor">公共走廊</div>}<button key={place.id} class={`map-room map-room-${place.kind}`} onClick={()=>{setOverview(false);engine.current.navigate({...place.interaction,id:`room:${place.id}`,label:place.name});}}><b>{place.name}</b><small>{place.kind==='ward'?`${occupied} / 4 床`:place.id==='observation'?`${r.patients.filter(p=>awaitingBed(r,p)).length} 人留观`:room===place.name?'你在这里':'前往'}</small></button></>;
      })}</div><p>点选房间后沿走廊前往。病床与人物处按 E 或点交互。</p>
    </div>}
    {children}
  </section>;
}
