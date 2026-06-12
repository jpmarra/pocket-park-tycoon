import {
  GRID_H, GRID_W, MONTH_NAMES, PATH_COST, START_MONTH, STARTING_CASH,
  TICKS_PER_MONTH, addMessage, inBounds, tileAt,
} from './types';
import type { ParkState, Ride, Tile, TrackPiece } from './types';
import { RIDE_TYPES } from './ridedefs';

export function createPark(seed: number): ParkState {
  const grid: Tile[] = [];
  for (let i = 0; i < GRID_W * GRID_H; i++) {
    grid.push({ kind: 'grass', litter: 0, rideId: null });
  }
  const s: ParkState = {
    version: 2,
    seed,
    rng: seed >>> 0 || 1,
    tick: 0,
    cash: STARTING_CASH,
    entryFee: 10,
    guests: {},
    guestCount: 0,
    rides: {},
    staff: {},
    grid,
    gridW: GRID_W,
    gridH: GRID_H,
    nextId: 1,
    rating: 500,
    totalGuestsEver: 0,
    messages: [],
    scenario: {
      name: 'Greenfield Gardens',
      goalGuests: 200,
      goalRating: 700,
      deadlineMonth: 22, // ~2 in-game years (start is March, Year 1)
    },
    gameOver: 'none',
    sandbox: false,
    finances: {
      entryIncome: 0, rideIncome: 0, stallIncome: 0,
      wagesPaid: 0, runningCosts: 0, construction: 0,
    },
  };
  // Park gate at the bottom edge with a starter path heading into the park.
  const ex = Math.floor(GRID_W / 2);
  const ey = GRID_H - 1;
  s.grid[ey * GRID_W + ex].kind = 'entrance';
  for (let y = ey - 1; y >= ey - 8; y--) s.grid[y * GRID_W + ex].kind = 'path';
  const dm = MONTH_NAMES[(START_MONTH + s.scenario.deadlineMonth) % 12];
  const dy = 1 + Math.floor((START_MONTH + s.scenario.deadlineMonth) / 12);
  addMessage(s, `Welcome to ${s.scenario.name}! Goal: ${s.scenario.goalGuests} guests and a ${s.scenario.goalRating} park rating before ${dm}, Year ${dy}.`);
  return s;
}

export function entranceTile(s: ParkState): { x: number; y: number } {
  for (let y = 0; y < s.gridH; y++) {
    for (let x = 0; x < s.gridW; x++) {
      if (s.grid[y * s.gridW + x].kind === 'entrance') return { x, y };
    }
  }
  return { x: Math.floor(s.gridW / 2), y: s.gridH - 1 };
}

export function buildPath(s: ParkState, x: number, y: number): boolean {
  const t = tileAt(s, x, y);
  if (!t || t.kind !== 'grass' || t.rideId !== null) return false;
  if (s.cash < PATH_COST) {
    addMessage(s, 'Not enough cash to build a path.', 'bad');
    return false;
  }
  s.cash -= PATH_COST;
  s.finances.construction += PATH_COST;
  t.kind = 'path';
  return true;
}

export function removePath(s: ParkState, x: number, y: number): boolean {
  const t = tileAt(s, x, y);
  if (!t || t.kind !== 'path') return false;
  t.kind = 'grass';
  t.litter = 0;
  return true;
}

export function canPlaceRide(s: ParkState, typeId: string, x: number, y: number): boolean {
  const def = RIDE_TYPES[typeId];
  if (!def) return false;
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      if (!inBounds(s, x + dx, y + dy)) return false;
      const t = tileAt(s, x + dx, y + dy)!;
      if (t.kind !== 'grass' || t.rideId !== null) return false;
    }
  }
  return true;
}

