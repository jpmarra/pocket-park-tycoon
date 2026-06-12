import type { Dir, ParkState, PieceOp, TrackPiece } from './types';
import { DIRV, MAX_TRACK_Z, tileAt } from './types';
import { TRACK_PIECE_COST } from './ridedefs';

// ---------------------------------------------------------------------------
// RCT-style coaster construction. A piece combines turn + slope + banking +
// chain + special element, validated against the track type's capabilities,
// and stats come from a physics pass that tracks speed and G-forces.
// ---------------------------------------------------------------------------

export interface CoasterTypeCfg {
  id: string;
  name: string;
  allowsInversions: boolean;
  allowsSteep: boolean;
  friction: number; // constant rolling resistance per tick
  drag: number; // speed-proportional drag per tick
  liftSpeed: number;
  costFactor: number;
  defaultCars: number;
  maxCars: number;
  // Wooden coasters ride rougher: bonus excitement for airtime, extra nausea.
  airtimeBonus: number;
  roughness: number;
}

export const COASTER_TYPES: Record<string, CoasterTypeCfg> = {
  'coaster-wooden': {
    id: 'coaster-wooden', name: 'Wooden Roller Coaster',
    allowsInversions: false, allowsSteep: true,
    friction: 0.00085, drag: 0.0045, liftSpeed: 0.042,
    costFactor: 0.85, defaultCars: 5, maxCars: 7,
    airtimeBonus: 0.45, roughness: 0.35,
  },
  'coaster-mini': {
    id: 'coaster-mini', name: 'Steel Mini Coaster',
    allowsInversions: false, allowsSteep: false,
    friction: 0.0007, drag: 0.004, liftSpeed: 0.045,
    costFactor: 0.6, defaultCars: 4, maxCars: 5,
    airtimeBonus: 0.15, roughness: 0.1,
  },
  'coaster-twister': {
    id: 'coaster-twister', name: 'Steel Twister',
    allowsInversions: true, allowsSteep: true,
    friction: 0.00055, drag: 0.0038, liftSpeed: 0.048,
    costFactor: 1.25, defaultCars: 5, maxCars: 8,
    airtimeBonus: 0.2, roughness: 0.05,
  },
};

export const STRAIGHT: PieceOp = { turn: 0, slope: 0, bank: 0, chain: false, special: 'none' };
export function op(partial: Partial<PieceOp>): PieceOp {
  return { ...STRAIGHT, ...partial };
}

export interface TrackBuilder {
  typeId: string;
  pieces: TrackPiece[];
  head: { x: number; y: number; dir: Dir; z: number };
}

export function pieceCost(p: PieceOp, typeId: string): number {
  const cfg = COASTER_TYPES[typeId];
  const c = TRACK_PIECE_COST;
  let cost = c.base;
  if (p.special === 'station') cost = c.station;
  else if (p.special === 'loop') cost += c.loop;
  else if (p.special === 'corkscrewL' || p.special === 'corkscrewR') cost += c.corkscrew;
  else if (p.special === 'brakes') cost += c.brakes;
  if (p.turn !== 0) cost += c.turn;
  if (Math.abs(p.slope) === 1) cost += c.slope;
  if (Math.abs(p.slope) === 2) cost += c.steep;
  if (p.bank !== 0) cost += c.bank;
  if (p.chain) cost += c.chain;
  return Math.round(cost * (cfg?.costFactor ?? 1));
}

export function trackCost(pieces: TrackPiece[], typeId: string): number {
  return pieces.reduce((sum, p) => sum + pieceCost(p, typeId), 0);
}

export function startTrack(s: ParkState, typeId: string, x: number, y: number, dir: Dir): TrackBuilder | string {
  if (!COASTER_TYPES[typeId]) return 'Unknown coaster type.';
  const t = tileAt(s, x, y);
  if (!t) return 'Out of bounds.';
  if (t.kind !== 'grass' || t.rideId !== null) return 'The station must be placed on empty grass.';
  const b: TrackBuilder = { typeId, pieces: [], head: { x, y, dir, z: 0 } };
  const err = addPiece(s, b, op({ special: 'station' }));
  return err === null ? b : err;
}

