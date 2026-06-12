import type { ParkState, Ride } from './types';
import { DIRV, tileAt } from './types';

function walkable(s: ParkState, x: number, y: number): boolean {
  const t = tileAt(s, x, y);
  return t !== null && (t.kind === 'path' || t.kind === 'entrance');
}

// BFS over path tiles. Returns the tile sequence from (sx,sy) to (tx,ty)
// inclusive, or null when unreachable. Grid is small (36x36) so BFS is cheap.
export function findPath(
  s: ParkState, sx: number, sy: number, tx: number, ty: number,
): { x: number; y: number }[] | null {
  if (!walkable(s, sx, sy) || !walkable(s, tx, ty)) return null;
  if (sx === tx && sy === ty) return [{ x: sx, y: sy }];
  const w = s.gridW;
  const prev = new Int32Array(w * s.gridH).fill(-1);
  const start = sy * w + sx;
  const goal = ty * w + tx;
  prev[start] = start;
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur === goal) break;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const d of DIRV) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (!walkable(s, nx, ny)) continue;
      const ni = ny * w + nx;
      if (prev[ni] !== -1) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (prev[goal] === -1) return null;
  const out: { x: number; y: number }[] = [];
  let cur = goal;
  while (cur !== start) {
    out.push({ x: cur % w, y: Math.floor(cur / w) });
    cur = prev[cur];
  }
  out.push({ x: sx, y: sy });
  out.reverse();
  return out;
}

// The tile a guest stands on to queue for a ride: the first path tile adjacent
// to the ride's footprint (stable scan order keeps it deterministic).
export function queueTileFor(s: ParkState, ride: Ride): { x: number; y: number } | null {
  for (let dy = -1; dy <= ride.h; dy++) {
    for (let dx = -1; dx <= ride.w; dx++) {
      const onEdge = dy === -1 || dy === ride.h || dx === -1 || dx === ride.w;
      if (!onEdge) continue;
      const x = ride.x + dx;
      const y = ride.y + dy;
      if (walkable(s, x, y)) return { x, y };
    }
  }
  return null;
}

export function allPathTiles(s: ParkState): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < s.gridH; y++) {
    for (let x = 0; x < s.gridW; x++) {
      if (s.grid[y * s.gridW + x].kind === 'path') out.push({ x, y });
    }
  }
  return out;
}