export function placeRide(s: ParkState, typeId: string, x: number, y: number): Ride | null {
  const def = RIDE_TYPES[typeId];
  if (!def || def.kind === 'coaster') return null;
  if (!canPlaceRide(s, typeId, x, y)) return null;
  if (s.cash < def.cost) {
    addMessage(s, `Not enough cash for ${def.name} ($${def.cost}).`, 'bad');
    return null;
  }
  s.cash -= def.cost;
  s.finances.construction += def.cost;
  const id = s.nextId++;
  const count = Object.values(s.rides).filter((r) => r.typeId === typeId).length;
  const ride: Ride = {
    id, typeId, name: count > 0 ? `${def.name} ${count + 1}` : def.name,
    x, y, w: def.w, h: def.h,
    price: def.defaultPrice, open: true,
    broken: false, breakdowns: 0, repairTicks: 0, mechanicId: null,
    state: 'loading', stateTicks: 0,
    queue: [], onBoard: [],
    totalRiders: 0, revenue: 0,
    excitement: def.excitement, intensity: def.intensity, nausea: def.nausea,
    duration: def.duration, capacity: def.capacity,
    reliability: def.reliability, runningCost: def.runningCost,
    age: 0, cars: 0,
  };
  s.rides[id] = ride;
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      tileAt(s, x + dx, y + dy)!.rideId = id;
    }
  }
  addMessage(s, `${ride.name} built.`, 'good');
  return ride;
}

export function createCoasterRide(
  s: ParkState, typeId: string, track: TrackPiece[], cost: number,
  stats: { excitement: number; intensity: number; nausea: number; lapTicks: number },
  name?: string, cars = 5,
): Ride | null {
  const def = RIDE_TYPES[typeId];
  if (!def || def.kind !== 'coaster') return null;
  if (s.cash < cost) {
    addMessage(s, `Not enough cash for the coaster ($${cost}).`, 'bad');
    return null;
  }
  s.cash -= cost;
  s.finances.construction += cost;
  const id = s.nextId++;
  const minX = Math.min(...track.map((p) => p.x));
  const minY = Math.min(...track.map((p) => p.y));
  const maxX = Math.max(...track.map((p) => p.x));
  const maxY = Math.max(...track.map((p) => p.y));
  const baseName = name ?? def.name;
  const count = Object.values(s.rides).filter((r) => r.name.startsWith(baseName)).length;
  const ride: Ride = {
    id, typeId, name: count > 0 ? `${baseName} ${count + 1}` : baseName,
    x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1,
    price: def.defaultPrice, open: true,
    broken: false, breakdowns: 0, repairTicks: 0, mechanicId: null,
    state: 'loading', stateTicks: 0,
    queue: [], onBoard: [],
    totalRiders: 0, revenue: 0,
    excitement: stats.excitement, intensity: stats.intensity, nausea: stats.nausea,
    duration: stats.lapTicks, capacity: cars * 2,
    reliability: def.reliability, runningCost: def.runningCost,
    age: 0,
    track, trainPos: 0, trainSpeed: 0, cars,
  };
  s.rides[id] = ride;
  for (const p of track) {
    const t = tileAt(s, p.x, p.y);
    if (t) t.rideId = id;
  }
  addMessage(s, `${ride.name} built! Excitement ${stats.excitement.toFixed(1)}, intensity ${stats.intensity.toFixed(1)}.`, 'good');
  return ride;
}

export function demolishRide(s: ParkState, rideId: number): boolean {
  const ride = s.rides[rideId];
  if (!ride) return false;
  // Anyone queuing or on board is dumped back onto the park.
  for (const gid of [...ride.queue, ...ride.onBoard]) {
    const g = s.guests[gid];
    if (g) {
      g.state = 'walking';
      g.activity = 'none';
      g.targetRide = null;
      g.path = [];
      g.pathIdx = 0;
    }
  }
  for (let i = 0; i < s.grid.length; i++) {
    if (s.grid[i].rideId === rideId) s.grid[i].rideId = null;
  }
  const def = RIDE_TYPES[ride.typeId];
  const refund = ride.track
    ? Math.floor(ride.track.length * 20)
    : Math.floor(def.cost * 0.3);
  s.cash += refund;
  delete s.rides[rideId];
  addMessage(s, `${ride.name} demolished (refund $${refund}).`);
  return true;
}

// Run monthly costs: staff wages + ride running costs. Called by park.tick at
// each month boundary.
export function applyMonthlyCosts(s: ParkState): void {
  let wages = 0;
  for (const st of Object.values(s.staff)) wages += st.wage;
  let running = 0;
  for (const r of Object.values(s.rides)) running += r.runningCost;
  s.cash -= wages + running;
  s.finances.wagesPaid += wages;
  s.finances.runningCosts += running;
  if (wages + running > 0) {
    addMessage(s, `Monthly costs: $${wages} wages, $${running} ride upkeep.`);
  }
}

export function monthsElapsed(s: ParkState): number {
  return Math.floor(s.tick / TICKS_PER_MONTH);
}
