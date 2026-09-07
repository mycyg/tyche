import { describe, expect, it, vi } from 'vitest';
import { BED_PLACES, PROPS, paintProp, paintWorldMap } from './scene';
import { CORRIDOR, ROOMS, ROOM_OBSTACLES, placeRect } from './layout';
import { WORLD, SPAWN, findPath, followPath, move, roomName, walkable, type Point } from './navigation';

function reachable(target: Point) {
  expect(walkable(target), JSON.stringify(target)).toBe(true);
  const path = findPath(SPAWN, target);
  expect(path.length).toBeGreaterThan(0);
  let current: Point = { ...SPAWN };
  for (const next of path) {
    // Replay the route through actual movement, rather than testing only nodes.
    current = move(current, next.x - current.x, next.y - current.y);
    expect(current.x).toBeCloseTo(next.x, 5);
    expect(current.y).toBeCloseTo(next.y, 5);
    expect(walkable(current)).toBe(true);
  }
  expect(current.x).toBeCloseTo(target.x, 5);
  expect(current.y).toBeCloseTo(target.y, 5);
}

describe('expanded ward navigation', () => {
  it('replays real subpixel movement across every room at 25–240 Hz without sticking on a doorway',()=>{
    for(const hz of [25,30,50,60,90,120,144,240])for(const room of ROOMS){
      let point={x:132,y:176};const path=findPath(point,room.interaction);
      for(let frame=0;frame<hz*40&&path.length;frame++){point=followPath(point,path,WORLD.speed/hz);expect(walkable(point),`${hz}Hz ${room.id}`).toBe(true);}
      expect(path,`${hz}Hz ${room.id} at ${JSON.stringify(point)}`).toHaveLength(0);expect(point).toEqual(room.interaction);
    }
  },15000);
  it('keeps safe movement resolution and the original nurse-station spawn', () => {
    expect(WORLD).toEqual({ width: 1536, height: 512, speed: 105, radius: 5, cell: 8 });
    expect(SPAWN).toEqual({ x: 406, y: 273, facing: 0 });
    expect(walkable(SPAWN)).toBe(true);
  });

  it('has exactly four beds per ward, without a copied centre bed', () => {
    expect(BED_PLACES.map(p => p.bed)).toEqual(Array.from({ length: 12 }, (_, i) => i + 5));
    const beds = PROPS.filter(p => /^ward-[abc]-.+-bed$/.test(p.id));
    expect(beds).toHaveLength(12);
    expect(PROPS.some(p => p.id.includes('center'))).toBe(false);
  });

  for (const bed of BED_PLACES) {
    it(`reaches bed ${bed.bed} without cutting through its footprint`, () => reachable(bed.target));
  }
  for (const room of ROOMS) {
    it(`reaches the doorway and interaction point in ${room.name}`, () => {
      reachable(room.entrance);
      reachable(room.interaction);
      expect(roomName(room.interaction)).toBe(room.name);
    });
    it(`blocks closed wall segments and furniture in ${room.name}`, () => {
      const bottom = room.target.y > 0;
      const outside = { x: room.target.x + 220, y: bottom ? 276 : 216 };
      const attempted = move(outside, 0, bottom ? 80 : -80);
      expect(bottom ? attempted.y < 300 : attempted.y >= 199).toBe(true);
      for (const local of ROOM_OBSTACLES[room.kind]) {
        const rect = placeRect(local, room);
        expect(walkable({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 })).toBe(false);
      }
      const partition = { x: room.target.x + 254, y: bottom ? 380 : 145 };
      expect(walkable(partition)).toBe(false);
    });
  }

  it('crosses all six columns and the old stair location', () => {
    for (const x of [100, 508, 720, 764, 1020, 1280, 1516]) reachable({ x, y: 268 });
    expect(move({ x: 680, y: 268 }, 800, 0).x).toBeCloseTo(1480);
    expect(roomName({ x: 1400, y: 240 })).toBe('南屏医院 · 住院部');
  });

  it('cannot tunnel through a bed with one large movement request', () => {
    for (const offset of [0, 768, 1024]) {
      const stopped = move({ x: offset + 100, y: 145 }, -85, 0);
      expect(stopped.x).toBeGreaterThan(offset + 82 + WORLD.radius);
      expect(stopped.x).toBeLessThan(offset + 100);
    }
    expect(walkable({ x: -1, y: 260 })).toBe(false);
    expect(walkable({ x: 1537, y: 260 })).toBe(false);
  });
});

describe('source-map composition', () => {
  function canvas() {
    return { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
      imageSmoothingEnabled: true };
  }
  const map = { width: 1536, height: 1024, naturalWidth: 1536, naturalHeight: 1024 } as HTMLImageElement;

  it('composes twelve room crops and corridor tiles without stretching the source', () => {
    const ctx = canvas();
    paintWorldMap(ctx as unknown as CanvasRenderingContext2D, map);
    const calls = ctx.drawImage.mock.calls;
    expect(calls.slice(0, 12)).toHaveLength(12);
    for (const call of calls) {
      expect(call[3] / 2).toBe(call[7]);
      expect(call[4] / 2).toBe(call[8]);
      expect(call[5] + call[7]).toBeLessThanOrEqual(WORLD.width);
    }
    const floor = calls.filter(c => c[6] >= CORRIDOR.y && c[6] < CORRIDOR.y + CORRIDOR.h && c[5] >= 64);
    expect(floor.length).toBeGreaterThan(20);
    expect(floor.every(c => c[1] / 2 === 184)).toBe(true);
  });

  it('retains polygon clipping after translating the pharmacy counter', () => {
    const original = PROPS.find(p => p.id === 'station-counter')!;
    const copy = PROPS.find(p => p.id === 'pharmacy-counter')!;
    expect(copy.source).toEqual(original.source);
    expect(copy.polygon).toEqual(original.polygon!.map(p => ({ x: p.x + 1024, y: p.y })));
    const ctx = canvas();
    paintProp(ctx as unknown as CanvasRenderingContext2D, map, copy);
    expect(ctx.clip).toHaveBeenCalledOnce();
    expect(ctx.lineTo).toHaveBeenCalledTimes(copy.polygon!.length - 1);
    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(ctx.drawImage.mock.calls[0].slice(5)).toEqual([copy.x, copy.y, copy.w, copy.h]);
  });
});