// Validates the op against the type + current head, appends the piece.
// Returns null on success or a human-readable error. Pass s=null for pure
// geometry layout (e.g. computing a design's stats without a park).
export function addPiece(s: ParkState | null, b: TrackBuilder, o: PieceOp): string | null {
  const cfg = COASTER_TYPES[b.typeId];
  const h = b.head;

  if (o.special === 'station') {
    if (b.pieces.length > 0) return 'Only one station allowed.';
    if (h.z !== 0) return 'Station must be at ground level.';
  }
  const inversion = o.special === 'loop' || o.special === 'corkscrewL' || o.special === 'corkscrewR';
  if (inversion) {
    if (!cfg.allowsInversions) return `${cfg.name} cannot do inversions.`;
    if (o.turn !== 0 || o.slope !== 0 || o.bank !== 0) return 'Inversions must be on straight, level track.';
  }
  if (o.special === 'brakes' && (o.turn !== 0 || o.slope !== 0)) return 'Brakes must be on straight, level track.';
  if (Math.abs(o.slope) === 2) {
    if (!cfg.allowsSteep) return `${cfg.name} cannot use steep slopes.`;
    if (o.turn !== 0) return 'Steep track cannot turn.';
    if (o.bank !== 0) return 'Steep track cannot be banked.';
  }
  if (o.turn !== 0 && Math.abs(o.slope) === 2) return 'Steep track cannot turn.';
  if (o.bank !== 0 && Math.abs(o.slope) === 2) return 'Cannot bank steep track.';
  if (o.chain && o.slope <= 0) return 'Chain lifts only work uphill.';

  const dirIn = h.dir;
  const dirOut: Dir = ((dirIn + (o.turn === -1 ? 3 : o.turn === 1 ? 1 : 0)) % 4) as Dir;
  const zIn = h.z;
  const zOut = zIn + o.slope;
  if (zOut < 0) return 'Track cannot go below ground.';
  if (zOut > MAX_TRACK_Z) return 'Track is at maximum height.';

  if (s !== null) {
    const t = tileAt(s, h.x, h.y);
    if (!t) return 'Out of bounds.';
    if (t.kind !== 'grass' || t.rideId !== null) return 'Track must be built over empty grass.';
  }
  if (b.pieces.some((p) => p.x === h.x && p.y === h.y)) return 'Track cannot cross itself.';

  const piece: TrackPiece = { ...o, x: h.x, y: h.y, dirIn, dirOut, zIn, zOut };
  b.pieces.push(piece);
  b.head = {
    x: h.x + DIRV[dirOut].x,
    y: h.y + DIRV[dirOut].y,
    dir: dirOut,
    z: zOut,
  };
  return null;
}

export function undoPiece(b: TrackBuilder): boolean {
  if (b.pieces.length <= 1) return false;
  const last = b.pieces.pop()!;
  b.head = { x: last.x, y: last.y, dir: last.dirIn, z: last.zIn };
  return true;
}

export function isClosed(b: TrackBuilder): boolean {
  if (b.pieces.length < 4) return false;
  const st = b.pieces[0];
  return b.head.x === st.x && b.head.y === st.y && b.head.dir === st.dirIn && b.head.z === st.zIn;
}

// ------------------------------------------------------------------ physics

// One tick of train motion. Used by the live sim and the stats pass.
export function stepTrain(
  track: TrackPiece[], pos: number, speed: number, typeId: string,
): { pos: number; speed: number } {
  const cfg = COASTER_TYPES[typeId] ?? COASTER_TYPES['coaster-twister'];
  const i = Math.floor(pos) % track.length;
  const piece = track[i];
  const dz = piece.zOut - piece.zIn;
  let v = speed;
  v += -dz * 0.0105; // gravity along the slope
  let friction = cfg.friction + v * cfg.drag;
  if (piece.special === 'loop' || piece.special === 'corkscrewL' || piece.special === 'corkscrewR') {
    friction *= 2.6; // inversions scrub speed
  }
  v -= friction;
  if (piece.chain || piece.special === 'station') v = Math.max(v, cfg.liftSpeed);
  if (piece.special === 'brakes') v = Math.min(v, 0.055);
  v = Math.min(Math.max(v, 0.012), 0.6);
  return { pos: pos + v, speed: v };
}

export interface TrackStats {
  valid: boolean;
  reason: string;
  excitement: number;
  intensity: number;
  nausea: number;
  lapTicks: number;
  maxSpeed: number;
  maxPosG: number;
  minVertG: number;
  maxLatG: number;
  airtime: number;
  inversions: number;
  drops: number;
  highestZ: number;
}

const INVALID = (reason: string): TrackStats => ({
  valid: false, reason, excitement: 0, intensity: 0, nausea: 0,
  lapTicks: 0, maxSpeed: 0, maxPosG: 1, minVertG: 1, maxLatG: 0,
  airtime: 0, inversions: 0, drops: 0, highestZ: 0,
});

