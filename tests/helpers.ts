import type { ParkState, Ride } from '../src/sim/types';
import { createPark, placeRide, buildPath } from '../src/sim/grid';
import { entranceTile } from '../src/sim/grid';

// A small park with a guaranteed-connected layout:
// the starter path runs from the entrance 8 tiles north; we add a carousel
// right next to it so guests can reach it.
export function makeTestPark(seed = 42): { s: ParkState; ride: Ride } {
  const s = createPark(seed);
  const e = entranceTile(s);
  // Starter path occupies (e.x, e.y-1 .. e.y-8). Put a carousel west of it.
  const ride = placeRide(s, 'carousel', e.x - 2, e.y - 5);
  if (!ride) throw new Error('test setup: carousel placement failed');
  return { s, ride };
}

export function extendPath(s: ParkState, x: number, y0: number, y1: number): void {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) buildPath(s, x, y);
}
