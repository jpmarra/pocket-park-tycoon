import type { GameCtx } from './ui/ui';
import { setTool, showRidePanel, hidePanel, setTicker, refreshPanel } from './ui/ui';
import { screenToTile } from './render/renderer';
import { buildPath, removePath, canPlaceRide, placeRide, createCoasterRide } from './sim/grid';
import { tileAt } from './sim/types';
import type { Dir } from './sim/types';
import { RIDE_TYPES } from './sim/ridedefs';
import {
  COASTER_TYPES, startTrack, buildDesign, canBuildDesign, getDesign,
  trackCost, trackStats, designCost,
} from './sim/coaster';
import type { TrackBuilder } from './sim/coaster';

const DRAG_THRESHOLD = 5;

export function attachInput(g: GameCtx, canvas: HTMLCanvasElement): void {
  let panning = false;
  let painting = false;
  let downX = 0;
  let downY = 0;
  let moved = false;

  const hoverTile = (ev: MouseEvent): { x: number; y: number } => {
    const t = screenToTile(g.cam, ev.clientX, ev.clientY);
    return { x: Math.floor(t.x), y: Math.floor(t.y) };
  };

  const updateCanAct = (): void => {
    const h = g.hover;
    if (!h) { g.canAct = false; return; }
    const s = g.s;
    const t = tileAt(s, h.x, h.y);
    if (g.tool === 'path') {
      g.canAct = !!t && t.kind === 'grass' && t.rideId === null && s.cash >= 10;
    } else if (g.tool === 'delpath') {
      g.canAct = !!t && t.kind === 'path';
    } else if (g.tool.startsWith('ride:')) {
      const def = RIDE_TYPES[g.tool.slice(5)];
      g.canAct = !!def && canPlaceRide(s, def.id, h.x, h.y) && s.cash >= def.cost;
    } else if (g.tool.startsWith('design:')) {
      const d = getDesign(g.tool.slice(7));
      g.canAct = !!d && canBuildDesign(s, d, h.x, h.y) && s.cash >= designCost(d);
    } else if (g.tool === 'coaster' && g.placingStation) {
      g.canAct = !!t && t.kind === 'grass' && t.rideId === null;
    } else {
      g.canAct = true;
    }
  };

  const act = (h: { x: number; y: number }): void => {
    const s = g.s;
    if (g.tool === 'path') {
      buildPath(s, h.x, h.y);
    } else if (g.tool === 'delpath') {
      removePath(s, h.x, h.y);
    } else if (g.tool.startsWith('ride:')) {
      placeRide(s, g.tool.slice(5), h.x, h.y);
    } else if (g.tool.startsWith('design:')) {
      const d = getDesign(g.tool.slice(7));
      if (!d) return;
      const b = buildDesign(s, d, h.x, h.y);
      if (typeof b === 'string') {
        setTicker(b, 'bad');
        return;
      }
      const cost = trackCost(b.pieces, d.typeId);
      const stats = trackStats(b.pieces, d.typeId);
      const cars = COASTER_TYPES[d.typeId].defaultCars;
      const ride = createCoasterRide(s, d.typeId, b.pieces, cost, stats, d.name, cars);
      if (ride) {
        setTool(g, 'select');
        showRidePanel(g, ride.id);
      }
    } else if (g.tool === 'coaster' && g.placingStation) {
      const b = startTrack(s, g.coasterTypeId, h.x, h.y, g.stationDir);
      if (typeof b === 'string') {
        setTicker(b, 'bad');
        return;
      }
      g.builder = b as TrackBuilder;
      g.placingStation = false;
      refreshPanel(g);
    } else if (g.tool === 'select') {
      const t = tileAt(s, h.x, h.y);
      if (t && t.rideId !== null) {
        showRidePanel(g, t.rideId);
      } else {
        hidePanel(g);
      }
    }
  };

  canvas.addEventListener('mousedown', (ev) => {
    downX = ev.clientX;
    downY = ev.clientY;
    moved = false;
    if (ev.button === 1 || ev.button === 2) {
      panning = true;
    } else if (ev.button === 0 && (g.tool === 'path' || g.tool === 'delpath')) {
      painting = true;
      const h = hoverTile(ev);
      g.hover = h;
      act(h);
    }
  });

  window.addEventListener('mousemove', (ev) => {
    const dx = ev.clientX - downX;
    const dy = ev.clientY - downY;
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) moved = true;
    if (panning) {
      g.cam.x += ev.movementX;
      g.cam.y += ev.movementY;
      return;
    }
    g.hover = hoverTile(ev);
    updateCanAct();
    if (painting) act(g.hover);
  });

  window.addEventListener('mouseup', (ev) => {
    if (panning) {
      panning = false;
      return;
    }
    if (painting) {
      painting = false;
      return;
    }
    if (ev.button === 0 && ev.target === canvas && !moved) {
      const h = hoverTile(ev);
      g.hover = h;
      updateCanAct();
      act(h);
    }
  });

  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.min(2.5, Math.max(0.4, g.cam.zoom * factor));
    const wx = (ev.clientX - g.cam.x) / g.cam.zoom;
    const wy = (ev.clientY - g.cam.y) / g.cam.zoom;
    g.cam.zoom = newZoom;
    g.cam.x = ev.clientX - wx * newZoom;
    g.cam.y = ev.clientY - wy * newZoom;
  }, { passive: false });

  window.addEventListener('keydown', (ev) => {
    const pan = 40;
    switch (ev.key) {
      case 'ArrowUp': g.cam.y += pan; break;
      case 'ArrowDown': g.cam.y -= pan; break;
      case 'ArrowLeft': g.cam.x += pan; break;
      case 'ArrowRight': g.cam.x -= pan; break;
      case 'r': case 'R':
        if (g.tool === 'coaster' && g.placingStation) {
          g.stationDir = ((g.stationDir + 1) % 4) as Dir;
          refreshPanel(g);
        }
        break;
      case 'Escape':
        setTool(g, 'select');
        hidePanel(g);
        break;
      case '1': g.setSpeed(0); break;
      case '2': g.setSpeed(1); break;
      case '3': g.setSpeed(4); break;
      default: break;
    }
  });
}