export function trackStats(track: TrackPiece[], typeId: string): TrackStats {
  const cfg = COASTER_TYPES[typeId] ?? COASTER_TYPES['coaster-twister'];
  let pos = 0.01;
  let speed = cfg.liftSpeed;
  let ticks = 0;
  let maxSpeed = speed;
  let maxPosG = 1;
  let minVertG = 1;
  let maxLatG = 0;
  let latSum = 0;
  let airtime = 0;
  let lastPiece = 0;
  let lastDz = 0;
  let crawlTicks = 0;
  const n = track.length;

  while (pos < n && ticks < 9000) {
    const i = Math.floor(pos) % n;
    const piece = track[i];
    // A train inching up an unchained climb at the minimum speed has stalled
    // (it would roll back in reality).
    if (speed <= 0.0125 && piece.slope > 0 && !piece.chain) {
      crawlTicks++;
      if (crawlTicks > 50) {
        return INVALID('The train stalls before completing the circuit — add a chain lift or reduce climbs.');
      }
    } else {
      crawlTicks = 0;
    }
    if (i !== lastPiece) {
      // Vertical G at the transition. The slope delta is negative when
      // cresting a hill (weightless / airtime) and positive when pulling out
      // of a drop into a valley (positive G).
      const dz = piece.zOut - piece.zIn;
      const slopeChange = dz - lastDz;
      const vertG = 1 + slopeChange * speed * 6;
      if (vertG > maxPosG) maxPosG = vertG;
      if (vertG < minVertG) minVertG = vertG;
      if (vertG < 0.25 && speed > 0.08) airtime++;
      lastDz = dz;
      lastPiece = i;
      // Inversion entry-speed requirements (the train valleys otherwise).
      if (piece.special === 'loop' && speed < 0.16) {
        return INVALID('Too slow for the vertical loop — add drop height before it.');
      }
      if ((piece.special === 'corkscrewL' || piece.special === 'corkscrewR') && speed < 0.12) {
        return INVALID('Too slow for the corkscrew — add drop height before it.');
      }
      if (piece.special === 'loop') maxPosG = Math.max(maxPosG, 2.8 + speed * 5);
    }
    if (piece.turn !== 0) {
      const lat = speed * speed * (piece.bank !== 0 ? 7 : 26);
      latSum += lat;
      if (lat > maxLatG) maxLatG = lat;
    }
    const r = stepTrain(track, pos, speed, typeId);
    pos = r.pos;
    speed = r.speed;
    if (speed > maxSpeed) maxSpeed = speed;
    ticks++;
  }
  if (pos < n) {
    return INVALID('The train stalls before completing the circuit — add a chain lift or reduce climbs.');
  }

  const drops = track.filter((p) => p.slope < 0).length;
  const steep = track.filter((p) => Math.abs(p.slope) === 2).length;
  const turns = track.filter((p) => p.turn !== 0).length;
  const inversions = track.filter((p) => p.special === 'loop' || p.special === 'corkscrewL' || p.special === 'corkscrewR').length;
  const highestZ = Math.max(...track.map((p) => p.zOut));

  let intensity = (maxPosG - 1) * 1.0 + maxLatG * 7 + steep * 0.1 + inversions * 0.5 + maxSpeed * 3 + cfg.roughness;
  intensity = Math.min(9.9, intensity);
  let excitement = 1.1
    + drops * 0.32
    + airtime * (0.5 + cfg.airtimeBonus)
    + inversions * 0.9
    + maxSpeed * 11
    + turns * 0.13
    + highestZ * 0.08;
  if (intensity > 9.2) excitement *= 0.45; // painfully intense rides aren't fun
  excitement = Math.min(9.9, excitement);
  let nausea = maxLatG * 6 + latSum * 0.15 + inversions * 0.7 + cfg.roughness * 2 + intensity * 0.2;
  nausea = Math.min(9.9, nausea);

  return {
    valid: true, reason: '', excitement, intensity, nausea,
    lapTicks: ticks, maxSpeed, maxPosG, minVertG, maxLatG,
    airtime, inversions, drops, highestZ,
  };
}

// ------------------------------------------------------------- pre-builts --

export interface CoasterDesign {
  id: string;
  name: string;
  typeId: string;
  desc: string;
  ops: PieceOp[];
  // Footprint relative to the station tile, facing east: [minDx, minDy, maxDx, maxDy]
  bounds: [number, number, number, number];
}

// Helpers for authoring designs.
const chainUp = op({ slope: 1, chain: true });
const up = op({ slope: 1 });
const down = op({ slope: -1 });
const steepDown = op({ slope: -2 });
const str = STRAIGHT;
const turnRb = op({ turn: 1, bank: 1 });
const loop = op({ special: 'loop' });
const ckL = op({ special: 'corkscrewL' });
const ckR = op({ special: 'corkscrewR' });
const brakes = op({ special: 'brakes' });

