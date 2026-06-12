import { describe, expect, it } from 'vitest';
import { makeTestPark } from './helpers';
import { serialize, deserialize } from '../src/sim/save';
import { demoLoopPieces, trackCost, trackStats } from '../src/sim/coaster';
import type { TrackBuilder } from '../src/sim/coaster';
import { createCoasterRide } from '../src/sim/grid';
import { spawnGuest } from '../src/sim/guest';
import { hireStaff } from '../src/sim/staff';
import { step } from '../src/sim/park';

describe('save/load', () => {
  it('round-trips a busy park exactly', () => {
    const { s } = makeTestPark(99);
    const b = demoLoopPieces(s, 5, 5) as TrackBuilder;
    createCoasterRide(s, b.pieces, trackCost(b.pieces), trackStats(b.pieces));
    hireStaff(s, 'handyman');
    spawnGuest(s);
    spawnGuest(s);
    step(s, 500);

    const json = serialize(s);
    const loaded = deserialize(json);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(s);
  });

  it('a loaded park continues deterministically identical to the original', () => {
    const { s } = makeTestPark(123);
    spawnGuest(s);
    step(s, 300);
    const loaded = deserialize(serialize(s))!;
    step(s, 1000);
    step(loaded, 1000);
    expect(loaded.tick).toBe(s.tick);
    expect(loaded.cash).toBe(s.cash);
    expect(loaded.guestCount).toBe(s.guestCount);
    expect(loaded.rng).toBe(s.rng);
    expect(serialize(loaded)).toBe(serialize(s));
  });

  it('rejects corrupt or wrong-version saves', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{}')).toBeNull();
    expect(deserialize(JSON.stringify({ version: 999, grid: [], gridW: 1, gridH: 1 }))).toBeNull();
  });
});
