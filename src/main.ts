import './style.css';
import { buildPath, createPark, placeRide } from './sim/grid';
import { hireStaff } from './sim/staff';
import { demoLoopPieces } from './sim/coaster';
import type { StaffRole } from './sim/types';
import { tick, step } from './sim/park';
import { serialize, deserialize } from './sim/save';
import { render, tileToWorld } from './render/renderer';
import type { Camera, ViewState } from './render/renderer';
import type { GameCtx } from './ui/ui';
import {
  buildToolbar, setTool, updateHUD, setTicker, showGameOverOverlay, hidePanel, refreshPanel,
} from './ui/ui';
import { attachInput } from './input';
import { createCoasterRide } from './sim/grid';
import { isClosed, trackCost, trackStats } from './sim/coaster';
import { showRidePanel } from './ui/ui';

const SAVE_KEY = 'pocket-park-tycoon-save';
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx2d = canvas.getContext('2d')!;

function initialCamera(): Camera {
  const cw = window.innerWidth;
  const chh = window.innerHeight;
  // Center the grid; world center of a 36x36 grid is at tile (18,18).
  const c = tileToWorld(18, 18);
  return { x: cw / 2 - c.x, y: chh / 2 - c.y, zoom: 1 };
}

const g: GameCtx = {
  s: createPark(Math.floor(performance.now()) ^ 0x5eed),
  cam: initialCamera(),
  tool: 'select',
  hover: null,
  canAct: false,
  builder: null,
  placingStation: false,
  stationDir: 0,
  selectedRide: null,
  speed: 1,
  panel: '',
  finishCoaster: () => {
    if (!g.builder || !isClosed(g.builder)) return;
    const cost = trackCost(g.builder.pieces);
    const ride = createCoasterRide(g.s, g.builder.pieces, cost, trackStats(g.builder.pieces));
    if (ride) {
      g.builder = null;
      g.placingStation = false;
      setTool(g, 'select');
      showRidePanel(g, ride.id);
    }
  },
  cancelCoaster: () => {
    g.builder = null;
    g.placingStation = false;
    if (g.panel === 'coaster') hidePanel(g);
  },
  newGame: () => {
    g.s = createPark(Math.floor(performance.now()) ^ 0x5eed);
    g.cam = initialCamera();
    shownGameOver = false;
    g.builder = null;
    g.placingStation = false;
    hidePanel(g);
    setTool(g, 'select');
  },
  saveGame: () => {
    try {
      localStorage.setItem(SAVE_KEY, serialize(g.s));
      setTicker('Park saved.', 'good');
    } catch {
      setTicker('Save failed (storage unavailable).', 'bad');
    }
  },
  loadGame: () => {
    let json: string | null = null;
    try {
      json = localStorage.getItem(SAVE_KEY);
    } catch {
      /* storage unavailable */
    }
    const loaded = json ? deserialize(json) : null;
    if (loaded) {
      g.s = loaded;
      shownGameOver = g.s.gameOver !== 'none';
      g.builder = null;
      g.placingStation = false;
      hidePanel(g);
      setTool(g, 'select');
      setTicker('Park loaded.', 'good');
    } else {
      setTicker('No valid save found.', 'bad');
    }
  },
  setSpeed: (n: number) => {
    g.speed = n;
    document.getElementById('speed-pause')!.classList.toggle('active', n === 0);
    document.getElementById('speed-1')!.classList.toggle('active', n === 1);
    document.getElementById('speed-4')!.classList.toggle('active', n === 4);
  },
};

let shownGameOver = false;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}
window.addEventListener('resize', resize);
resize();

buildToolbar(g);
setTool(g, 'select');
attachInput(g, canvas);

document.getElementById('speed-pause')!.addEventListener('click', () => g.setSpeed(0));
document.getElementById('speed-1')!.addEventListener('click', () => g.setSpeed(1));
document.getElementById('speed-4')!.addEventListener('click', () => g.setSpeed(4));
document.getElementById('btn-save')!.addEventListener('click', () => g.saveGame());
document.getElementById('btn-load')!.addEventListener('click', () => g.loadGame());
document.getElementById('btn-new')!.addEventListener('click', () => {
  if (window.confirm('Start a new park? Unsaved progress will be lost.')) g.newGame();
});

// Fixed-timestep simulation, decoupled from rendering. The HUD updates here
// too (not just in the rAF loop) so it stays live even when the browser
// throttles animation frames for hidden/occluded pages.
window.setInterval(() => {
  for (let i = 0; i < g.speed; i++) tick(g.s);
  updateHUD(g);
  if (g.s.gameOver !== 'none' && !g.s.sandbox && !shownGameOver) {
    shownGameOver = true;
    showGameOverOverlay(g);
  }
}, 100);

function frame(): void {
  const dpr = window.devicePixelRatio || 1;
  const camDraw: Camera = { x: g.cam.x * dpr, y: g.cam.y * dpr, zoom: g.cam.zoom * dpr };
  const view: ViewState = {
    tool: g.tool,
    hover: g.hover,
    canAct: g.canAct,
    builder: g.builder,
    builderPlacingStation: g.placingStation,
    stationDir: g.stationDir,
    selectedRide: g.selectedRide,
  };
  render(ctx2d, g.s, camDraw, view, canvas.width, canvas.height);
  updateHUD(g);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Test/automation API (used by the Playwright smoke test) ---
declare global {
  interface Window {
    game: {
      ctx: GameCtx;
      step: (n: number) => void;
      tileToScreen: (x: number, y: number) => { x: number; y: number };
      refreshPanel: () => void;
      api: {
        buildPath: (x: number, y: number) => boolean;
        placeRide: (typeId: string, x: number, y: number) => boolean;
        buildDemoLoop: (x: number, y: number) => boolean;
        hireStaff: (role: StaffRole) => boolean;
      };
    };
  }
}

window.game = {
  ctx: g,
  step: (n: number) => step(g.s, n),
  tileToScreen: (x: number, y: number) => {
    const w = tileToWorld(x + 0.5, y + 0.5);
    return { x: w.x * g.cam.zoom + g.cam.x, y: w.y * g.cam.zoom + g.cam.y };
  },
  refreshPanel: () => refreshPanel(g),
  api: {
    buildPath: (x, y) => buildPath(g.s, x, y),
    placeRide: (typeId, x, y) => placeRide(g.s, typeId, x, y) !== null,
    buildDemoLoop: (x, y) => {
      const b = demoLoopPieces(g.s, x, y);
      if (typeof b === 'string') return false;
      return createCoasterRide(g.s, b.pieces, trackCost(b.pieces), trackStats(b.pieces)) !== null;
    },
    hireStaff: (role) => hireStaff(g.s, role) !== null,
  },
};
