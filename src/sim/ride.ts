import type { ParkState, Ride } from './types';
import { addMessage, clamp, rand } from './types';
import { RIDE_TYPES } from './ridedefs';
import { queueTileFor } from './path';
import { stepTrain } from './coaster';

const MIN_LOAD_WAIT = 80; // ticks a ride waits before departing partly full

function finishCycle(s: ParkState, ride: Ride): void {
  const qt = queueTileFor(s, ride);
  for (const gid of ride.onBoard) {
    const g = s.guests[gid];
    if (!g) continue;
    g.state = 'walking';
    g.activity = 'none';
    g.targetRide = null;
    g.path = [];
    g.pathIdx = 0;
    if (qt) {
      g.x = qt.x; g.y = qt.y; g.tx = qt.x; g.ty = qt.y;
    }
    g.happiness = clamp(g.happiness + 5 + ride.excitement * 1.6, 0, 100);
    g.nausea = clamp(g.nausea + ride.nausea * 4 * (1 - g.intensityTol / 14), 0, 100);
    g.energy = clamp(g.energy - 1.5, 0, 100);
    g.lastRide = ride.id;
    g.ridesRidden++;
  }
  ride.totalRiders += ride.onBoard.length;
  ride.onBoard = [];
  ride.state = 'loading';
  ride.stateTicks = 0;
  if (ride.track) {
    ride.trainPos = 0;
    ride.trainSpeed = 0;
  }
}

export function tickRide(s: ParkState, ride: Ride): void {
  ride.age++;
  const def = RIDE_TYPES[ride.typeId];
  if (def.kind === 'stall') return; // stalls transact instantly in guest.ts

  if (ride.broken) return; // staff.ts handles repair progress

  if (!ride.open) return;

  if (ride.state === 'loading') {
    ride.stateTicks++;
    // Board queued guests (they must actually be in the queuing state).
    while (ride.onBoard.length < ride.capacity && ride.queue.length > 0) {
      const gid = ride.queue[0];
      const g = s.guests[gid];
      if (!g || g.state !== 'queuing') {
        ride.queue.shift();
        continue;
      }
      ride.queue.shift();
      g.state = 'riding';
      ride.onBoard.push(gid);
    }
    const full = ride.onBoard.length >= ride.capacity;
    if ((full || ride.stateTicks >= MIN_LOAD_WAIT) && ride.onBoard.length > 0) {
      ride.state = 'running';
      ride.stateTicks = 0;
      if (ride.track) {
        ride.trainPos = 0;
        ride.trainSpeed = 0.05;
      }
    }
    // Breakdowns only strike while loading so a cycle always completes.
    if (rand(s) < (1 - ride.reliability) * 0.01) {
      ride.broken = true;
      ride.breakdowns++;
      ride.repairTicks = 0;
      addMessage(s, `${ride.name} has broken down!`, 'bad');
    }
    return;
  }

  // running
  ride.stateTicks++;
  if (ride.track) {
    const r = stepTrain(ride.track, ride.trainPos ?? 0, ride.trainSpeed ?? 0.05, ride.typeId);
    ride.trainPos = r.pos;
    ride.trainSpeed = r.speed;
    if (ride.trainPos >= ride.track.length) finishCycle(s, ride);
  } else if (ride.stateTicks >= ride.duration) {
    finishCycle(s, ride);
  }
}
