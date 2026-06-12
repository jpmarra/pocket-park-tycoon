import type { Guest, ParkState, Ride, RideTypeDef, Staff, TrackPiece } from '../sim/types';
import { DIRV } from '../sim/types';
import { RIDE_TYPES } from '../sim/ridedefs';
import type { TrackBuilder } from '../sim/coaster';
import { getDesign } from '../sim/coaster';

export const TILE_W = 44;
export const TILE_H = 22;
export const Z_PX = 12;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface ViewState {
  tool: string;
  hover: { x: number; y: number } | null;
  canAct: boolean;
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

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
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

function shadow(ctx: CanvasRenderingContext2D, wx: number, wy: number, rx: number, ry: number): void {
  ctx.fillStyle = 'rgba(20,40,20,0.30)';
  ctx.beginPath();
  ctx.ellipse(wx, wy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function box(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, z0: number, z1: number,
  color: string, alpha = 1,
): void {
  ctx.globalAlpha = alpha;
  const bT = tileToWorld(x + w, y, z1);
  const cT = tileToWorld(x + w, y + h, z1);
  const dT = tileToWorld(x, y + h, z1);
  const bG = tileToWorld(x + w, y, z0);
  const cG = tileToWorld(x + w, y + h, z0);
  const dG = tileToWorld(x, y + h, z0);
  ctx.fillStyle = shade(color, 0.62);
  ctx.beginPath();
  ctx.moveTo(bT.x, bT.y); ctx.lineTo(cT.x, cT.y); ctx.lineTo(cG.x, cG.y); ctx.lineTo(bG.x, bG.y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(color, 0.82);
  ctx.beginPath();
  ctx.moveTo(cT.x, cT.y); ctx.lineTo(dT.x, dT.y); ctx.lineTo(dG.x, dG.y); ctx.lineTo(cG.x, cG.y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = color;
  diamond(ctx, x, y, w, h, z1);
  ctx.fill();
  ctx.strokeStyle = shade(color, 0.45);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- terrain ---

const GRASS_A = '#55973f';
const GRASS_B = '#4f9039';
const PATH_FILL = '#c9b690';
const PATH_EDGE = '#8d7d5c';

function drawGrassTile(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  diamond(ctx, x, y, 1, 1, 0);
  ctx.fillStyle = (x + y) % 2 === 0 ? GRASS_A : GRASS_B;
  ctx.fill();
  const h = hash2(x, y);
  if (h > 0.5) {
    const a = tileToWorld(x + 0.25, y + 0.55);
    const b = tileToWorld(x + 0.75, y + 0.45);
    ctx.strokeStyle = 'rgba(0,60,0,0.08)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  if (h > 0.93) {
    const colors = ['#e84d6f', '#f2d653', '#ffffff', '#c77dd8'];
    for (let i = 0; i < 3; i++) {
      const fx = x + 0.25 + hash2(x * 3 + i, y) * 0.5;
      const fy = y + 0.25 + hash2(x, y * 3 + i) * 0.5;
      const w = tileToWorld(fx, fy);
      ctx.fillStyle = colors[Math.floor(hash2(x + i, y + i) * colors.length)];
      ctx.fillRect(w.x - 1, w.y - 1, 2, 2);
    }
  }
}

function drawPathTile(ctx: CanvasRenderingContext2D, s: ParkState, x: number, y: number): void {
  diamond(ctx, x, y, 1, 1, 0);
  ctx.fillStyle = PATH_FILL;
  ctx.fill();
  const m1 = tileToWorld(x + 0.5, y);
  const m2 = tileToWorld(x + 0.5, y + 1);
  const m3 = tileToWorld(x, y + 0.5);
  const m4 = tileToWorld(x + 1, y + 0.5);
  ctx.strokeStyle = 'rgba(110,95,60,0.25)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y);
  ctx.moveTo(m3.x, m3.y); ctx.lineTo(m4.x, m4.y);
  ctx.stroke();
  const walk = (nx: number, ny: number): boolean => {
    if (nx < 0 || ny < 0 || nx >= s.gridW || ny >= s.gridH) return false;
    const k = s.grid[ny * s.gridW + nx].kind;
    return k === 'path' || k === 'entrance';
  };
  const corners = [
    tileToWorld(x, y), tileToWorld(x + 1, y), tileToWorld(x + 1, y + 1), tileToWorld(x, y + 1),
  ];
  const edges: Array<[number, number, number, number]> = [
    [0, 1, x, y - 1],
    [1, 2, x + 1, y],
    [2, 3, x, y + 1],
    [3, 0, x - 1, y],
  ];
  ctx.strokeStyle = PATH_EDGE;
  ctx.lineWidth = 1.6;
  for (const [a, b, nx, ny] of edges) {
    if (!walk(nx, ny)) {
      ctx.beginPath();
      ctx.moveTo(corners[a].x, corners[a].y);
      ctx.lineTo(corners[b].x, corners[b].y);
      ctx.stroke();
    }
  }
}

function drawLitter(ctx: CanvasRenderingContext2D, x: number, y: number, amount: number): void {
  for (let i = 0; i < amount; i++) {
    const ox = 0.2 + hash2(x * 7 + i, y * 3) * 0.6;
    const oy = 0.2 + hash2(x * 3, y * 7 + i) * 0.6;
    const w = tileToWorld(x + ox, y + oy);
    const kind = hash2(x + i * 11, y + i * 5);
    if (kind < 0.5) {
      ctx.fillStyle = '#e8e4d8';
      ctx.beginPath();
      ctx.moveTo(w.x - 2, w.y);
      ctx.lineTo(w.x, w.y - 2);
      ctx.lineTo(w.x + 2, w.y);
      ctx.lineTo(w.x, w.y + 1.5);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = '#7a4f2a';
      ctx.fillRect(w.x - 1.5, w.y - 2.5, 3, 4);
    }
  }
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const h = hash2(x * 13, y * 17);
  const cx = x + 0.35 + h * 0.3;
  const cy = y + 0.35 + hash2(x, y * 29) * 0.3;
  const base = tileToWorld(cx, cy);
  const size = 5 + h * 4;
  shadow(ctx, base.x + 2, base.y + 1, size * 0.9, size * 0.4);
  ctx.strokeStyle = '#5d4226';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(base.x, base.y - size * 0.9);
  ctx.stroke();
  const greens = ['#2e6b2a', '#357a2f', '#3f8a35'];
  const g0 = greens[Math.floor(h * greens.length)];
  ctx.fillStyle = shade(g0, 0.8);
  ctx.beginPath();
  ctx.arc(base.x - size * 0.35, base.y - size * 0.95, size * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = g0;
  ctx.beginPath();
  ctx.arc(base.x + size * 0.3, base.y - size * 1.0, size * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(g0, 1.15);
  ctx.beginPath();
  ctx.arc(base.x, base.y - size * 1.45, size * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function treeAt(s: ParkState, x: number, y: number): boolean {
  const t = s.grid[y * s.gridW + x];
  if (t.kind !== 'grass' || t.rideId !== null) return false;
  const nearBorder = x < 2 || y < 2 || x >= s.gridW - 2 || y >= s.gridH - 2;
  const p = nearBorder ? 0.30 : 0.035;
  return hash2(x, y) < p;
}

function drawFenceSegment(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number): void {
  const a = tileToWorld(ax, ay);
  const b = tileToWorld(bx, by);
  const postH = 7;
  ctx.strokeStyle = '#e8e0cc';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(a.x, a.y - postH);
  ctx.stroke();
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - postH + 1.5); ctx.lineTo(b.x, b.y - postH + 1.5);
  ctx.moveTo(a.x, a.y - postH + 4.5); ctx.lineTo(b.x, b.y - postH + 4.5);
  ctx.stroke();
}

function drawEntranceGate(ctx: CanvasRenderingContext2D, ex: number, ey: number): void {
  box(ctx, ex - 0.02, ey + 0.55, 0.3, 0.45, 0, 1.6, '#b8b2a4');
  box(ctx, ex + 0.72, ey + 0.55, 0.3, 0.45, 0, 1.6, '#b8b2a4');
  const l = tileToWorld(ex + 0.13, ey + 0.78, 1.6);
  const r = tileToWorld(ex + 0.88, ey + 0.78, 1.6);
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(l.x, l.y - 8);
  ctx.lineTo(r.x, r.y - 8);
  ctx.lineTo(r.x, r.y + 2);
  ctx.lineTo(l.x, l.y + 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7e241a';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 6px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ENTRANCE', (l.x + r.x) / 2, (l.y + r.y) / 2 - 1.5);
}

// ------------------------------------------------------------ flat rides ---

function drawCarousel(ctx: CanvasRenderingContext2D, r: Ride, tick: number): void {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const c0 = tileToWorld(cx, cy, 0);
  shadow(ctx, c0.x, c0.y, 26, 13);
  ctx.fillStyle = '#8a6d4a';
  ctx.beginPath();
  ctx.ellipse(c0.x, c0.y - 3, 24, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5d4a32';
  ctx.lineWidth = 1;
  ctx.stroke();
  const spin = r.state === 'running' ? tick * 0.09 : 0;
  const colors = ['#e74c3c', '#f1c40f', '#3498db', '#ffffff', '#9b59b6', '#2ecc71'];
  const roofY = c0.y - 30;
  for (let i = 0; i < 6; i++) {
    const a = spin + (i / 6) * Math.PI * 2;
    const hx = c0.x + Math.cos(a) * 18;
    const hy = c0.y - 4 + Math.sin(a) * 9;
    ctx.strokeStyle = '#d9c87f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx, roofY + 8);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    const bob = r.state === 'running' ? Math.sin(a * 3 + tick * 0.2) * 1.5 : 0;
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.ellipse(hx, hy - 4 + bob, 3.4, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(hx + 1.5, hy - 8 + bob, 2, 3.4);
  }
  ctx.strokeStyle = '#a8893f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(c0.x, c0.y - 3);
  ctx.lineTo(c0.x, roofY - 6);
  ctx.stroke();
  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    const a0 = (i / stripes) * Math.PI * 2;
    const a1 = ((i + 1) / stripes) * Math.PI * 2;
    ctx.fillStyle = i % 2 === 0 ? '#e8504f' : '#fdf2e3';
    ctx.beginPath();
    ctx.moveTo(c0.x, roofY - 14);
    ctx.lineTo(c0.x + Math.cos(a0) * 26, roofY + 8 + Math.sin(a0) * 11 * 0.45);
    ctx.lineTo(c0.x + Math.cos(a1) * 26, roofY + 8 + Math.sin(a1) * 11 * 0.45);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#f6d34c';
  ctx.beginPath();
  ctx.arc(c0.x, roofY - 15, 2.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawFerris(ctx: CanvasRenderingContext2D, r: Ride, tick: number): void {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const base = tileToWorld(cx, cy, 0);
  shadow(ctx, base.x, base.y, 30, 12);
  const hub = { x: base.x, y: base.y - 52 };
  const R = 38;
  ctx.strokeStyle = '#7a8aa0';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(base.x - 16, base.y);
  ctx.lineTo(hub.x, hub.y);
  ctx.lineTo(base.x + 16, base.y);
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(base.x - 9, base.y - 24);
  ctx.lineTo(base.x + 9, base.y - 24);
  ctx.stroke();
  const spin = r.state === 'running' ? tick * 0.022 : 0;
  ctx.strokeStyle = '#c8d4e4';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(hub.x, hub.y, R, R * 0.92, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const a = spin + (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(hub.x, hub.y);
    ctx.lineTo(hub.x + Math.cos(a) * R, hub.y + Math.sin(a) * R * 0.92);
    ctx.stroke();
  }
  const cols = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#e67e22', '#9b59b6', '#1abc9c', '#fd79a8'];
  for (let i = 0; i < 8; i++) {
    const a = spin + (i / 8) * Math.PI * 2;
    const gx = hub.x + Math.cos(a) * R;
    const gy = hub.y + Math.sin(a) * R * 0.92;
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, gy + 4);
    ctx.stroke();
    ctx.fillStyle = cols[i];
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.roundRect(gx - 3.5, gy + 4, 7, 5.5, 1.5);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#f6d34c';
  ctx.beginPath();
  ctx.arc(hub.x, hub.y, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawBumper(ctx: CanvasRenderingContext2D, r: Ride, tick: number): void {
  diamond(ctx, r.x + 0.08, r.y + 0.08, r.w - 0.16, r.h - 0.16, 0.12);
  ctx.fillStyle = '#3d4351';
  ctx.fill();
  const wall = '#aa3d3d';
  box(ctx, r.x, r.y, r.w, 0.14, 0, 0.35, wall);
  box(ctx, r.x, r.y + r.h - 0.14, r.w, 0.14, 0, 0.35, wall);
  box(ctx, r.x, r.y, 0.14, r.h, 0, 0.35, wall);
  box(ctx, r.x + r.w - 0.14, r.y, 0.14, r.h, 0, 0.35, wall);
  const posts = [
    [r.x + 0.1, r.y + 0.1], [r.x + r.w - 0.1, r.y + 0.1],
    [r.x + r.w - 0.1, r.y + r.h - 0.1], [r.x + 0.1, r.y + r.h - 0.1],
  ];
  const tops: { x: number; y: number }[] = [];
  for (const [px, py] of posts) {
    const b = tileToWorld(px, py, 0.35);
    const t = tileToWorld(px, py, 2.2);
    tops.push(t);
    ctx.strokeStyle = '#d8d2c0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(250,230,150,0.7)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = tops[i];
    const b = tops[(i + 1) % 4];
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 4, b.x, b.y);
  }
  ctx.stroke();
  const cols = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db'];
  for (let i = 0; i < 4; i++) {
    const t = r.state === 'running' ? tick * 0.05 : 0;
    const ox = 0.5 + 0.31 * Math.sin(t * (0.9 + i * 0.13) + i * 1.9);
    const oy = 0.5 + 0.31 * Math.cos(t * (0.7 + i * 0.11) + i * 0.8);
    const w = tileToWorld(r.x + ox * r.w, r.y + oy * r.h, 0.12);
    ctx.fillStyle = cols[i];
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(w.x, w.y - 2, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(w.x, w.y - 4, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDropTower(ctx: CanvasRenderingContext2D, r: Ride, tick: number): void {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const base = tileToWorld(cx, cy, 0);
  shadow(ctx, base.x, base.y, 16, 8);
  box(ctx, r.x + 0.2, r.y + 0.2, r.w - 0.4, r.h - 0.4, 0, 0.3, '#9aa3ad');
  const top = base.y - 92;
  ctx.strokeStyle = '#aab4c0';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(base.x - 5, base.y - 3); ctx.lineTo(base.x - 5, top);
  ctx.moveTo(base.x + 5, base.y - 3); ctx.lineTo(base.x + 5, top);
  ctx.stroke();
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let yy = base.y - 8; yy > top + 4; yy -= 8) {
    ctx.moveTo(base.x - 5, yy); ctx.lineTo(base.x + 5, yy - 8);
    ctx.moveTo(base.x + 5, yy); ctx.lineTo(base.x - 5, yy - 8);
  }
  ctx.stroke();
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(base.x - 7, top);
  ctx.lineTo(base.x + 7, top);
  ctx.lineTo(base.x, top - 8);
  ctx.closePath();
  ctx.fill();
  let phase = 0;
  if (r.state === 'running' && r.duration > 0) {
    const p = Math.min(1, r.stateTicks / r.duration);
    if (p < 0.55) phase = p / 0.55;
    else if (p < 0.65) phase = 1;
    else phase = Math.max(0, 1 - (p - 0.65) * 9) * (1 + 0.12 * Math.sin((p - 0.65) * 60));
  } else {
    phase = 0.02 + 0.02 * Math.sin(tick * 0.05);
  }
  const carY = base.y - 10 - phase * 74;
  ctx.fillStyle = '#d8b023';
  ctx.strokeStyle = '#8a6f12';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.roundRect(base.x - 10, carY - 4, 20, 7, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#333';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(base.x + i * 6, carY - 5.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSwingShip(ctx: CanvasRenderingContext2D, r: Ride, tick: number): void {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const base = tileToWorld(cx, cy, 0);
  shadow(ctx, base.x, base.y + 1, 28, 11);
  const pivot = { x: base.x, y: base.y - 46 };
  // A-frame legs (two pairs).
  ctx.strokeStyle = '#8d9aa8';
  ctx.lineWidth = 3;
  for (const off of [-12, 12]) {
    ctx.beginPath();
    ctx.moveTo(base.x + off - 9, base.y + off * 0.18);
    ctx.lineTo(pivot.x + off * 0.3, pivot.y);
    ctx.lineTo(base.x + off + 9, base.y + off * 0.18);
    ctx.stroke();
  }
  const swing = r.state === 'running' ? Math.sin(tick * 0.06) * 1.05 : Math.sin(tick * 0.015) * 0.04;
  const R = 36;
  const bx = pivot.x + Math.sin(swing) * R;
  const by = pivot.y + Math.cos(swing) * R;
  ctx.strokeStyle = '#6b5b45';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  ctx.lineTo(bx, by);
  ctx.stroke();
  // Hull.
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(swing);
  ctx.fillStyle = '#a3692c';
  ctx.strokeStyle = '#5d4226';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-20, -3);
  ctx.quadraticCurveTo(-23, -10, -17, -11);
  ctx.lineTo(17, -11);
  ctx.quadraticCurveTo(23, -10, 20, -3);
  ctx.quadraticCurveTo(0, 6, -20, -3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f0c8a0';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(i * 6.5, -11.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // Dragon figurehead.
  ctx.fillStyle = '#d8b023';
  ctx.beginPath();
  ctx.arc(21, -8, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#f6d34c';
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 2.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawTwist(ctx: CanvasRenderingContext2D, r: Ride, tick: number): void {
  const c = tileToWorld(r.x + r.w / 2, r.y + r.h / 2, 0);
  shadow(ctx, c.x, c.y, 22, 10);
  ctx.fillStyle = '#7a7d85';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 2, 21, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a4d55';
  ctx.lineWidth = 1;
  ctx.stroke();
  const spin = r.state === 'running' ? tick * 0.12 : 0;
  const carCols = ['#e74c3c', '#f1c40f', '#3498db'];
  ctx.strokeStyle = '#5d6068';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 2);
  ctx.lineTo(c.x, c.y - 14);
  ctx.stroke();
  for (let arm = 0; arm < 3; arm++) {
    const a = spin + (arm / 3) * Math.PI * 2;
    const ax = c.x + Math.cos(a) * 13;
    const ay = c.y - 6 + Math.sin(a) * 6.2;
    ctx.strokeStyle = '#9aa0a8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - 12);
    ctx.lineTo(ax, ay - 4);
    ctx.stroke();
    for (let k = 0; k < 2; k++) {
      const a2 = spin * 2.6 + k * Math.PI + arm;
      const gx = ax + Math.cos(a2) * 5.5;
      const gy = ay + Math.sin(a2) * 2.6;
      ctx.fillStyle = carCols[arm];
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.ellipse(gx, gy - 2, 3.4, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(gx, gy - 4, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawHaunted(ctx: CanvasRenderingContext2D, r: Ride, tick: number): void {
  const running = r.state === 'running';
  box(ctx, r.x + 0.12, r.y + 0.12, r.w - 0.24, r.h - 0.24, 0, 2.0, '#4a3a5a');
  // Gabled roof.
  const ra = tileToWorld(r.x + 0.05, r.y + r.h / 2, 2.0);
  const rb = tileToWorld(r.x + r.w - 0.05, r.y + r.h / 2, 2.0);
  const apexA = tileToWorld(r.x + 0.2, r.y + r.h / 2, 3.1);
  const apexB = tileToWorld(r.x + r.w - 0.2, r.y + r.h / 2, 3.1);
  const fa = tileToWorld(r.x + 0.12, r.y + r.h - 0.12, 2.0);
  const fb = tileToWorld(r.x + r.w - 0.12, r.y + r.h - 0.12, 2.0);
  ctx.fillStyle = '#2e2438';
  ctx.beginPath();
  ctx.moveTo(apexA.x, apexA.y); ctx.lineTo(apexB.x, apexB.y);
  ctx.lineTo(fb.x, fb.y); ctx.lineTo(fa.x, fa.y);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#1c1424';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = '#241c30';
  ctx.beginPath();
  ctx.moveTo(apexB.x, apexB.y); ctx.lineTo(rb.x, rb.y); ctx.lineTo(fb.x, fb.y);
  ctx.closePath(); ctx.fill();
  void ra;
  // Crooked chimney.
  const ch = tileToWorld(r.x + 0.55, r.y + r.h / 2, 3.0);
  ctx.fillStyle = '#3a2e48';
  ctx.fillRect(ch.x - 2, ch.y - 8, 4, 8);
  // Windows glow while running.
  const wcol = running && Math.floor(tick / 14) % 3 !== 0 ? '#ffd166' : '#1c1424';
  const win1 = tileToWorld(r.x + 0.55, r.y + r.h - 0.1, 1.3);
  const win2 = tileToWorld(r.x + r.w - 0.55, r.y + r.h - 0.1, 1.3);
  ctx.fillStyle = wcol;
  ctx.fillRect(win1.x - 2.5, win1.y - 3, 5, 6);
  ctx.fillRect(win2.x - 2.5, win2.y - 3, 5, 6);
  // Door.
  const door = tileToWorld(r.x + r.w / 2, r.y + r.h - 0.08, 0.65);
  ctx.fillStyle = '#1c1424';
  ctx.beginPath();
  ctx.arc(door.x, door.y - 4, 3.4, Math.PI, 0);
  ctx.rect(door.x - 3.4, door.y - 4, 6.8, 5);
  ctx.fill();
  // Circling bat.
  if (running) {
    const a = tick * 0.08;
    const bx = tileToWorld(r.x + r.w / 2, r.y + r.h / 2, 3.4);
    const px = bx.x + Math.cos(a) * 18;
    const py = bx.y - 6 + Math.sin(a * 1.7) * 5;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.4;
    const flap = Math.sin(tick * 0.5) * 2;
    ctx.beginPath();
    ctx.moveTo(px - 4, py - flap);
    ctx.quadraticCurveTo(px - 2, py + 2, px, py);
    ctx.quadraticCurveTo(px + 2, py + 2, px + 4, py - flap);
    ctx.stroke();
  }
}

function drawSpiralSlide(ctx: CanvasRenderingContext2D, r: Ride, tick: number): void {
  const c = tileToWorld(r.x + r.w / 2, r.y + r.h / 2, 0);
  shadow(ctx, c.x, c.y, 18, 8);
  // Tower.
  box(ctx, r.x + 0.55, r.y + 0.55, 0.9, 0.9, 0, 3.6, '#e8dcc0');
  const capC = tileToWorld(r.x + 1, r.y + 1, 3.6);
  ctx.fillStyle = '#e2503c';
  ctx.beginPath();
  ctx.moveTo(capC.x - 13, capC.y + 2);
  ctx.lineTo(capC.x + 13, capC.y + 2);
  ctx.lineTo(capC.x, capC.y - 12);
  ctx.closePath();
  ctx.fill();
  // Helical slide ribbon.
  ctx.strokeStyle = '#e2a13c';
  ctx.lineWidth = 4.5;
  for (let k = 0; k < 3; k++) {
    const z = 2.8 - k * 1.05;
    const w0 = tileToWorld(r.x + 1, r.y + 1, z);
    ctx.beginPath();
    ctx.ellipse(w0.x, w0.y, 14 + k * 2.5, 7 + k * 1.4, 0, (k * 0.9) % (Math.PI * 2), ((k * 0.9) + 4.2) % (Math.PI * 2 + 4.2));
    ctx.stroke();
  }
  // Run-out mat.
  const mat = tileToWorld(r.x + 1.45, r.y + 1.7, 0);
  ctx.fillStyle = '#e2a13c';
  ctx.beginPath();
  ctx.ellipse(mat.x, mat.y, 8, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Sliding guest.
  if (r.state === 'running') {
    const p = (tick % 60) / 60;
    const z = 2.8 - p * 2.6;
    const a = p * Math.PI * 4;
    const w0 = tileToWorld(r.x + 1, r.y + 1, z);
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(w0.x + Math.cos(a) * 14, w0.y + Math.sin(a) * 7, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawObsTower(ctx: CanvasRenderingContext2D, r: Ride, tick: number): void {
  const c = tileToWorld(r.x + r.w / 2, r.y + r.h / 2, 0);
  shadow(ctx, c.x, c.y, 15, 7);
  box(ctx, r.x + 0.25, r.y + 0.25, r.w - 0.5, r.h - 0.5, 0, 0.3, '#9aa3ad');
  const top = c.y - 112;
  ctx.strokeStyle = '#b8c2cc';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 2);
  ctx.lineTo(c.x, top);
  ctx.stroke();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = '#8d9aa8';
  ctx.beginPath();
  for (let yy = c.y - 10; yy > top + 6; yy -= 9) {
    ctx.moveTo(c.x - 3.5, yy);
    ctx.lineTo(c.x + 3.5, yy - 4);
    ctx.moveTo(c.x + 3.5, yy);
    ctx.lineTo(c.x - 3.5, yy - 4);
  }
  ctx.stroke();
  ctx.fillStyle = '#e2503c';
  ctx.beginPath();
  ctx.arc(c.x, top - 2, 3, 0, Math.PI * 2);
  ctx.fill();
  // Rotating observation cabin rises and falls.
  let ph = 0.06;
  if (r.state === 'running' && r.duration > 0) {
    const p = Math.min(1, r.stateTicks / r.duration);
    ph = p < 0.4 ? p / 0.4 : p < 0.6 ? 1 : Math.max(0, 1 - (p - 0.6) / 0.4);
  }
  const cabY = c.y - 14 - ph * 86;
  ctx.fillStyle = '#d8d2c0';
  ctx.strokeStyle = '#8a8474';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(c.x, cabY, 13, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4a90c8';
  const winSpin = r.state === 'running' ? tick * 0.04 : 0;
  for (let i = 0; i < 6; i++) {
    const a = winSpin + (i / 6) * Math.PI * 2;
    ctx.fillRect(c.x + Math.cos(a) * 10 - 1.6, cabY + Math.sin(a) * 4.6 - 1.6, 3.2, 3.2);
  }
}

function drawSpaceRings(ctx: CanvasRenderingContext2D, r: Ride, tick: number): void {
  const c = tileToWorld(r.x + r.w / 2, r.y + r.h / 2, 0);
  shadow(ctx, c.x, c.y, 18, 8);
  ctx.fillStyle = '#7a7d85';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 2, 18, 8.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const t = r.state === 'running' ? tick * 0.07 : 0;
  const cy0 = c.y - 18;
  const ringCols = ['#3aa0a8', '#48b8c0', '#2a8890'];
  for (let i = 0; i < 3; i++) {
    const rot = t * (i % 2 === 0 ? 1 : -1) + i * 1.1;
    ctx.strokeStyle = ringCols[i];
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(c.x, cy0, 14, 14 * Math.abs(Math.sin(rot)) + 2, (i * Math.PI) / 3 + Math.sin(t * 0.5) * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Rider in the middle.
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.arc(c.x, cy0 - 2, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(c.x - 1.8, cy0, 3.6, 4.5);
}

function drawSimulator(ctx: CanvasRenderingContext2D, r: Ride, tick: number): void {
  const c = tileToWorld(r.x + r.w / 2, r.y + r.h / 2, 0);
  shadow(ctx, c.x, c.y, 17, 8);
  box(ctx, r.x + 0.2, r.y + 0.2, r.w - 0.4, r.h - 0.4, 0, 0.35, '#7a7d85');
  const tilt = r.state === 'running' ? Math.sin(tick * 0.13) * 0.18 : 0;
  const lift = r.state === 'running' ? Math.abs(Math.cos(tick * 0.09)) * 3 : 0;
  const py = c.y - 16 - lift;
  // Hydraulic legs.
  ctx.strokeStyle = '#aab4c0';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(c.x - 8, c.y - 4);
  ctx.lineTo(c.x - 6 + tilt * 16, py + 5);
  ctx.moveTo(c.x + 8, c.y - 4);
  ctx.lineTo(c.x + 6 + tilt * 16, py + 5);
  ctx.stroke();
  // Capsule.
  ctx.save();
  ctx.translate(c.x + tilt * 10, py);
  ctx.rotate(tilt);
  ctx.fillStyle = '#4a69bd';
  ctx.strokeStyle = '#2a3a6d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-13, -9, 26, 15, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#bcd4ff';
  ctx.fillRect(-9, -6, 8, 5);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 6px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SIM', 5, 0);
  ctx.restore();
}

function drawGoKarts(ctx: CanvasRenderingContext2D, r: Ride, tick: number): void {
  // Asphalt ring.
  diamond(ctx, r.x + 0.15, r.y + 0.15, r.w - 0.3, r.h - 0.3, 0.04);
  ctx.fillStyle = '#5a5d63';
  ctx.fill();
  diamond(ctx, r.x + 1.1, r.y + 1.0, r.w - 2.2, r.h - 2.0, 0.05);
  ctx.fillStyle = (Math.floor(r.x + r.y)) % 2 === 0 ? GRASS_A : GRASS_B;
  ctx.fill();
  // Tyre wall dots.
  ctx.fillStyle = '#222';
  for (let i = 0; i < 14; i++) {
    const t = i / 14;
    const per = perimeterPoint(r.x + 0.3, r.y + 0.3, r.w - 0.6, r.h - 0.6, t);
    const w = tileToWorld(per.x, per.y, 0.06);
    ctx.beginPath();
    ctx.arc(w.x, w.y, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Start line + flag.
  const sl0 = tileToWorld(r.x + 0.5, r.y + 0.62, 0.06);
  const sl1 = tileToWorld(r.x + 1.05, r.y + 0.92, 0.06);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(sl0.x, sl0.y);
  ctx.lineTo(sl1.x, sl1.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // Karts chase each other around the ring.
  const cols = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db'];
  for (let i = 0; i < 4; i++) {
    const speed = r.state === 'running' ? 0.0035 * (0.92 + i * 0.045) : 0;
    const t = (tick * speed + i * 0.22) % 1;
    const p0 = perimeterPoint(r.x + 0.62, r.y + 0.58, r.w - 1.3, r.h - 1.2, t);
    const p1 = perimeterPoint(r.x + 0.62, r.y + 0.58, r.w - 1.3, r.h - 1.2, (t + 0.01) % 1);
    const w0 = tileToWorld(p0.x, p0.y, 0.06);
    const w1 = tileToWorld(p1.x, p1.y, 0.06);
    const ang = Math.atan2(w1.y - w0.y, w1.x - w0.x);
    ctx.save();
    ctx.translate(w0.x, w0.y - 1.5);
    ctx.rotate(ang);
    ctx.fillStyle = cols[i];
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.roundRect(-4.2, -2.2, 8.4, 4.4, 1.6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-0.5, 0, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Walks the perimeter of a rect (tile coords), t in [0,1) → point.
function perimeterPoint(x: number, y: number, w: number, h: number, t: number): { x: number; y: number } {
  const per = 2 * (w + h);
  let d = t * per;
  if (d < w) return { x: x + d, y };
  d -= w;
  if (d < h) return { x: x + w, y: y + d };
  d -= h;
  if (d < w) return { x: x + w - d, y: y + h };
  d -= w;
  return { x, y: y + h - d };
}

const STALL_STRIPES: Record<string, string> = {
  foodstall: '#e8504f',
  friesstall: '#e8a83c',
  icecream: '#e87daa',
  candyfloss: '#b25dd8',
  drinkstall: '#2980b9',
  balloonstall: '#e84d6f',
};

const STALL_ICONS: Record<string, string> = {
  foodstall: '🍔',
  friesstall: '🍟',
  icecream: '🍦',
  candyfloss: '🍭',
  drinkstall: '🥤',
  balloonstall: '🎈',
};

function drawStall(ctx: CanvasRenderingContext2D, r: Ride, def: RideTypeDef, tick: number): void {
  const main = def.color;
  const c = tileToWorld(r.x + 0.5, r.y + 0.5, 0);
  shadow(ctx, c.x, c.y + 1, 16, 8);
  box(ctx, r.x + 0.12, r.y + 0.12, 0.76, 0.76, 0, 0.85, main);
  const apexL = tileToWorld(r.x + 0.5, r.y + 0.05, 1.45);
  const apexR = tileToWorld(r.x + 0.95, r.y + 0.5, 1.45);
  const eaveA = tileToWorld(r.x - 0.05, r.y + 0.5, 0.92);
  const eaveB = tileToWorld(r.x + 0.5, r.y + 1.05, 0.92);
  const eaveC = tileToWorld(r.x + 1.05, r.y + 0.5, 0.92);
  const stripeA = STALL_STRIPES[def.id] ?? '#e8504f';
  ctx.fillStyle = stripeA;
  ctx.beginPath();
  ctx.moveTo(apexL.x, apexL.y); ctx.lineTo(apexR.x, apexR.y);
  ctx.lineTo(eaveB.x, eaveB.y); ctx.lineTo(eaveA.x, eaveA.y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fdf2e3';
  for (let i = 0; i < 3; i++) {
    const t0 = 0.15 + i * 0.3;
    const t1 = t0 + 0.15;
    ctx.beginPath();
    ctx.moveTo(apexL.x + (apexR.x - apexL.x) * t0, apexL.y + (apexR.y - apexL.y) * t0);
    ctx.lineTo(apexL.x + (apexR.x - apexL.x) * t1, apexL.y + (apexR.y - apexL.y) * t1);
    ctx.lineTo(eaveA.x + (eaveB.x - eaveA.x) * t1, eaveA.y + (eaveB.y - eaveA.y) * t1);
    ctx.lineTo(eaveA.x + (eaveB.x - eaveA.x) * t0, eaveA.y + (eaveB.y - eaveA.y) * t0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = shade(stripeA, 0.75);
  ctx.beginPath();
  ctx.moveTo(apexR.x, apexR.y); ctx.lineTo(eaveC.x, eaveC.y);
  ctx.lineTo(eaveB.x, eaveB.y);
  ctx.closePath(); ctx.fill();
  // Sign.
  const sign = tileToWorld(r.x + 0.5, r.y + 0.95, 0.62);
  ctx.fillStyle = '#fff8e8';
  ctx.beginPath();
  ctx.roundRect(sign.x - 6, sign.y - 6, 12, 10, 2);
  ctx.fill();
  ctx.strokeStyle = shade(main, 0.6);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.font = '7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(STALL_ICONS[def.id] ?? '🍔', sign.x, sign.y + 2);
  // Balloon stalls fly a bunch of wares.
  if (def.id === 'balloonstall') {
    const top = tileToWorld(r.x + 0.5, r.y + 0.3, 1.5);
    const cols = ['#e84d6f', '#f2d653', '#4da8e8', '#6fdd6f'];
    for (let i = 0; i < 4; i++) {
      const bx = top.x + Math.sin(tick * 0.03 + i * 1.8) * 2 + (i - 1.5) * 5;
      const by = top.y - 6 - (i % 2) * 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(top.x + (i - 1.5) * 2, top.y + 4);
      ctx.lineTo(bx, by + 3);
      ctx.stroke();
      ctx.fillStyle = cols[i];
      ctx.beginPath();
      ctx.ellipse(bx, by, 2.6, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawToilets(ctx: CanvasRenderingContext2D, r: Ride): void {
  const c = tileToWorld(r.x + 0.5, r.y + 0.5, 0);
  shadow(ctx, c.x, c.y + 1, 15, 7);
  box(ctx, r.x + 0.1, r.y + 0.1, 0.8, 0.8, 0, 1.0, '#88a8b8');
  box(ctx, r.x + 0.05, r.y + 0.05, 0.9, 0.9, 1.0, 1.12, '#5d7a88');
  const sign = tileToWorld(r.x + 0.5, r.y + 0.95, 0.6);
  ctx.fillStyle = '#2456a8';
  ctx.beginPath();
  ctx.roundRect(sign.x - 5.5, sign.y - 5.5, 11, 9, 1.5);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 6px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('WC', sign.x, sign.y + 1);
  const door = tileToWorld(r.x + 0.92, r.y + 0.5, 0.5);
  ctx.fillStyle = '#3d5660';
  ctx.fillRect(door.x - 2, door.y - 5, 4, 8);
}

// ---------------------------------------------------------------- coaster ---

interface TrackPalette {
  rail: string;
  tie: string;
  support: string;
  railWidth: number;
}

const TRACK_PALETTES: Record<string, TrackPalette> = {
  'coaster-wooden': { rail: '#d8b878', tie: '#5d4226', support: '#7a5a36', railWidth: 1.5 },
  'coaster-mini': { rail: '#2ed88a', tie: '#3d4351', support: '#9aa3ad', railWidth: 1.8 },
  'coaster-twister': { rail: '#f03830', tie: '#6a7682', support: '#8d9aa8', railWidth: 2.3 },
};

function palette(typeId: string): TrackPalette {
  return TRACK_PALETTES[typeId] ?? TRACK_PALETTES['coaster-twister'];
}

function samplePiece(p: TrackPiece, n = 8): { x: number; y: number }[] {
  const cx = p.x + 0.5;
  const cy = p.y + 0.5;
  const ex = cx - DIRV[p.dirIn].x * 0.5;
  const ey = cy - DIRV[p.dirIn].y * 0.5;
  const xx = cx + DIRV[p.dirOut].x * 0.5;
  const xy = cy + DIRV[p.dirOut].y * 0.5;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const bx = mt * mt * ex + 2 * mt * t * cx + t * t * xx;
    const by = mt * mt * ey + 2 * mt * t * cy + t * t * xy;
    const z = p.zIn + (p.zOut - p.zIn) * t;
    pts.push(tileToWorld(bx, by, z));
  }
  return pts;
}

function drawSupports(ctx: CanvasRenderingContext2D, p: TrackPiece, pal: TrackPalette): void {
  const zMid = (p.zIn + p.zOut) / 2;
  if (zMid <= 0.05) return;
  const topC = tileToWorld(p.x + 0.5, p.y + 0.5, zMid);
  const gL = tileToWorld(p.x + 0.38, p.y + 0.62, 0);
  const gR = tileToWorld(p.x + 0.62, p.y + 0.38, 0);
  ctx.strokeStyle = pal.support;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(topC.x - 3, topC.y + 1); ctx.lineTo(gL.x, gL.y);
  ctx.moveTo(topC.x + 3, topC.y + 1); ctx.lineTo(gR.x, gR.y);
  ctx.stroke();
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  const segs = Math.max(1, Math.round(zMid));
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const l0 = { x: topC.x - 3 + (gL.x - topC.x + 3) * t0, y: topC.y + 1 + (gL.y - topC.y - 1) * t0 };
    const r0 = { x: topC.x + 3 + (gR.x - topC.x - 3) * t0, y: topC.y + 1 + (gR.y - topC.y - 1) * t0 };
    const l1 = { x: topC.x - 3 + (gL.x - topC.x + 3) * t1, y: topC.y + 1 + (gL.y - topC.y - 1) * t1 };
    const r1 = { x: topC.x + 3 + (gR.x - topC.x - 3) * t1, y: topC.y + 1 + (gR.y - topC.y - 1) * t1 };
    ctx.moveTo(l0.x, l0.y); ctx.lineTo(r1.x, r1.y);
    ctx.moveTo(r0.x, r0.y); ctx.lineTo(l1.x, l1.y);
  }
  ctx.stroke();
}

function travelScreenUnit(p: TrackPiece): { x: number; y: number } {
  const a = tileToWorld(p.x + 0.5 - DIRV[p.dirIn].x * 0.5, p.y + 0.5 - DIRV[p.dirIn].y * 0.5, 0);
  const b = tileToWorld(p.x + 0.5 + DIRV[p.dirOut].x * 0.5, p.y + 0.5 + DIRV[p.dirOut].y * 0.5, 0);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function drawLoop(ctx: CanvasRenderingContext2D, p: TrackPiece, pal: TrackPalette): void {
  const mid = tileToWorld(p.x + 0.5, p.y + 0.5, p.zIn);
  const u = travelScreenUnit(p);
  const R = 21;
  const center = { x: mid.x, y: mid.y - R };
  const ring = (radius: number, color: string, width: number): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i <= 26; i++) {
      const th = (i / 26) * Math.PI * 2;
      const px = center.x + radius * Math.cos(th) * u.x;
      const py = center.y + radius * Math.cos(th) * u.y - radius * Math.sin(th);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };
  // Cross-spokes for the loop structure.
  ctx.strokeStyle = pal.support;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const th = (i / 8) * Math.PI * 2;
    const px = center.x + R * Math.cos(th) * u.x;
    const py = center.y + R * Math.cos(th) * u.y - R * Math.sin(th);
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(px, py);
  }
  ctx.stroke();
  ring(R, '#42301f', 5);
  ring(R, pal.rail, 2.2);
}

function drawCorkscrew(ctx: CanvasRenderingContext2D, p: TrackPiece, pal: TrackPalette, leftHanded: boolean): void {
  const pts = samplePiece(p, 22);
  const u = travelScreenUnit(p);
  const perp = { x: -u.y, y: u.x };
  const sgn = leftHanded ? 1 : -1;
  ctx.strokeStyle = '#42301f';
  ctx.lineWidth = 4.5;
  for (const pass of [0, 1]) {
    if (pass === 1) {
      ctx.strokeStyle = pal.rail;
      ctx.lineWidth = 2;
    }
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const t = i / (pts.length - 1);
      const a = t * Math.PI * 3;
      const lift = 7 + Math.sin(a) * 7;
      const side = Math.cos(a) * 7 * sgn;
      const px = pts[i].x + perp.x * side;
      const py = pts[i].y - lift + perp.y * side;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

function drawTrackPiece(ctx: CanvasRenderingContext2D, p: TrackPiece, typeId: string, alpha = 1): void {
  const pal = palette(typeId);
  ctx.globalAlpha = alpha;
  drawSupports(ctx, p, pal);

  if (p.special === 'station') {
    box(ctx, p.x + 0.05, p.y + 0.05, 0.9, 0.9, 0, 0.3, '#a89a84');
    const off = DIRV[p.dirIn].x !== 0 ? { x: 0, y: 1 } : { x: 1, y: 0 };
    box(ctx, p.x + 0.1, p.y + 0.1, 0.12, 0.12, 0.3, 1.4, '#6b5b45');
    box(ctx, p.x + 0.1 + off.x * 0.68, p.y + 0.1 + off.y * 0.68, 0.12, 0.12, 0.3, 1.4, '#6b5b45');
    box(ctx, p.x, p.y, 1, 1, 1.4, 1.55, shade(pal.rail, 0.85));
  }

  const pts = samplePiece(p);
  // Crossties (wood coasters get a denser plank bed).
  const tieStep = typeId === 'coaster-wooden' ? 1 : 2;
  ctx.strokeStyle = pal.tie;
  ctx.lineWidth = typeId === 'coaster-wooden' ? 1.7 : 1.2;
  ctx.beginPath();
  for (let i = 1; i < pts.length; i += tieStep) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 4;
    const ny = (dx / len) * 4;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ctx.moveTo(mx - nx, my - ny);
    ctx.lineTo(mx + nx, my + ny);
  }
  ctx.stroke();
  // Twin rails; banking raises the outer rail and drops the inner one.
  for (const side of [-1, 1]) {
    const bankLift = p.bank !== 0 ? -p.bank * side * 2.4 : 0;
    ctx.strokeStyle = pal.rail;
    ctx.lineWidth = pal.railWidth;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * 2.6 * side;
      const ny = (dx / len) * 2.6 * side;
      if (i === 0) ctx.moveTo(pts[i].x + nx, pts[i].y + ny + bankLift);
      else ctx.lineTo(pts[i].x + nx, pts[i].y + ny + bankLift);
    }
    ctx.stroke();
  }
  // Chain lift dashes along the centreline.
  if (p.chain) {
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([2.5, 2.5]);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Brake run: yellow friction pads.
  if (p.special === 'brakes') {
    ctx.strokeStyle = '#e8c83c';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    const a = pts[2];
    const b = pts[pts.length - 3];
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  if (p.special === 'loop') drawLoop(ctx, p, pal);
  if (p.special === 'corkscrewL') drawCorkscrew(ctx, p, pal, true);
  if (p.special === 'corkscrewR') drawCorkscrew(ctx, p, pal, false);
  ctx.globalAlpha = 1;
}

function trainPointAt(track: TrackPiece[], pos: number): { x: number; y: number; ang: number } {
  const n = track.length;
  let p = pos % n;
  if (p < 0) p += n;
  const i = Math.floor(p);
  const t = p - i;
  const pts = samplePiece(track[i]);
  const f = t * (pts.length - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(pts.length - 1, i0 + 1);
  const u = f - i0;
  const x = pts[i0].x + (pts[i1].x - pts[i0].x) * u;
  const y = pts[i0].y + (pts[i1].y - pts[i0].y) * u;
  const a0 = pts[Math.max(0, i0 - 1)];
  const a1 = pts[Math.min(pts.length - 1, i1 + 1)];
  return { x, y, ang: Math.atan2(a1.y - a0.y, a1.x - a0.x) };
}

const TRAIN_COLORS: Record<string, { body: string; front: string }> = {
  'coaster-wooden': { body: '#7a4a2a', front: '#5d3820' },
  'coaster-mini': { body: '#2e9c6a', front: '#1f7a50' },
  'coaster-twister': { body: '#b03434', front: '#d8b023' },
};

function drawTrain(ctx: CanvasRenderingContext2D, ride: Ride): void {
  const track = ride.track!;
  const pos = ride.state === 'running' ? (ride.trainPos ?? 0) : 0.25;
  const occupied = ride.onBoard.length > 0;
  const colors = TRAIN_COLORS[ride.typeId] ?? TRAIN_COLORS['coaster-twister'];
  const cars = Math.max(2, ride.cars || 4);
  for (let c = cars - 1; c >= 0; c--) {
    const pt = trainPointAt(track, Math.max(0.01, pos - c * 0.36));
    ctx.save();
    ctx.translate(pt.x, pt.y - 3);
    ctx.rotate(pt.ang);
    ctx.fillStyle = c === 0 ? colors.front : colors.body;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(-6, -3.2, 12, 6.4, 2.4);
    ctx.fill();
    ctx.stroke();
    if (c === 0) {
      ctx.fillStyle = shade(colors.front, 0.7);
      ctx.beginPath();
      ctx.roundRect(4.4, -2.2, 3, 4.4, 1.4);
      ctx.fill();
    }
    if (occupied) {
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath();
      ctx.arc(-2.4, -3.4, 1.5, 0, Math.PI * 2);
      ctx.arc(1.8, -3.4, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------ peeps ---

function drawPerson(
  ctx: CanvasRenderingContext2D, wx: number, wy: number,
  shirt: string, trousers: string, tick: number, id: number, walking: boolean,
): void {
  shadow(ctx, wx, wy + 0.5, 3.2, 1.5);
  const phase = walking ? Math.sin(tick * 0.55 + id * 1.7) : 0;
  const bob = walking ? Math.abs(Math.cos(tick * 0.55 + id * 1.7)) * 0.8 : 0;
  ctx.strokeStyle = trousers;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(wx - 1, wy - 3);
  ctx.lineTo(wx - 1 + phase * 1.4, wy);
  ctx.moveTo(wx + 1, wy - 3);
  ctx.lineTo(wx + 1 - phase * 1.4, wy);
  ctx.stroke();
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.roundRect(wx - 2.1, wy - 7.5 - bob, 4.2, 5, 1.6);
  ctx.fill();
  const skins = ['#f0c8a0', '#d9a06b', '#a8744a', '#f5d6b8'];
  ctx.fillStyle = skins[id % skins.length];
  ctx.beginPath();
  ctx.arc(wx, wy - 9.6 - bob, 2.1, 0, Math.PI * 2);
  ctx.fill();
  if (id % 3 === 0) {
    ctx.strokeStyle = trousers;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(wx, wy - 10 - bob, 2.1, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGuest(ctx: CanvasRenderingContext2D, g: Guest, tick: number, queueIdx: number): void {
  let ox = 0;
  let oy = 0;
  if (g.state === 'queuing') {
    ox = (((g.id * 7) % 5) - 2) * 0.09;
    oy = (queueIdx % 4) * 0.12 - 0.18;
  }
  const w = tileToWorld(g.x + 0.5 + ox, g.y + 0.5 + oy, 0);
  const walking = g.state === 'walking' && g.path.length > 0;
  const trousers = ['#2c3e50', '#5d4037', '#34495e', '#6d4c41'][g.id % 4];
  drawPerson(ctx, w.x, w.y, g.color, trousers, tick, g.id, walking);
  if (g.balloon) {
    const sway = Math.sin(tick * 0.05 + g.id) * 1.6;
    const bx = w.x + 3 + sway;
    const by = w.y - 17;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(w.x + 2.4, w.y - 6);
    ctx.lineTo(bx, by + 3.4);
    ctx.stroke();
    ctx.fillStyle = g.balloon;
    ctx.beginPath();
    ctx.ellipse(bx, by, 2.6, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(bx - 0.9, by - 1, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  if (g.nausea > 70) {
    ctx.fillStyle = 'rgba(120,180,80,0.8)';
    ctx.fillRect(w.x - 1, w.y - 12.5, 2, 1.4);
  }
}

function drawStaffMember(ctx: CanvasRenderingContext2D, st: Staff, tick: number): void {
  const w = tileToWorld(st.x + 0.5, st.y + 0.5, 0);
  const walking = st.path.length > 0;
  drawPerson(ctx, w.x, w.y, st.color, '#1f2a36', tick, st.id, walking);
  if (st.role === 'handyman') {
    const sweep = st.task === 'sweeping' ? Math.sin(tick * 0.4) * 2 : 0;
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w.x + 2.6, w.y - 7);
    ctx.lineTo(w.x + 4.4 + sweep, w.y + 0.5);
    ctx.stroke();
    ctx.strokeStyle = '#d9c87f';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(w.x + 4.4 + sweep, w.y + 0.2);
    ctx.lineTo(w.x + 4.9 + sweep, w.y + 1.6);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(w.x + 2.6, w.y - 3.4, 3.6, 2.4);
    ctx.strokeStyle = '#7e241a';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(w.x + 2.6, w.y - 3.4, 3.6, 2.4);
  }
}

// ------------------------------------------------------------------ scene ---

interface DrawItem {
  depth: number;
  draw: () => void;
}

function brokenMarker(ctx: CanvasRenderingContext2D, wx: number, wy: number): void {
  ctx.fillStyle = '#ffdd2e';
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(wx, wy - 12);
  ctx.lineTo(wx + 7, wy);
  ctx.lineTo(wx - 7, wy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3a3a3a';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('!', wx, wy - 2.5);
}

function drawFlatRide(ctx: CanvasRenderingContext2D, r: Ride, def: RideTypeDef, tick: number): void {
  switch (def.id) {
    case 'carousel': drawCarousel(ctx, r, tick); break;
    case 'ferris': drawFerris(ctx, r, tick); break;
    case 'bumper': drawBumper(ctx, r, tick); break;
    case 'droptower': drawDropTower(ctx, r, tick); break;
    case 'swingship': drawSwingShip(ctx, r, tick); break;
    case 'twist': drawTwist(ctx, r, tick); break;
    case 'haunted': drawHaunted(ctx, r, tick); break;
    case 'spiralslide': drawSpiralSlide(ctx, r, tick); break;
    case 'obstower': drawObsTower(ctx, r, tick); break;
    case 'spacerings': drawSpaceRings(ctx, r, tick); break;
    case 'simulator': drawSimulator(ctx, r, tick); break;
    case 'gokarts': drawGoKarts(ctx, r, tick); break;
    case 'toilets': drawToilets(ctx, r); break;
    default:
      if (def.kind === 'stall') drawStall(ctx, r, def, tick);
      else box(ctx, r.x, r.y, r.w, r.h, 0, def.height, def.color);
      break;
  }
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
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, '#9fc7dd');
  grad.addColorStop(0.6, '#c2dbc7');
  grad.addColorStop(1, '#a8c9a0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);
  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cam.x, cam.y);

  // Earth skirt under the park's south/east edges.
  const skirt = 8;
  const e1 = tileToWorld(s.gridW, 0);
  const e2 = tileToWorld(s.gridW, s.gridH);
  const e3 = tileToWorld(0, s.gridH);
  ctx.fillStyle = '#7a5f3e';
  ctx.beginPath();
  ctx.moveTo(e1.x, e1.y);
  ctx.lineTo(e2.x, e2.y);
  ctx.lineTo(e3.x, e3.y);
  ctx.lineTo(e3.x, e3.y + skirt);
  ctx.lineTo(e2.x, e2.y + skirt);
  ctx.lineTo(e1.x, e1.y + skirt);
  ctx.closePath();
  ctx.fill();

  for (let y = 0; y < s.gridH; y++) {
    for (let x = 0; x < s.gridW; x++) {
      const t = s.grid[y * s.gridW + x];
      if (t.kind === 'path' || t.kind === 'entrance') drawPathTile(ctx, s, x, y);
      else drawGrassTile(ctx, x, y);
      if (t.litter > 0) drawLitter(ctx, x, y, t.litter);
    }
  }

  const items: DrawItem[] = [];

  const ent = ((): { x: number; y: number } => {
    for (let y = 0; y < s.gridH; y++) {
      for (let x = 0; x < s.gridW; x++) {
        if (s.grid[y * s.gridW + x].kind === 'entrance') return { x, y };
      }
    }
    return { x: -1, y: -1 };
  })();
  for (let i = 0; i < s.gridW; i++) {
    const xi = i;
    items.push({ depth: xi - 0.6, draw: () => drawFenceSegment(ctx, xi, 0, xi + 1, 0) });
    if (!(xi === ent.x && ent.y === s.gridH - 1)) {
      items.push({ depth: xi + s.gridH - 0.4, draw: () => drawFenceSegment(ctx, xi, s.gridH, xi + 1, s.gridH) });
    }
  }
  for (let i = 0; i < s.gridH; i++) {
    const yi = i;
    items.push({ depth: yi - 0.6, draw: () => drawFenceSegment(ctx, 0, yi + 1, 0, yi) });
    items.push({ depth: s.gridW + yi - 0.4, draw: () => drawFenceSegment(ctx, s.gridW, yi + 1, s.gridW, yi) });
  }
  if (ent.x >= 0) {
    items.push({ depth: ent.x + ent.y + 1.2, draw: () => drawEntranceGate(ctx, ent.x, ent.y) });
  }

  for (let y = 0; y < s.gridH; y++) {
    for (let x = 0; x < s.gridW; x++) {
      if (treeAt(s, x, y)) {
        const tx = x;
        const ty = y;
        items.push({ depth: tx + ty + 0.5, draw: () => drawTree(ctx, tx, ty) });
      }
    }
  }

  for (const ride of Object.values(s.rides)) {
    if (ride.track) {
      for (const p of ride.track) {
        items.push({
          depth: p.x + p.y + 0.4 + Math.min(p.zIn, p.zOut) * 0.01,
          draw: () => drawTrackPiece(ctx, p, ride.typeId),
        });
      }
      const track = ride.track;
      const pos = ride.state === 'running' ? (ride.trainPos ?? 0) : 0.25;
      const headPiece = track[Math.floor(pos) % track.length];
      items.push({
        depth: headPiece.x + headPiece.y + 0.7,
        draw: () => drawTrain(ctx, ride),
      });
      if (ride.broken && Math.floor(s.tick / 10) % 2 === 0) {
        const st0 = track[0];
        items.push({
          depth: st0.x + st0.y + 1.5,
          draw: () => {
            const c = tileToWorld(st0.x + 0.5, st0.y + 0.5, 2.4);
            brokenMarker(ctx, c.x, c.y);
          },
        });
      }
    } else {
      const def = RIDE_TYPES[ride.typeId];
      const r = ride;
      items.push({
        depth: r.x + r.w - 1 + r.y + r.h - 1 + 0.5,
        draw: () => {
          drawFlatRide(ctx, r, def, s.tick);
          const c = tileToWorld(r.x + r.w / 2, r.y + r.h / 2, 0);
          if (r.broken && Math.floor(s.tick / 10) % 2 === 0) {
            brokenMarker(ctx, c.x, c.y - def.height * Z_PX - 16);
          }
          if (!r.open) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#a83232';
            ctx.lineWidth = 0.8;
            ctx.font = 'bold 7px sans-serif';
            ctx.textAlign = 'center';
            const label = 'CLOSED';
            const tw = ctx.measureText(label).width;
            ctx.fillRect(c.x - tw / 2 - 3, c.y - 6, tw + 6, 9);
            ctx.strokeRect(c.x - tw / 2 - 3, c.y - 6, tw + 6, 9);
            ctx.fillStyle = '#a83232';
            ctx.fillText(label, c.x, c.y + 0.5);
          }
        },
      });
    }
  }

  const queueIdx = new Map<number, number>();
  for (const ride of Object.values(s.rides)) {
    ride.queue.forEach((gid, i) => queueIdx.set(gid, i));
  }
  for (const g of Object.values(s.guests)) {
    if (g.state === 'riding') continue;
    items.push({
      depth: g.x + g.y + 0.6,
      draw: () => drawGuest(ctx, g, s.tick, queueIdx.get(g.id) ?? 0),
    });
  }

  for (const st of Object.values(s.staff)) {
    items.push({
      depth: st.x + st.y + 0.62,
      draw: () => drawStaffMember(ctx, st, s.tick),
    });
  }

  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.draw();

  // --- Overlay pass ---
  if (view.selectedRide !== null) {
    const r: Ride | undefined = s.rides[view.selectedRide];
    if (r) {
      diamond(ctx, r.x, r.y, r.w, r.h, 0);
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.lineDashOffset = -(s.tick % 16) / 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (view.builder) {
    for (const p of view.builder.pieces) drawTrackPiece(ctx, p, view.builder.typeId, 0.92);
    const h = view.builder.head;
    const from = tileToWorld(h.x + 0.5 - DIRV[h.dir].x * 0.3, h.y + 0.5 - DIRV[h.dir].y * 0.3, h.z);
    const to = tileToWorld(h.x + 0.5 + DIRV[h.dir].x * 0.35, h.y + 0.5 + DIRV[h.dir].y * 0.35, h.z);
    ctx.strokeStyle = '#ffe93e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.beginPath();
    ctx.moveTo(to.x + Math.cos(angle) * 5, to.y + Math.sin(angle) * 5);
    ctx.lineTo(to.x + Math.cos(angle + 2.5) * 5, to.y + Math.sin(angle + 2.5) * 5);
    ctx.lineTo(to.x + Math.cos(angle - 2.5) * 5, to.y + Math.sin(angle - 2.5) * 5);
    ctx.closePath();
    ctx.fillStyle = '#ffe93e';
    ctx.fill();
    diamond(ctx, h.x, h.y, 1, 1, 0);
    ctx.strokeStyle = '#ffe93e';
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
        diamond(ctx, hx, hy, def.w, def.h, 0);
        ctx.fillStyle = color;
        ctx.fill();
        box(ctx, hx, hy, def.w, def.h, 0, def.height, def.color, 0.4);
      }
    } else if (view.tool.startsWith('design:')) {
      const d = getDesign(view.tool.slice(7));
      if (d) {
        diamond(ctx, hx + d.bounds[0], hy + d.bounds[1], d.bounds[2] - d.bounds[0] + 1, d.bounds[3] - d.bounds[1] + 1, 0);
        ctx.fillStyle = color;
        ctx.fill();
      }
    } else if (view.tool === 'coaster' && view.builderPlacingStation) {
      diamond(ctx, hx, hy, 1, 1, 0);
      ctx.fillStyle = color;
      ctx.fill();
      const d = DIRV[view.stationDir];
      const from = tileToWorld(hx + 0.5, hy + 0.5, 0);
      const to = tileToWorld(hx + 0.5 + d.x * 0.45, hy + 0.5 + d.y * 0.45, 0);
      ctx.strokeStyle = '#ffe93e';
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
