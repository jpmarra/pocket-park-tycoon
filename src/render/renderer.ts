import type { ParkState, Ride, TrackPiece } from '../sim/types';
import { DIRV } from '../sim/types';
import { RIDE_TYPES } from '../sim/ridedefs';
import type { TrackBuilder } from '../sim/coaster';

export const TILE_W = 44;
export const TILE_H = 22;
export const Z_PX = 12;

export interface Camera {
  x: number; // screen-space offset of world origin, px
  y: number;
  zoom: number;
}

// What the input/UI layer wants drawn on top of the world.
export interface ViewState {
  tool: string; // 'select' | 'path' | 'delpath' | 'ride:<id>' | 'coaster' | 'demoloop'
  hover: { x: number; y: number } | null;
  canAct: boolean; // current hover placement is valid
  builder: TrackBuilder | null;
  builderPlacingStation: boolean;
  stationDir: number;
  selectedRide: number | null;
}

export function tileToWorld(x: number, y: number, z = 0): { x: number; y: number } {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) - z * Z_PX };
}

export function screenToTile(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  const wx = (sx - cam.x) / cam.zoom;
  const wy = (sy - cam.y) / cam.zoom;
  const a = wx / (TILE_W / 2);
  const b = wy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, z: number): void {
  const a = tileToWorld(x, y, z);
  const b = tileToWorld(x + w, y, z);
  const c = tileToWorld(x + w, y + h, z);
  const d = tileToWorld(x, y + h, z);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, zh: number,
  color: string, alpha = 1,
): void {
  ctx.globalAlpha = alpha;
  const bT = tileToWorld(x + w, y, zh);
  const cT = tileToWorld(x + w, y + h, zh);
  const dT = tileToWorld(x, y + h, zh);
  const bG = tileToWorld(x + w, y, 0);
  const cG = tileToWorld(x + w, y + h, 0);
  const dG = tileToWorld(x, y + h, 0);
  // East face (towards +x)
  ctx.fillStyle = shade(color, 0.65);
  ctx.beginPath();
  ctx.moveTo(bT.x, bT.y); ctx.lineTo(cT.x, cT.y); ctx.lineTo(cG.x, cG.y); ctx.lineTo(bG.x, bG.y);
  ctx.closePath(); ctx.fill();
  // South face (towards +y)
  ctx.fillStyle = shade(color, 0.8);
  ctx.beginPath();
  ctx.moveTo(cT.x, cT.y); ctx.lineTo(dT.x, dT.y); ctx.lineTo(dG.x, dG.y); ctx.lineTo(cG.x, cG.y);
  ctx.closePath(); ctx.fill();
  // Top face
  ctx.fillStyle = color;
  diamond(ctx, x, y, w, h, zh);
  ctx.fill();
  ctx.strokeStyle = shade(color, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function pieceGeometry(p: TrackPiece): { x: number; y: number }[] {
  const cx = p.x + 0.5;
  const cy = p.y + 0.5;
  const zMid = (p.zIn + p.zOut) / 2;
  const entry = tileToWorld(cx - DIRV[p.dirIn].x * 0.5, cy - DIRV[p.dirIn].y * 0.5, p.zIn);
  const mid = tileToWorld(cx, cy, zMid);
  const exit = tileToWorld(cx + DIRV[p.dirOut].x * 0.5, cy + DIRV[p.dirOut].y * 0.5, p.zOut);
  return [entry, mid, exit];
}

function drawTrackPiece(ctx: CanvasRenderingContext2D, p: TrackPiece, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha;
  const [entry, mid, exit] = pieceGeometry(p);
  // Support post down to the ground.
  if (p.zIn > 0 || p.zOut > 0) {
    const groundMid = tileToWorld(p.x + 0.5, p.y + 0.5, 0);
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y);
    ctx.lineTo(groundMid.x, groundMid.y);
    ctx.stroke();
  }
  if (p.kind === 'station') {
    drawBox(ctx, p.x + 0.1, p.y + 0.1, 0.8, 0.8, 0.35, '#888', alpha);
    ctx.globalAlpha = alpha;
  }
  ctx.strokeStyle = '#42301f';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(entry.x, entry.y);
  ctx.lineTo(mid.x, mid.y);
  ctx.lineTo(exit.x, exit.y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(entry.x, entry.y);
  ctx.lineTo(mid.x, mid.y);
  ctx.lineTo(exit.x, exit.y);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
}

function trainPoint(track: TrackPiece[], pos: number): { x: number; y: number } {
  const n = track.length;
  let p = pos;
  if (p < 0) p += n;
  const i = Math.floor(p) % n;
  const t = p - Math.floor(p);
  const [entry, mid, exit] = pieceGeometry(track[i]);
  if (t < 0.5) {
    const u = t * 2;
    return { x: entry.x + (mid.x - entry.x) * u, y: entry.y + (mid.y - entry.y) * u };
  }
  const u = (t - 0.5) * 2;
  return { x: mid.x + (exit.x - mid.x) * u, y: mid.y + (exit.y - mid.y) * u };
}

interface DrawItem {
  depth: number;
  draw: () => void;
}

export function render(
  ctx: CanvasRenderingContext2D,
  s: ParkState,
  cam: Camera,
  view: ViewState,
  cw: number,
  ch: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#15241c';
  ctx.fillRect(0, 0, cw, ch);
  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cam.x, cam.y);

  // --- Ground pass ---
  for (let y = 0; y < s.gridH; y++) {
    for (let x = 0; x < s.gridW; x++) {
      const t = s.grid[y * s.gridW + x];
      let fill: string;
      if (t.kind === 'path') fill = '#9a9a8a';
      else if (t.kind === 'entrance') fill = '#c46a3b';
      else fill = (x * 31 + y * 17) % 3 === 0 ? '#3e7a3a' : '#458443';
      diamond(ctx, x, y, 1, 1, 0);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      if (t.litter > 0) {
        ctx.fillStyle = '#6a4a2a';
        for (let i = 0; i < t.litter; i++) {
          const ox = ((x * 7 + y * 13 + i * 29) % 10) / 10;
          const oy = ((x * 11 + y * 3 + i * 17) % 10) / 10;
          const w = tileToWorld(x + 0.2 + ox * 0.6, y + 0.2 + oy * 0.6, 0);
          ctx.fillRect(w.x - 1.5, w.y - 1, 3, 2);
        }
      }
    }
  }

  // Park boundary.
  diamond(ctx, 0, 0, s.gridW, s.gridH, 0);
  ctx.strokeStyle = '#7a5a3a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // --- Entity pass (depth sorted) ---
  const items: DrawItem[] = [];

  for (const ride of Object.values(s.rides)) {
    if (ride.track) {
      for (const p of ride.track) {
        items.push({
          depth: p.x + p.y + 0.4,
          draw: () => drawTrackPiece(ctx, p, RIDE_TYPES.coaster.color),
        });
      }
      // Train (only meaningful while running; parked at the station otherwise).
      const track = ride.track;
      const pos = ride.state === 'running' ? (ride.trainPos ?? 0) : 0.2;
      items.push({
        depth: track[Math.floor(pos) % track.length].x + track[Math.floor(pos) % track.length].y + 0.6,
        draw: () => {
          for (let c = 0; c < 3; c++) {
            const pt = trainPoint(track, Math.max(0, pos - c * 0.35));
            ctx.fillStyle = c === 0 ? '#b03030' : '#902020';
            ctx.strokeStyle = '#300';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(pt.x, pt.y - 3, 5.5, 3.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        },
      });
    } else {
      const def = RIDE_TYPES[ride.typeId];
      items.push({
        depth: ride.x + ride.w - 1 + ride.y + ride.h - 1 + 0.5,
        draw: () => {
          const running = ride.state === 'running';
          drawBox(ctx, ride.x, ride.y, ride.w, ride.h, def.height, def.color);
          // Animated marker while running.
          if (running) {
            const c = tileToWorld(ride.x + ride.w / 2, ride.y + ride.h / 2, def.height);
            const ang = (s.tick % 40) / 40 * Math.PI * 2;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(c.x, c.y, 6, ang, ang + Math.PI * 1.2);
            ctx.stroke();
          }
          // Label
          const c = tileToWorld(ride.x + ride.w / 2, ride.y + ride.h / 2, def.height);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(def.kind === 'stall' ? (def.product === 'food' ? '🍔' : '🥤') : def.name[0], c.x, c.y + 3);
          if (ride.broken && Math.floor(s.tick / 8) % 2 === 0) {
            ctx.fillStyle = '#ff4040';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText('✕', c.x, c.y - 8);
          }
          if (!ride.open) {
            ctx.fillStyle = '#ffd166';
            ctx.font = 'bold 8px sans-serif';
            ctx.fillText('CLOSED', c.x, c.y + 14);
          }
        },
      });
    }
    // Broken coaster indicator.
    if (ride.track && ride.broken && Math.floor(s.tick / 8) % 2 === 0) {
      const st = ride.track[0];
      items.push({
        depth: st.x + st.y + 0.9,
        draw: () => {
          const c = tileToWorld(st.x + 0.5, st.y + 0.5, 1.5);
          ctx.fillStyle = '#ff4040';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✕', c.x, c.y);
        },
      });
    }
  }

  // Guests (skip riders — they're on the ride).
  for (const g of Object.values(s.guests)) {
    if (g.state === 'riding') continue;
    const qOff = g.state === 'queuing'
      ? { x: (((g.id * 7) % 5) - 2) * 0.08, y: (((g.id * 13) % 5) - 2) * 0.08 }
      : { x: 0, y: 0 };
    items.push({
      depth: g.x + g.y + 0.6,
      draw: () => {
        const w = tileToWorld(g.x + 0.5 + qOff.x, g.y + 0.5 + qOff.y, 0);
        ctx.fillStyle = g.color;
        ctx.beginPath();
        ctx.ellipse(w.x, w.y - 3, 2.4, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f0c8a0';
        ctx.beginPath();
        ctx.arc(w.x, w.y - 8, 2, 0, Math.PI * 2);
        ctx.fill();
      },
    });
  }

  // Staff.
  for (const st of Object.values(s.staff)) {
    items.push({
      depth: st.x + st.y + 0.65,
      draw: () => {
        const w = tileToWorld(st.x + 0.5, st.y + 0.5, 0);
        ctx.fillStyle = st.color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.fillRect(w.x - 3, w.y - 9, 6, 8);
        ctx.strokeRect(w.x - 3, w.y - 9, 6, 8);
      },
    });
  }

  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.draw();

  // --- Overlay pass: selection, ghosts ---
  if (view.selectedRide !== null) {
    const r: Ride | undefined = s.rides[view.selectedRide];
    if (r) {
      diamond(ctx, r.x, r.y, r.w, r.h, 0);
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  if (view.builder) {
    for (const p of view.builder.pieces) drawTrackPiece(ctx, p, '#ff8888', 0.9);
    // Head arrow showing where the next piece goes.
    const h = view.builder.head;
    const from = tileToWorld(h.x + 0.5 - DIRV[h.dir].x * 0.3, h.y + 0.5 - DIRV[h.dir].y * 0.3, h.z);
    const to = tileToWorld(h.x + 0.5 + DIRV[h.dir].x * 0.3, h.y + 0.5 + DIRV[h.dir].y * 0.3, h.z);
    ctx.strokeStyle = '#ffff66';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    diamond(ctx, h.x, h.y, 1, 1, 0);
    ctx.strokeStyle = '#ffff66';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  if (view.hover) {
    const hx = view.hover.x;
    const hy = view.hover.y;
    const ok = view.canAct;
    const color = ok ? 'rgba(120,255,120,0.4)' : 'rgba(255,80,80,0.4)';
    if (view.tool.startsWith('ride:')) {
      const def = RIDE_TYPES[view.tool.slice(5)];
      if (def) {
        drawBox(ctx, hx, hy, def.w, def.h, def.height, def.color, 0.45);
        diamond(ctx, hx, hy, def.w, def.h, 0);
        ctx.fillStyle = color;
        ctx.fill();
      }
    } else if (view.tool === 'demoloop') {
      diamond(ctx, hx - 1, hy, 8, 5, 0);
      ctx.fillStyle = color;
      ctx.fill();
    } else if (view.tool === 'coaster' && view.builderPlacingStation) {
      diamond(ctx, hx, hy, 1, 1, 0);
      ctx.fillStyle = color;
      ctx.fill();
      const d = DIRV[view.stationDir];
      const from = tileToWorld(hx + 0.5, hy + 0.5, 0);
      const to = tileToWorld(hx + 0.5 + d.x * 0.45, hy + 0.5 + d.y * 0.45, 0);
      ctx.strokeStyle = '#ffff66';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    } else if (view.tool === 'path' || view.tool === 'delpath') {
      diamond(ctx, hx, hy, 1, 1, 0);
      ctx.fillStyle = view.tool === 'delpath' ? 'rgba(255,80,80,0.4)' : color;
      ctx.fill();
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
