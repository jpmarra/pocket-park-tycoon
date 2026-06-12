import { describe, expect, it } from 'vitest';
import { createPark, createCoasterRide, buildPath, entranceTile } from '../src/sim/grid';
import {
  startTrack, addPiece, undoPiece, isClosed, trackCost, trackStats,
  demoLoopPieces, canBuildDemoLoop,
} from '../src/sim/coaster';
import type { TrackBuilder } from '../src/sim/coaster';
import { spawnGuest } from '../src/sim/guest';
import { step } from '../src/sim/park';
import { QUEUE_PATIENCE } from '../src/sim/types';

describe('coaster builder', () => {
  it('builds and closes the demo loop', () => {
    const s = createPark(3);
    expect(canBuildDemoLoop(s, 10, 10)).toBe(true);
    const b = demoLoopPieces(s, 10, 10);
    expect(typeof b).not.toBe('string');
    expect(isClosed(b as TrackBuilder)).toBe(true);
  });

  it('an open track is not closed', () => {
    const s = createPark(3);
    const b = startTrack(s, 10, 10, 0) as TrackBuilder;
    expect(typeof b).not.toBe('string');
    addPiece(s, b, 'straight');
    addPiece(s, b, 'straight');
    expect(isClosed(b)).toBe(false);
  });

  it('rejects going below ground and crossing itself', () => {
    const s = createPark(3);
    const b = startTrack(s, 10, 10, 0) as TrackBuilder;
    expect(addPiece(s, b, 'down')).toMatch(/below ground/);
    // Tight 4-loop tries to re-enter the station tile's row immediately:
    addPiece(s, b, 'right');
    addPiece(s, b, 'right');
    addPiece(s, b, 'right');
    // Heading back across the station tile — next tile IS the station tile,
    // which is already used, so this must fail.
    expect(addPiece(s, b, 'straight')).toMatch(/cross itself/);
  });

  it('undo removes the last piece and restores the head', () => {
    const s = createPark(3);
    const b = startTrack(s, 10, 10, 0) as TrackBuilder;
    addPiece(s, b, 'up');
    expect(b.head.z).toBe(1);
    expect(undoPiece(b)).toBe(true);
    expect(b.head.z).toBe(0);
    expect(b.pieces.length).toBe(1);
    expect(undoPiece(b)).toBe(false); // cannot undo the station
  });

  it('computes positive stats and a finite lap time for the demo loop', () => {
    const s = createPark(3);
    const b = demoLoopPieces(s, 10, 10) as TrackBuilder;
    const stats = trackStats(b.pieces);
    expect(stats.excitement).toBeGreaterThan(1);
    expect(stats.intensity).toBeGreaterThan(0);
    expect(stats.lapTicks).toBeGreaterThan(50);
    expect(stats.lapTicks).toBeLessThan(8000);
    expect(stats.maxSpeed).toBeGreaterThan(0.05);
  });

  it('creating the coaster deducts cash, claims tiles, and guests can ride it', () => {
    const s = createPark(3);
    const e = entranceTile(s);
    // Demo loop just west of the starter path, station row adjacent to path.
    const sx = e.x - 7;
    const sy = e.y - 7;
    expect(canBuildDemoLoop(s, sx, sy)).toBe(true);
    const b = demoLoopPieces(s, sx, sy) as TrackBuilder;
    const cost = trackCost(b.pieces);
    const stats = trackStats(b.pieces);
    const cashBefore = s.cash;
    const ride = createCoasterRide(s, b.pieces, cost, stats)!;
    expect(ride).not.toBeNull();
    expect(s.cash).toBe(cashBefore - cost);
    expect(s.grid.filter((t) => t.rideId === ride.id).length).toBe(b.pieces.length);

    // Connect the loop to the starter path so guests can queue.
    // Track footprint is sx-1..sx+6, sy..sy+4; lay a path from the starter
    // path west to touch the footprint's east edge.
    for (let x = sx + 7; x <= e.x; x++) buildPath(s, x, sy + 2);

    const g = spawnGuest(s)!;
    g.state = 'queuing';
    g.patience = QUEUE_PATIENCE * 4;
    g.targetRide = ride.id;
    ride.queue.push(g.id);
    step(s, 90 + stats.lapTicks + 50);
    expect(ride.totalRiders).toBe(1);
    expect(s.guests[g.id].ridesRidden).toBe(1);
  });
});
