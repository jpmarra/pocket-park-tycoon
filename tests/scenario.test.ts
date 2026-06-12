import { describe, expect, it } from 'vitest';
import { createPark, buildPath, placeRide, createCoasterRide, entranceTile } from '../src/sim/grid';
import { demoLoopPieces, trackCost, trackStats } from '../src/sim/coaster';
import type { TrackBuilder } from '../src/sim/coaster';
import { hireStaff } from '../src/sim/staff';
import { step } from '../src/sim/park';
import { TICKS_PER_MONTH } from '../src/sim/types';

describe('scenario integration', () => {
  it('an empty park loses at the deadline', () => {
    const s = createPark(5);
    step(s, s.scenario.deadlineMonth * TICKS_PER_MONTH + 10);
    expect(s.gameOver).toBe('lost');
  });

  it('a well-built park survives a full scenario without numeric corruption', () => {
    const s = createPark(2024);
    const e = entranceTile(s);
    s.cash = 10000; // sandbox-ish budget so the build fits

    // Main street with side branches.
    for (let y = e.y - 9; y >= e.y - 20; y--) buildPath(s, e.x, y);
    for (let x = e.x - 6; x < e.x; x++) buildPath(s, x, e.y - 10);
    for (let x = e.x + 1; x <= e.x + 6; x++) buildPath(s, x, e.y - 10);

    expect(placeRide(s, 'carousel', e.x - 2, e.y - 5)).not.toBeNull();
    expect(placeRide(s, 'bumper', e.x + 1, e.y - 8)).not.toBeNull();
    expect(placeRide(s, 'ferris', e.x - 4, e.y - 13)).not.toBeNull();
    expect(placeRide(s, 'droptower', e.x + 2, e.y - 13)).not.toBeNull();
    expect(placeRide(s, 'foodstall', e.x - 1, e.y - 9)).not.toBeNull();
    expect(placeRide(s, 'drinkstall', e.x + 1, e.y - 9)).not.toBeNull();
    const b = demoLoopPieces(s, e.x - 16, e.y - 12) as TrackBuilder;
    expect(typeof b).not.toBe('string');
    // Connect the coaster footprint to the street.
    for (let x = e.x - 16 + 7; x <= e.x - 7; x++) buildPath(s, x, e.y - 10);
    expect(createCoasterRide(s, b.pieces, trackCost(b.pieces), trackStats(b.pieces))).not.toBeNull();

    hireStaff(s, 'handyman');
    hireStaff(s, 'handyman');
    hireStaff(s, 'mechanic');

    // Run the entire scenario (10 months).
    step(s, s.scenario.deadlineMonth * TICKS_PER_MONTH + 10);

    // The game reached SOME terminal state and the numbers stayed sane.
    expect(['won', 'lost', 'bankrupt']).toContain(s.gameOver);
    expect(Number.isFinite(s.cash)).toBe(true);
    expect(s.rating).toBeGreaterThanOrEqual(0);
    expect(s.rating).toBeLessThanOrEqual(999);
    expect(s.guestCount).toBeGreaterThanOrEqual(0);
    expect(s.totalGuestsEver).toBeGreaterThan(20);
    for (const g of Object.values(s.guests)) {
      expect(Number.isFinite(g.happiness)).toBe(true);
      expect(Number.isFinite(g.x)).toBe(true);
    }
    // Rides served guests over the scenario.
    const totalRiders = Object.values(s.rides).reduce((sum, r) => sum + r.totalRiders, 0);
    expect(totalRiders).toBeGreaterThan(50);
  });
});
