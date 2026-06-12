import type { ParkState, Staff, StaffRole } from './types';
import {
  HANDYMAN_WAGE, MECHANIC_WAGE, REPAIR_TICKS, SWEEP_TICKS,
  addMessage, randInt, tileAt,
} from './types';
import { allPathTiles, findPath, queueTileFor } from './path';
import { entranceTile } from './grid';

const STAFF_SPEED = 0.11;
const HIRE_FEE = 50;

export function hireStaff(s: ParkState, role: StaffRole): Staff | null {
  if (s.cash < HIRE_FEE) {
    addMessage(s, 'Not enough cash to hire staff.', 'bad');
    return null;
  }
  s.cash -= HIRE_FEE;
  const e = entranceTile(s);
  const id = s.nextId++;
  const count = Object.values(s.staff).filter((st) => st.role === role).length + 1;
  const st: Staff = {
    id, role,
    name: role === 'handyman' ? `Handyman ${count}` : `Mechanic ${count}`,
    x: e.x, y: e.y, tx: e.x, ty: e.y,
    path: [], pathIdx: 0,
    task: 'idle',
    targetX: -1, targetY: -1, targetRide: null,
    workTicks: 0,
    wage: role === 'handyman' ? HANDYMAN_WAGE : MECHANIC_WAGE,
    color: role === 'handyman' ? '#e67e22' : '#2c3e50',
  };
  s.staff[id] = st;
  addMessage(s, `${st.name} hired ($${st.wage}/month).`, 'good');
  return st;
}

export function fireStaff(s: ParkState, staffId: number): boolean {
  const st = s.staff[staffId];
  if (!st) return false;
  // Unassign from any ride being repaired.
  if (st.targetRide !== null) {
    const r = s.rides[st.targetRide];
    if (r && r.mechanicId === staffId) r.mechanicId = null;
  }
  delete s.staff[staffId];
  addMessage(s, `${st.name} was let go.`);
  return true;
}

function setPathTo(s: ParkState, st: Staff, tx: number, ty: number): boolean {
  const p = findPath(s, st.tx, st.ty, tx, ty);
  if (!p) return false;
  st.path = p;
  st.pathIdx = 0;
  return true;
}

function moveAlongPath(st: Staff): boolean {
  // Returns true when the destination has been reached.
  if (st.pathIdx >= st.path.length - 1) {
    st.x = st.tx;
    st.y = st.ty;
    st.path = [];
    st.pathIdx = 0;
    return true;
  }
  const next = st.path[st.pathIdx + 1];
  const dx = next.x - st.x;
  const dy = next.y - st.y;
  if (Math.abs(dx) + Math.abs(dy) <= STAFF_SPEED) {
    st.x = next.x; st.y = next.y;
    st.tx = next.x; st.ty = next.y;
    st.pathIdx++;
  } else {
    st.x += Math.sign(dx) * Math.min(STAFF_SPEED, Math.abs(dx));
    st.y += Math.sign(dy) * Math.min(STAFF_SPEED, Math.abs(dy));
  }
  return false;
}

function nearestLitterTile(s: ParkState, st: Staff): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (let y = 0; y < s.gridH; y++) {
    for (let x = 0; x < s.gridW; x++) {
      const t = s.grid[y * s.gridW + x];
      if (t.kind === 'path' && t.litter > 0) {
        const d = Math.abs(x - st.tx) + Math.abs(y - st.ty);
        if (d < bestDist) {
          bestDist = d;
          best = { x, y };
        }
      }
    }
  }
  return best;
}

export function tickStaff(s: ParkState, st: Staff): void {
  if (st.role === 'handyman') {
    if (st.task === 'idle') {
      const litter = nearestLitterTile(s, st);
      if (litter && setPathTo(s, st, litter.x, litter.y)) {
        st.task = 'toLitter';
        st.targetX = litter.x;
        st.targetY = litter.y;
      } else {
        // Patrol randomly.
        const tiles = allPathTiles(s);
        if (tiles.length > 0) {
          const t = tiles[randInt(s, tiles.length)];
          if (setPathTo(s, st, t.x, t.y)) st.task = 'toLitter'; // reuse walking task; no sweep at end if clean
        }
      }
    } else if (st.task === 'toLitter') {
      if (moveAlongPath(st)) {
        const t = tileAt(s, st.tx, st.ty);
        if (t && t.litter > 0) {
          st.task = 'sweeping';
          st.workTicks = SWEEP_TICKS;
        } else {
          st.task = 'idle';
        }
      }
    } else if (st.task === 'sweeping') {
      st.workTicks--;
      if (st.workTicks <= 0) {
        const t = tileAt(s, st.tx, st.ty);
        if (t) t.litter = 0;
        st.task = 'idle';
      }
    }
    return;
  }

  // Mechanic
  if (st.task === 'idle') {
    // Find an unassigned broken ride.
    for (const r of Object.values(s.rides)) {
      if (r.broken && r.mechanicId === null) {
        const qt = queueTileFor(s, r);
        if (qt && setPathTo(s, st, qt.x, qt.y)) {
          r.mechanicId = st.id;
          st.targetRide = r.id;
          st.task = 'toRide';
          break;
        }
      }
    }
    if (st.task === 'idle' && st.path.length === 0) {
      const tiles = allPathTiles(s);
      if (tiles.length > 0) {
        const t = tiles[randInt(s, tiles.length)];
        setPathTo(s, st, t.x, t.y);
      }
    }
    if (st.task === 'idle' && st.path.length > 0) moveAlongPath(st);
  } else if (st.task === 'toRide') {
    const ride = st.targetRide !== null ? s.rides[st.targetRide] : null;
    if (!ride || !ride.broken) {
      // Fixed/demolished while en route.
      st.task = 'idle';
      st.targetRide = null;
      st.path = [];
      st.pathIdx = 0;
      return;
    }
    if (moveAlongPath(st)) {
      st.task = 'repairing';
      st.workTicks = REPAIR_TICKS;
    }
  } else if (st.task === 'repairing') {
    const ride = st.targetRide !== null ? s.rides[st.targetRide] : null;
    if (!ride) {
      st.task = 'idle';
      st.targetRide = null;
      return;
    }
    st.workTicks--;
    ride.repairTicks++;
    if (st.workTicks <= 0) {
      ride.broken = false;
      ride.repairTicks = 0;
      ride.mechanicId = null;
      st.task = 'idle';
      st.targetRide = null;
      addMessage(s, `${ride.name} has been fixed.`, 'good');
    }
  }
}
