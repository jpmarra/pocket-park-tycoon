import { describe, expect, it } from 'vitest';
import { createPark, createCoasterRide, buildPath, entranceTile } from '../src/sim/grid';
import {
  startTrack, addPiece, undoPiece, isClosed, trackCost, trackStats,
  COASTER_DESIGNS, COASTER_TYPES, buildDesign, canBuildDesign, designPieces,
  designStats, designCost, getDesign, op, STRAIGHT,
} from '../src/sim/coaster';
import type { TrackBuilder } from '../src/sim/coaster';
import { spawnGuest } from '../src/sim/guest';
import { step } from '../src/sim/park';
import { QUEUE_PATIENCE } from '../src/sim/types';

const chainUp = op({ slope: 1, chain: true });

describe('coaster builder constraints', () => {
  function freshBuilder(typeId = 'coaster-twister'): { s: ReturnType<typeof createPark>; b: TrackBuilder } {
    const s = createPark(3);
    const b = startTrack(s, typeId, 10, 10, 0) as TrackBuilder;
    expect(typeof b).not.toBe('string');
    return { s, b };
  }

  it('rejects going below ground', () => {
    const { s, b } = freshBuilder();
    expect(addPiece(s, b, op({ slope: -1 }))).toMatch(/below ground/);
  });

  it('rejects crossing itself', () => {
    const { s, b } = freshBuilder();
    addPiece(s, b, op({ turn: 1 }));
    addPiece(s, b, op({ turn: 1 }));
    addPiece(s, b, op({ turn: 1 }));
    expect(addPiece(s, b, STRAIGHT)).toMatch(/cross itself/);
  });

  it('rejects inversions on wooden coasters', () => {
    const { s, b } = freshBuilder('coaster-wooden');
    expect(addPiece(s, b, op({ special: 'loop' }))).toMatch(/cannot do inversions/);
  });

  it('rejects steep slopes on the mini coaster', () => {
    const { s, b } = freshBuilder('coaster-mini');
    expect(addPiece(s, b, op({ slope: 2 }))).toMatch(/steep/);
  });

  it('rejects chain lifts downhill and banking on steep track', () => {
    const { s, b } = freshBuilder();
    addPiece(s, b, chainUp);
    expect(addPiece(s, b, op({ slope: -1, chain: true }))).toMatch(/uphill/);
    expect(addPiece(s, b, op({ slope: 2, bank: 1 }))).toMatch(/bank|steep/i);
  });

  it('rejects turning steep track and inversions on slopes', () => {
    const { s, b } = freshBuilder();
    expect(addPiece(s, b, op({ slope: 2, turn: 1 }))).toMatch(/cannot turn/);
    expect(addPiece(s, b, op({ special: 'loop', slope: 1 }))).toMatch(/straight, level/);
  });

  it('undo restores the head pose', () => {
    const { s, b } = freshBuilder();
    addPiece(s, b, chainUp);
    expect(b.head.z).toBe(1);
    expect(undoPiece(b)).toBe(true);
    expect(b.head.z).toBe(0);
    expect(undoPiece(b)).toBe(false); // station stays
  });
});

describe('coaster physics validation', () => {
  it('a loop without enough drop height is rejected as too slow', () => {
    const s = createPark(3);
    const b = startTrack(s, 'coaster-twister', 10, 10, 0) as TrackBuilder;
    addPiece(s, b, chainUp);
    addPiece(s, b, op({ slope: -1 }));
    expect(addPiece(s, b, op({ special: 'loop' }))).toBeNull(); // builds fine...
    // ...but the stats pass flags it.
    // Close a minimal rectangle to make the circuit testable.
    const stats = trackStats(b.pieces, 'coaster-twister');
    expect(stats.valid).toBe(false);
    expect(stats.reason).toMatch(/[Tt]oo slow/);
  });

  it('a circuit with an unchained climb it cannot crest is invalid', () => {
    const s = createPark(3);
    const b = startTrack(s, 'coaster-twister', 10, 10, 0) as TrackBuilder;
    for (let i = 0; i < 5; i++) addPiece(s, b, op({ slope: 1 })); // no chain!
    const stats = trackStats(b.pieces, 'coaster-twister');
    expect(stats.valid).toBe(false);
    expect(stats.reason).toMatch(/stalls/);
  });

  it('brakes cap the train speed', () => {
    const d = getDesign('cyclone')!;
    const pieces = designPieces(d);
    expect(typeof pieces).not.toBe('string');
    const stats = designStats(d);
    expect(stats.valid).toBe(true);
    // The cyclone has a brake run; its lap completes and max speed is sane.
    expect(stats.maxSpeed).toBeGreaterThan(0.15);
    expect(stats.maxSpeed).toBeLessThanOrEqual(0.6);
  });

  it('banked corners produce less lateral G than flat corners', () => {
    const mkRect = (banked: boolean): TrackBuilder => {
      const s = createPark(3);
      const b = startTrack(s, 'coaster-twister', 10, 10, 0) as TrackBuilder;
      const corner = banked ? op({ turn: 1, bank: 1 }) : op({ turn: 1 });
      addPiece(s, b, chainUp);
      addPiece(s, b, chainUp);
      addPiece(s, b, op({ slope: -1 }));
      addPiece(s, b, op({ slope: -1 }));
      addPiece(s, b, STRAIGHT);
      addPiece(s, b, corner);
      addPiece(s, b, STRAIGHT);
      addPiece(s, b, STRAIGHT);
      addPiece(s, b, STRAIGHT);
      addPiece(s, b, corner);
      for (let i = 0; i < 6; i++) addPiece(s, b, STRAIGHT);
      addPiece(s, b, corner);
      addPiece(s, b, STRAIGHT);
      addPiece(s, b, STRAIGHT);
      addPiece(s, b, STRAIGHT);
      addPiece(s, b, corner);
      expect(isClosed(b)).toBe(true);
      return b;
    };
    const flat = trackStats(mkRect(false).pieces, 'coaster-twister');
    const banked = trackStats(mkRect(true).pieces, 'coaster-twister');
    expect(flat.valid).toBe(true);
    expect(banked.valid).toBe(true);
    expect(banked.maxLatG).toBeLessThan(flat.maxLatG);
    expect(banked.nausea).toBeLessThan(flat.nausea);
  });
});

