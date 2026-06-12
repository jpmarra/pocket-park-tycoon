import { describe, expect, it } from 'vitest';
import { makeTestPark } from './helpers';
import { createPark, placeRide, demolishRide, applyMonthlyCosts, buildPath, entranceTile } from '../src/sim/grid';
import { spawnGuest } from '../src/sim/guest';
import { hireStaff } from '../src/sim/staff';
import { tick } from '../src/sim/park';
import { PATH_COST, STARTING_CASH } from '../src/sim/types';
import { RIDE_TYPES } from '../src/sim/ridedefs';

describe('economy', () => {
  it('charges construction costs for paths and rides', () => {
    const s = createPark(1);
    const before = s.cash;
    expect(buildPath(s, 5, 5)).toBe(true);
    expect(s.cash).toBe(before - PATH_COST);
    const r = placeRide(s, 'ferris', 10, 10);
    expect(r).not.toBeNull();
    expect(s.cash).toBe(before - PATH_COST - RIDE_TYPES.ferris.cost);
    expect(s.finances.construction).toBe(PATH_COST + RIDE_TYPES.ferris.cost);
  });

  it('refuses to build without cash', () => {
    const s = createPark(1);
    s.cash = 3;
    expect(buildPath(s, 5, 5)).toBe(false);
    expect(placeRide(s, 'carousel', 10, 10)).toBeNull();
    expect(s.cash).toBe(3);
  });

  it('collects the entry fee when a guest spawns', () => {
    const { s } = makeTestPark();
    const before = s.cash;
    const g = spawnGuest(s)!;
    expect(g).not.toBeNull();
    expect(s.cash).toBe(before + s.entryFee);
    expect(s.finances.entryIncome).toBe(s.entryFee);
  });

  it('deducts monthly wages and running costs', () => {
    const { s, ride } = makeTestPark();
    hireStaff(s, 'handyman');
    hireStaff(s, 'mechanic');
    const before = s.cash;
    applyMonthlyCosts(s);
    const expected = 50 + 80 + ride.runningCost;
    expect(s.cash).toBe(before - expected);
    expect(s.finances.wagesPaid).toBe(130);
    expect(s.finances.runningCosts).toBe(ride.runningCost);
  });

  it('declares bankruptcy when cash goes negative', () => {
    const { s } = makeTestPark();
    s.cash = -1;
    tick(s);
    expect(s.gameOver).toBe('bankrupt');
  });

  it('refunds part of the cost when demolishing', () => {
    const s = createPark(1);
    const r = placeRide(s, 'carousel', 10, 10)!;
    const before = s.cash;
    demolishRide(s, r.id);
    expect(s.cash).toBe(before + Math.floor(RIDE_TYPES.carousel.cost * 0.3));
    expect(s.grid.every((t) => t.rideId === null)).toBe(true);
  });

  it('starts with the configured cash balance', () => {
    const s = createPark(1);
    expect(s.cash).toBe(STARTING_CASH);
    expect(entranceTile(s).y).toBe(s.gridH - 1);
  });
});
