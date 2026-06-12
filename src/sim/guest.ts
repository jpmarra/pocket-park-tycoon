import type { Guest, ParkState, Ride } from './types';
import {
  GUEST_SPEED, MAX_GUESTS, QUEUE_PATIENCE,
  addMessage, clamp, rand, randInt, tileAt,
} from './types';
import { allPathTiles, findPath, queueTileFor } from './path';
import { RIDE_TYPES } from './ridedefs';
import { entranceTile } from './grid';

const SHIRT_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#fd79a8'];

export function spawnGuest(s: ParkState): Guest | null {
  if (s.guestCount >= MAX_GUESTS) return null;
  const e = entranceTile(s);
  const id = s.nextId++;
  const g: Guest = {
    id,
    name: `Guest ${s.totalGuestsEver + 1}`,
    x: e.x, y: e.y, tx: e.x, ty: e.y,
    path: [], pathIdx: 0,
    state: 'walking',
    activity: 'none',
    targetRide: null,
    happiness: 60 + randInt(s, 25),
    hunger: randInt(s, 40),
    thirst: randInt(s, 40),
    energy: 80 + randInt(s, 20),
    nausea: 0,
    cash: 40 + randInt(s, 80),
    intensityTol: 3 + randInt(s, 7), // 3..9
    hasTrash: false, trashTimer: 0,
    patience: 0,
    lastRide: null,
    ridesRidden: 0,
    ticksInPark: 0,
    idleTicks: 0,
    color: SHIRT_COLORS[randInt(s, SHIRT_COLORS.length)],
  };
  // Entry fee goes to the park; guests always pay it on arrival.
  const fee = Math.min(s.entryFee, g.cash);
  g.cash -= fee;
  s.cash += fee;
  s.finances.entryIncome += fee;
  s.guests[id] = g;
  s.guestCount++;
  s.totalGuestsEver++;
  return g;
}

function removeGuest(s: ParkState, g: Guest): void {
  delete s.guests[g.id];
  s.guestCount--;
}

function setPathTo(s: ParkState, g: Guest, tx: number, ty: number): boolean {
  const p = findPath(s, g.tx, g.ty, tx, ty);
  if (!p) return false;
  g.path = p;
  g.pathIdx = 0;
  return true;
}

function wander(s: ParkState, g: Guest): void {
  const tiles = allPathTiles(s);
  if (tiles.length === 0) return;
  for (let attempt = 0; attempt < 4; attempt++) {
    const t = tiles[randInt(s, tiles.length)];
    if (setPathTo(s, g, t.x, t.y)) {
      g.activity = 'wander';
      return;
    }
  }
}

function startLeaving(s: ParkState, g: Guest): void {
  const e = entranceTile(s);
  if (setPathTo(s, g, e.x, e.y)) {
    g.activity = 'leaving';
  } else {
    // Stranded (player deleted paths) — guest evaporates at the next decision.
    removeGuest(s, g);
  }
}