describe('pre-built designs', () => {
  it('every design closes, validates, and has sensible stats', () => {
    expect(COASTER_DESIGNS.length).toBeGreaterThanOrEqual(4);
    for (const d of COASTER_DESIGNS) {
      const pieces = designPieces(d);
      expect(pieces, `${d.name} should close`).not.toBeTypeOf('string');
      const stats = designStats(d);
      expect(stats.valid, `${d.name}: ${stats.reason}`).toBe(true);
      expect(stats.excitement, `${d.name} excitement`).toBeGreaterThan(2);
      expect(stats.excitement).toBeLessThanOrEqual(9.9);
      expect(stats.intensity).toBeGreaterThan(0.5);
      expect(stats.intensity).toBeLessThan(9.2);
      expect(stats.lapTicks).toBeGreaterThan(60);
      expect(designCost(d)).toBeGreaterThan(300);
    }
  });

  it('design bounds exactly cover the laid track tiles', () => {
    for (const d of COASTER_DESIGNS) {
      const pieces = designPieces(d);
      expect(typeof pieces).not.toBe('string');
      const ps = pieces as Exclude<typeof pieces, string>;
      const minX = Math.min(...ps.map((p) => p.x));
      const minY = Math.min(...ps.map((p) => p.y));
      const maxX = Math.max(...ps.map((p) => p.x));
      const maxY = Math.max(...ps.map((p) => p.y));
      expect([minX, minY, maxX, maxY], `${d.name} bounds`).toEqual(d.bounds);
    }
  });

  it('the Twister design has three inversions', () => {
    const stats = designStats(getDesign('twister')!);
    expect(stats.inversions).toBe(3);
  });

  it('wooden designs deliver airtime', () => {
    const stats = designStats(getDesign('woodchip')!);
    expect(stats.airtime).toBeGreaterThan(0);
  });

  it('a design can be placed in the park, claims tiles, and guests ride it', () => {
    const s = createPark(3);
    s.cash = 20000;
    const e = entranceTile(s);
    const d = getDesign('little-comet')!;
    const sx = e.x - 8;
    const sy = e.y - 7;
    expect(canBuildDesign(s, d, sx, sy)).toBe(true);
    const b = buildDesign(s, d, sx, sy) as TrackBuilder;
    expect(typeof b).not.toBe('string');
    const stats = trackStats(b.pieces, d.typeId);
    const cost = trackCost(b.pieces, d.typeId);
    const ride = createCoasterRide(s, d.typeId, b.pieces, cost, stats, d.name, 4)!;
    expect(ride).not.toBeNull();
    expect(ride.capacity).toBe(8);
    expect(s.grid.filter((t) => t.rideId === ride.id).length).toBe(b.pieces.length);

    // Connect to the starter path and ride it.
    for (let x = sx + d.bounds[2] + 1; x <= e.x; x++) buildPath(s, x, sy + 2);
    const g = spawnGuest(s)!;
    g.state = 'queuing';
    g.patience = QUEUE_PATIENCE * 6;
    g.targetRide = ride.id;
    ride.queue.push(g.id);
    step(s, 90 + stats.lapTicks + 60);
    expect(ride.totalRiders).toBe(1);
  });

  it('designs refuse to overlap obstacles', () => {
    const s = createPark(3);
    const d = getDesign('little-comet')!;
    buildPath(s, 12, 12); // obstacle inside the footprint
    expect(canBuildDesign(s, d, 10, 10)).toBe(false);
  });

  it('coaster types have distinct capabilities', () => {
    expect(COASTER_TYPES['coaster-wooden'].allowsInversions).toBe(false);
    expect(COASTER_TYPES['coaster-twister'].allowsInversions).toBe(true);
    expect(COASTER_TYPES['coaster-mini'].allowsSteep).toBe(false);
  });
});