// All designs are rectangles (only right turns), so the leg lengths must
// match: E-run n, turn, S-run m, turn, W-run n, turn, N-run m, turn.
// Station is the first piece of the east run. Verified closed by unit tests.
export const COASTER_DESIGNS: CoasterDesign[] = [
  {
    id: 'little-comet',
    name: 'Little Comet',
    typeId: 'coaster-mini',
    desc: 'A gentle starter coaster with two friendly hills.',
    bounds: [-1, 0, 6, 4],
    ops: [
      chainUp, chainUp, down, down, str, // east (station + these 5 = 6)
      turnRb,
      str, str, str, // south 3
      turnRb,
      str, up, down, str, str, str, // west 6
      turnRb,
      str, str, str, // north 3
      turnRb,
    ],
  },
  {
    id: 'woodchip',
    name: 'Woodchip',
    typeId: 'coaster-wooden',
    desc: 'Classic wooden out-and-back stuffed with airtime hills.',
    bounds: [-1, 0, 12, 3],
    ops: [
      chainUp, chainUp, chainUp, steepDown, down, up, down, up, down, str, str, // east (12 with station)
      turnRb,
      str, str, // south 2
      turnRb,
      str, up, down, str, up, down, str, up, down, str, str, str, // west 12
      turnRb,
      str, str, // north 2
      turnRb,
    ],
  },
  {
    id: 'cyclone',
    name: 'Cyclone',
    typeId: 'coaster-wooden',
    desc: 'A twisting woodie with a steep first drop and banked corners.',
    bounds: [-1, 0, 8, 5],
    ops: [
      chainUp, chainUp, chainUp, chainUp, steepDown, steepDown, str, // east (8 with station)
      turnRb,
      up, down, str, str, // south 4
      turnRb,
      str, up, down, str, up, down, str, str, // west 8
      turnRb,
      str, str, str, brakes, // north 4
      turnRb,
    ],
  },
  {
    id: 'twister',
    name: 'Twister',
    typeId: 'coaster-twister',
    desc: 'Vertical loop and twin corkscrews — the classic steel twister.',
    bounds: [-1, 0, 11, 4],
    ops: [
      // east run: station + these 10 (chain lift to z4, steep drop into the loop)
      chainUp, chainUp, chainUp, chainUp, steepDown, down, loop, down, str, str,
      turnRb,
      ckL, str, str, // south 3
      turnRb,
      str, str, ckR, str, str, up, down, str, brakes, str, str, // west 11
      turnRb,
      str, str, str, // north 3
      turnRb,
    ],
  },
];

export function getDesign(id: string): CoasterDesign | undefined {
  return COASTER_DESIGNS.find((d) => d.id === id);
}

export function canBuildDesign(s: ParkState, d: CoasterDesign, x: number, y: number): boolean {
  for (let dy = d.bounds[1]; dy <= d.bounds[3]; dy++) {
    for (let dx = d.bounds[0]; dx <= d.bounds[2]; dx++) {
      const t = tileAt(s, x + dx, y + dy);
      if (!t || t.kind !== 'grass' || t.rideId !== null) return false;
    }
  }
  return true;
}

// Lays out a design with its station at (x,y) facing east. Returns the
// builder or an error string.
export function buildDesign(s: ParkState, d: CoasterDesign, x: number, y: number): TrackBuilder | string {
  const b = startTrack(s, d.typeId, x, y, 0);
  if (typeof b === 'string') return b;
  for (const o of d.ops) {
    const err = addPiece(s, b, o);
    if (err !== null) return `${d.name}: ${err}`;
  }
  if (!isClosed(b)) return `${d.name}: layout failed to close (internal error).`;
  return b;
}

// Pure-geometry layout of a design (no park needed) — for previews and tests.
export function designPieces(d: CoasterDesign): TrackPiece[] | string {
  const b: TrackBuilder = { typeId: d.typeId, pieces: [], head: { x: 0, y: 0, dir: 0, z: 0 } };
  let err = addPiece(null, b, op({ special: 'station' }));
  if (err !== null) return err;
  for (const o of d.ops) {
    err = addPiece(null, b, o);
    if (err !== null) return `${d.name}: ${err}`;
  }
  if (!isClosed(b)) return `${d.name}: layout failed to close.`;
  return b.pieces;
}

export function designCost(d: CoasterDesign): number {
  const pieces = designPieces(d);
  if (typeof pieces === 'string') return 0;
  return trackCost(pieces, d.typeId);
}

export function designStats(d: CoasterDesign): TrackStats {
  const pieces = designPieces(d);
  if (typeof pieces === 'string') return INVALID(pieces);
  return trackStats(pieces, d.typeId);
}
