import { describe, expect, it } from 'vitest';
import { makeTestPark } from './helpers';
import { spawnGuest } from '../src/sim/guest';
import { placeRide } from '../src/sim/grid';
import { step, tick } from '../src/sim/park';

describe('guest needs and lifecycle', () => {
  it('needs drift over time: hunger and thirst rise, energy falls', () => {
    const { s } = makeTestPark();
    const g = spawnGuest(s)!;
    const h0 = g.hunger;
    const t0 = g.thirst;
    const e0 = g.energy;
    step(s, 500);
    expect(g.hunger).toBeGreaterThan(h0);
    expect(g.thirst).toBeGreaterThan(t0);
    expect(g.energy).toBeLessThan(e0);
  });

  it('an exhausted guest leaves the park', () => {
    const { s } = makeTestPark();
    const g = spawnGuest(s)!;
    g.energy = 5;
    g.hunger = 0;
    g.thirst = 0;
    const id = g.id;
    step(s, 3000);
    expect(s.guests[id]).toBeUndefined();
  });

  it('a hungry guest buys food at a stall, reducing hunger and paying', () => {
    const { s } = makeTestPark();
    // Stall east of the path near the entrance.
    const e = { x: Math.floor(s.gridW / 2), y: s.gridH - 1 };
    const stall = placeRide(s, 'foodstall', e.x + 1, e.y - 3)!;
    expect(stall).not.toBeNull();
    const g = spawnGuest(s)!;
    g.hunger = 90;
    g.thirst = 0;
    g.energy = 100;
    g.cash = 50;
    const parkCashBefore = s.cash;
    step(s, 2000);
    // Hunger drifts back up after eating, so just verify a purchase happened
    // and hunger dropped well below the starting 90.
    expect(g.hunger).toBeLessThan(75);
    expect(s.finances.stallIncome).toBeGreaterThan(0);
    expect(s.cash).toBeGreaterThan(parkCashBefore);
  });

  it('guests in the park walk to a ride, queue, and ride it', () => {
    const { s, ride } = makeTestPark();
    const g = spawnGuest(s)!;
    g.hunger = 0;
    g.thirst = 0;
    g.energy = 100;
    g.cash = 50;
    let rode = false;
    for (let i = 0; i < 6000 && !rode; i++) {
      tick(s);
      if (ride.totalRiders > 0) rode = true;
    }
    expect(rode).toBe(true);
    expect(ride.revenue).toBeGreaterThan(0);
  });

  it('a guest buys a balloon and carries it', () => {
    const { s } = makeTestPark();
    const e = { x: Math.floor(s.gridW / 2), y: s.gridH - 1 };
    const stall = placeRide(s, 'balloonstall', e.x + 1, e.y - 3)!;
    const g = spawnGuest(s)!;
    const cashBefore = g.cash;
    // Walk the guest straight to the stall's queue tile.
    g.tx = e.x; g.ty = e.y - 3; g.x = g.tx; g.y = g.ty;
    g.path = [{ x: g.tx, y: g.ty }];
    g.pathIdx = 0;
    g.activity = 'toStall';
    g.targetRide = stall.id;
    step(s, 5);
    expect(g.balloon).not.toBeNull();
    expect(g.cash).toBe(cashBefore - stall.price);
    expect(stall.totalRiders).toBe(1);
  });

  it('toilets relieve nausea', () => {
    const { s } = makeTestPark();
    const e = { x: Math.floor(s.gridW / 2), y: s.gridH - 1 };
    const loo = placeRide(s, 'toilets', e.x + 1, e.y - 4)!;
    const g = spawnGuest(s)!;
    g.nausea = 80;
    g.tx = e.x; g.ty = e.y - 4; g.x = g.tx; g.y = g.ty;
    g.path = [{ x: g.tx, y: g.ty }];
    g.pathIdx = 0;
    g.activity = 'toStall';
    g.targetRide = loo.id;
    step(s, 5);
    expect(g.nausea).toBeLessThan(50);
  });

  it('guests give up queuing when patience runs out', () => {
    const { s, ride } = makeTestPark();
    ride.open = true;
    const g = spawnGuest(s)!;
    // Put the guest straight into the queue, then jam the ride shut so it
    // never boards anyone.
    g.state = 'queuing';
    g.patience = 50;
    g.targetRide = ride.id;
    ride.queue.push(g.id);
    ride.open = false;
    const h0 = g.happiness;
    step(s, 100);
    expect(g.state).toBe('walking');
    expect(ride.queue).not.toContain(g.id);
    expect(g.happiness).toBeLessThan(h0);
  });
});
