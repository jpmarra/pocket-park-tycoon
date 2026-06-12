import { describe, expect, it } from 'vitest';
import { makeTestPark } from './helpers';
import { spawnGuest } from '../src/sim/guest';
import { hireStaff } from '../src/sim/staff';
import { step } from '../src/sim/park';
import { QUEUE_PATIENCE } from '../src/sim/types';

function queueGuests(s: ReturnType<typeof makeTestPark>['s'], ride: ReturnType<typeof makeTestPark>['ride'], n: number) {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const g = spawnGuest(s)!;
    g.state = 'queuing';
    g.patience = QUEUE_PATIENCE;
    g.targetRide = ride.id;
    ride.queue.push(g.id);
    ids.push(g.id);
  }
  return ids;
}

describe('ride operation', () => {
  it('boards queued guests up to capacity and completes a cycle', () => {
    const { s, ride } = makeTestPark();
    const ids = queueGuests(s, ride, ride.capacity + 4);
    // The ride fills instantly and departs; check mid-cycle state.
    step(s, 110);
    expect(ride.onBoard.length).toBe(ride.capacity);
    expect(ride.queue.length).toBe(4);
    // Let the cycle complete.
    step(s, 20);
    expect(ride.totalRiders).toBe(ride.capacity);
    const first = s.guests[ids[0]];
    expect(first.ridesRidden).toBe(1);
  });

  it('a partially full ride departs after the load wait', () => {
    const { s, ride } = makeTestPark();
    queueGuests(s, ride, 3);
    step(s, 90 + ride.duration + 10);
    expect(ride.totalRiders).toBe(3);
    expect(ride.state).toBe('loading');
  });

  it('breaks down eventually and a mechanic repairs it', () => {
    const { s, ride } = makeTestPark();
    hireStaff(s, 'mechanic');
    // Force a breakdown rather than waiting on RNG.
    ride.broken = true;
    ride.breakdowns = 1;
    step(s, 4000);
    expect(ride.broken).toBe(false);
    expect(ride.breakdowns).toBe(1);
  });

  it('breakdowns occur naturally on low-reliability rides', () => {
    const { s, ride } = makeTestPark();
    ride.reliability = 0.5; // very unreliable, so the test is quick
    step(s, 3000);
    expect(ride.breakdowns).toBeGreaterThan(0);
    expect(ride.broken).toBe(true); // no mechanic hired
  });

  it('closed rides do not board guests', () => {
    const { s, ride } = makeTestPark();
    ride.open = false;
    queueGuests(s, ride, 2);
    step(s, 300);
    expect(ride.totalRiders).toBe(0);
  });
});