function pickRide(s: ParkState, g: Guest): Ride | null {
  let best: Ride | null = null;
  let bestScore = -Infinity;
  for (const r of Object.values(s.rides)) {
    const def = RIDE_TYPES[r.typeId];
    if (def.kind === 'stall') continue;
    if (!r.open || r.broken) continue;
    if (r.price > g.cash) continue;
    if (r.intensity > g.intensityTol) continue;
    if (r.id === g.lastRide && rand(s) < 0.7) continue; // usually avoid repeats
    if (!queueTileFor(s, r)) continue; // unreachable: no adjacent path
    const score = r.excitement * 2 - r.queue.length * 0.8 - r.price * 0.3 + rand(s) * 3;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

function findStall(s: ParkState, g: Guest, product: 'food' | 'drink'): Ride | null {
  for (const r of Object.values(s.rides)) {
    const def = RIDE_TYPES[r.typeId];
    if (def.kind !== 'stall' || def.product !== product) continue;
    if (!r.open || r.price > g.cash) continue;
    if (queueTileFor(s, r)) return r;
  }
  return null;
}

function decide(s: ParkState, g: Guest): void {
  // Leaving conditions first.
  if (g.energy < 12 || g.happiness < 18 || (g.cash < 2 && g.hunger > 75)) {
    startLeaving(s, g);
    return;
  }
  if (g.thirst > 60) {
    const stall = findStall(s, g, 'drink');
    if (stall) {
      const qt = queueTileFor(s, stall)!;
      if (setPathTo(s, g, qt.x, qt.y)) {
        g.activity = 'toStall';
        g.targetRide = stall.id;
        return;
      }
    }
  }
  if (g.hunger > 60) {
    const stall = findStall(s, g, 'food');
    if (stall) {
      const qt = queueTileFor(s, stall)!;
      if (setPathTo(s, g, qt.x, qt.y)) {
        g.activity = 'toStall';
        g.targetRide = stall.id;
        return;
      }
    }
  }
  if (g.nausea > 65) {
    wander(s, g); // walk it off
    return;
  }
  const ride = pickRide(s, g);
  if (ride) {
    const qt = queueTileFor(s, ride)!;
    if (setPathTo(s, g, qt.x, qt.y)) {
      g.activity = 'toRide';
      g.targetRide = ride.id;
      return;
    }
  }
  wander(s, g);
}

function arrive(s: ParkState, g: Guest): void {
  const act = g.activity;
  g.activity = 'none';
  g.path = [];
  g.pathIdx = 0;
  if (act === 'leaving') {
    const e = entranceTile(s);
    if (g.tx === e.x && g.ty === e.y) {
      g.state = 'gone';
      removeGuest(s, g);
      return;
    }
  } else if (act === 'toRide' && g.targetRide !== null) {
    const ride = s.rides[g.targetRide];
    if (ride && ride.open && !ride.broken && g.cash >= ride.price) {
      g.cash -= ride.price;
      s.cash += ride.price;
      s.finances.rideIncome += ride.price;
      ride.revenue += ride.price;
      g.state = 'queuing';
      g.patience = QUEUE_PATIENCE;
      ride.queue.push(g.id);
      return;
    }
    g.targetRide = null;
  } else if (act === 'toStall' && g.targetRide !== null) {
    const stall = s.rides[g.targetRide];
    const def = stall ? RIDE_TYPES[stall.typeId] : null;
    if (stall && def && def.kind === 'stall' && stall.open && g.cash >= stall.price) {
      g.cash -= stall.price;
      s.cash += stall.price;
      s.finances.stallIncome += stall.price;
      stall.revenue += stall.price;
      stall.totalRiders++; // customers served
      if (def.product === 'food') g.hunger = clamp(g.hunger - 55, 0, 100);
      else g.thirst = clamp(g.thirst - 55, 0, 100);
      g.happiness = clamp(g.happiness + 4, 0, 100);
      g.hasTrash = true;
      g.trashTimer = 80 + randInt(s, 200);
    }
    g.targetRide = null;
  }
}

function moveAlongPath(s: ParkState, g: Guest): void {
  if (g.pathIdx >= g.path.length - 1) {
    g.x = g.tx;
    g.y = g.ty;
    arrive(s, g);
    return;
  }
  const next = g.path[g.pathIdx + 1];
  const dx = next.x - g.x;
  const dy = next.y - g.y;
  const dist = Math.abs(dx) + Math.abs(dy);
  if (dist <= GUEST_SPEED) {
    g.x = next.x;
    g.y = next.y;
    g.tx = next.x;
    g.ty = next.y;
    g.pathIdx++;
    // Litter on the tile we just stepped onto bothers guests.
    const t = tileAt(s, g.tx, g.ty);
    if (t && t.litter > 0) g.happiness = clamp(g.happiness - t.litter * 0.4, 0, 100);
  } else {
    g.x += Math.sign(dx) * Math.min(GUEST_SPEED, Math.abs(dx));
    g.y += Math.sign(dy) * Math.min(GUEST_SPEED, Math.abs(dy));
  }
}

export function tickGuest(s: ParkState, g: Guest): void {
  g.ticksInPark++;

  // Needs drift. Tuned so an average visit lasts a few in-game months... of fun.
  g.hunger = clamp(g.hunger + 0.012, 0, 100);
  g.thirst = clamp(g.thirst + 0.016, 0, 100);
  g.energy = clamp(g.energy - 0.008, 0, 100);
  g.nausea = clamp(g.nausea - 0.02, 0, 100);
  if (g.hunger > 80 || g.thirst > 80) g.happiness = clamp(g.happiness - 0.02, 0, 100);
  if (g.nausea > 70) g.happiness = clamp(g.happiness - 0.015, 0, 100);

  // Sick guests may vomit, creating litter.
  if (g.nausea > 85 && rand(s) < 0.008) {
    const t = tileAt(s, g.tx, g.ty);
    if (t && t.kind === 'path') t.litter = clamp(t.litter + 2, 0, 5);
    g.nausea = 40;
    g.happiness = clamp(g.happiness - 8, 0, 100);
  }

  // Dropping trash on the path.
  if (g.hasTrash) {
    g.trashTimer--;
    if (g.trashTimer <= 0) {
      const t = tileAt(s, g.tx, g.ty);
      if (t && t.kind === 'path') t.litter = clamp(t.litter + 1, 0, 5);
      g.hasTrash = false;
    }
  }

  // Unhappy guests occasionally complain (a message + it's already in rating).
  if (g.happiness < 30 && rand(s) < 0.0015) {
    addMessage(s, `${g.name} is having a terrible time.`, 'bad');
  }

  if (g.state === 'queuing') {
    g.patience--;
    if (g.patience <= 0) {
      const ride = g.targetRide !== null ? s.rides[g.targetRide] : null;
      if (ride) ride.queue = ride.queue.filter((id) => id !== g.id);
      g.state = 'walking';
      g.targetRide = null;
      g.happiness = clamp(g.happiness - 12, 0, 100);
      addMessage(s, `${g.name} gave up queuing${ride ? ` for ${ride.name}` : ''}.`, 'bad');
    }
    return;
  }
  if (g.state === 'riding') return; // ride.ts moves them along
  if (g.state !== 'walking') return;

  if (g.path.length > 0) {
    moveAlongPath(s, g);
  } else {
    g.idleTicks++;
    if (g.idleTicks > 10) {
      g.idleTicks = 0;
      decide(s, g);
    }
  }
}
