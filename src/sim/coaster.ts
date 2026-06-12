import type { Dir, ParkState, PieceKind, TrackPiece } from './types';
import { DIRV, MAX_TRACK_Z, tileAt } from './types';
import { TRACK_PIECE_COST } from './ridedefs';

// Piece-by-piece coaster builder. The builder keeps a "head" (the position,
// direction and height where the next piece would start). A circuit is closed
// when the head lands exactly back on the station's entry pose.

export interface TrackBuilder {
  pieces: TrackPiece[];
  head: { x: number; y: number; dir: Dir; z: number };
}

export function startTrack(s: ParkState, x: number, y: number, dir: Dir): TrackBuilder | string {
  const t = tileAt(s, x, y);
  if (!t) return 'Out of bounds.';
  if (t.kind !== 'grass' || t.rideId !== null) return 'The station must be placed on empty grass.';
  const b: TrackBuilder = { pieces: [], head: { x, y, dir, z: 0 } };
  const err = addPiece(s, b, 'station');
  return err === null ? b : err;
}

// Returns null on success, or an error string.
export function addPiece(s: ParkState, b: TrackBuilder, kind: PieceKind): string | null {
  const h = b.head;
  if (kind === 'station' && b.pieces.length > 0) return 'Only one station allowed.';
  if (kind === 'station' && h.z !== 0) return 'Station must be at ground level.';
  const dirIn = h.dir;
  let dirOut: Dir = dirIn;
  if (kind === 'left') dirOut = ((dirIn + 3) % 4) as Dir;
  if (kind === 'right') dirOut = ((dirIn + 1) % 4) as Dir;
  const zIn = h.z;
  let zOut = zIn;
  if (kind === 'up') zOut = zIn + 1;
  if (kind === 'down') zOut = zIn - 1;
  if (zOut < 0) return 'Track cannot go below ground.';
  if (zOut > MAX_TRACK_Z) return 'Track is at maximum height.';

  const t = tileAt(s, h.x, h.y);
  if (!t) return 'Out of bounds.';
  if (t.kind !== 'grass' || t.rideId !== null) return 'Track must be built over empty grass.';
  if (b.pieces.some((p) => p.x === h.x && p.y === h.y)) return 'Track cannot cross itself.';

  const piece: TrackPiece = { x: h.x, y: h.y, dirIn, dirOut, kind, zIn, zOut };
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
  if (b.pieces.length <= 1) return false; // keep the station; cancel removes everything
  const last = b.pieces.pop()!;
  b.head = { x: last.x, y: last.y, dir: last.dirIn, z: last.zIn };
  return true;
}

export function isClosed(b: TrackBuilder): boolean {
  if (b.pieces.length < 4) return false;
  const st = b.pieces[0];
  return b.head.x === st.x && b.head.y === st.y && b.head.dir === st.dirIn && b.head.z === st.zIn;
}

export function trackCost(pieces: TrackPiece[]): number {
  return pieces.reduce((sum, p) => sum + (TRACK_PIECE_COST[p.kind] ?? 40), 0);
}

export interface TrackStats {
  excitement: number;
  intensity: number;
  nausea: number;
  lapTicks: number;
  maxSpeed: number;
}

// One physics step for a train on a track. Mutates nothing; returns new
// (pos, speed). Used both for stat calculation and the live running train.
export function stepTrain(track: TrackPiece[], pos: number, speed: number): { pos: number; speed: number } {
  const i = Math.floor(pos) % track.length;
  const piece = track[i];
  const dz = piece.zOut - piece.zIn;
  let v = speed;
  v += -dz * 0.012; // gravity along slopes
  v -= 0.0006 + v * 0.004; // rolling friction + drag
  if (piece.kind === 'up') v = Math.max(v, 0.045); // chain lift
  if (piece.kind === 'station') v = Math.max(v, 0.05); // station launch
  v = Math.min(Math.max(v, 0.015), 0.5);
  return { pos: pos + v, speed: v };
}

export function trackStats(track: TrackPiece[]): TrackStats {
  let pos = 0;
  let speed = 0.05;
  let maxSpeed = speed;
  let ticks = 0;
  const n = track.length;
  while (pos < n && ticks < 8000) {
    const r = stepTrain(track, pos, speed);
    pos = r.pos;
    speed = r.speed;
    maxSpeed = Math.max(maxSpeed, speed);
    ticks++;
  }
  const drops = track.filter((p) => p.kind === 'down').length;
  const climbs = track.filter((p) => p.kind === 'up').length;
  const turns = track.filter((p) => p.kind === 'left' || p.kind === 'right').length;
  const excitement = Math.min(9.9, 1 + drops * 0.8 + turns * 0.3 + maxSpeed * 16 + climbs * 0.2);
  const intensity = Math.min(9.9, maxSpeed * 22 + drops * 0.6);
  const nausea = Math.min(9.9, turns * 0.5 + intensity * 0.45);
  return { excitement, intensity, nausea, lapTicks: ticks, maxSpeed };
}

// Builds a ready-made 22-piece rectangular loop with a two-tile lift hill.
// Footprint: x-1..x+6, y..y+4 — caller validates space via canBuildDemoLoop.
export function demoLoopPieces(s: ParkState, x: number, y: number): TrackBuilder | string {
  const b = startTrack(s, x, y, 0);
  if (typeof b === 'string') return b;
  const seq: PieceKind[] = [
    'up', 'up', 'down', 'down', 'straight',
    'right', 'straight', 'straight', 'straight',
    'right', 'straight', 'straight', 'straight', 'straight', 'straight', 'straight',
    'right', 'straight', 'straight', 'straight',
    'right',
  ];
  for (const kind of seq) {
    const err = addPiece(s, b, kind);
    if (err !== null) return `Demo loop blocked: ${err}`;
  }
  return isClosed(b) ? b : 'Demo loop failed to close (internal error).';
}

export function canBuildDemoLoop(s: ParkState, x: number, y: number): boolean {
  for (let dy = 0; dy <= 4; dy++) {
    for (let dx = -1; dx <= 6; dx++) {
      const t = tileAt(s, x + dx, y + dy);
      if (!t || t.kind !== 'grass' || t.rideId !== null) return false;
    }
  }
  return true;
}
