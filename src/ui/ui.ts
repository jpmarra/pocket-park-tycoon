import type { Dir, ParkState } from '../sim/types';
import { clamp, dateString, monthIndex, MONTH_NAMES, START_MONTH } from '../sim/types';
import { RIDE_TYPES } from '../sim/ridedefs';
import { demolishRide } from '../sim/grid';
import { hireStaff, fireStaff } from '../sim/staff';
import type { TrackBuilder } from '../sim/coaster';
import { addPiece, undoPiece, isClosed, trackCost, trackStats } from '../sim/coaster';
import type { Camera } from '../render/renderer';

// Shared mutable game context. main.ts creates it; ui.ts and input.ts mutate it.
export interface GameCtx {
  s: ParkState;
  cam: Camera;
  tool: string;
  hover: { x: number; y: number } | null;
  canAct: boolean;
  builder: TrackBuilder | null;
  placingStation: boolean;
  stationDir: Dir;
  selectedRide: number | null;
  speed: number;
  panel: string; // which side panel is showing: '' | 'ride' | 'coaster' | 'finance' | 'staff' | 'goal'
  finishCoaster: () => void;
  cancelCoaster: () => void;
  newGame: () => void;
  saveGame: () => void;
  loadGame: () => void;
  setSpeed: (n: number) => void;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;

export function setTool(g: GameCtx, tool: string): void {
  if (g.tool === 'coaster' && tool !== 'coaster') g.cancelCoaster();
  g.tool = tool;
  if (tool === 'coaster') {
    g.placingStation = true;
    g.builder = null;
    showCoasterPanel(g);
  } else if (g.panel === 'coaster') {
    hidePanel(g);
  }
  document.querySelectorAll('#toolbar button[data-tool]').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.tool === tool);
  });
}

export function buildToolbar(g: GameCtx): void {
  const bar = $('#toolbar');
  bar.innerHTML = '';
  const group = (): HTMLDivElement => {
    const d = document.createElement('div');
    d.className = 'tool-group';
    bar.appendChild(d);
    return d;
  };
  const btn = (parent: HTMLElement, label: string, title: string, onClick: () => void, tool?: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    if (tool) b.dataset.tool = tool;
    b.addEventListener('click', onClick);
    parent.appendChild(b);
    return b;
  };

  const g1 = group();
  btn(g1, '🔍 Select', 'Inspect rides and guests', () => setTool(g, 'select'), 'select');
  btn(g1, '🛤 Path $10', 'Build paths (click or drag)', () => setTool(g, 'path'), 'path');
  btn(g1, '⛏ Remove', 'Remove paths', () => setTool(g, 'delpath'), 'delpath');

  const g2 = group();
  for (const def of Object.values(RIDE_TYPES)) {
    if (def.kind === 'coaster') continue;
    btn(g2, `${def.name} $${def.cost}`, `Place ${def.name} (${def.w}x${def.h})`, () => setTool(g, `ride:${def.id}`), `ride:${def.id}`);
  }

  const g3 = group();
  btn(g3, '🎢 Coaster', 'Build a custom coaster piece by piece', () => setTool(g, 'coaster'), 'coaster');
  btn(g3, '🎢 Quick Loop $1080', 'Place a ready-made coaster loop (8x5 tiles)', () => setTool(g, 'demoloop'), 'demoloop');

  const g4 = group();
  btn(g4, '🧹 Handyman $50', 'Hire a handyman ($50/month wage)', () => {
    hireStaff(g.s, 'handyman');
    refreshPanel(g);
  });
  btn(g4, '🔧 Mechanic $50', 'Hire a mechanic ($80/month wage)', () => {
    hireStaff(g.s, 'mechanic');
    refreshPanel(g);
  });
  btn(g4, '👷 Staff', 'Manage staff', () => showStaffPanel(g));

  const g5 = group();
  btn(g5, '💰 Finances', 'Income, costs and the entry fee', () => showFinancePanel(g));
  btn(g5, '🎯 Goal', 'Scenario objective', () => showGoalPanel(g));
}

export function hidePanel(g: GameCtx): void {
  g.panel = '';
  g.selectedRide = null;
  const p = $('#sidepanel');
  p.classList.add('hidden');
  p.innerHTML = '';
}

export function refreshPanel(g: GameCtx): void {
  switch (g.panel) {
    case 'ride': showRidePanel(g, g.selectedRide); break;
    case 'coaster': showCoasterPanel(g); break;
    case 'finance': showFinancePanel(g); break;
    case 'staff': showStaffPanel(g); break;
    case 'goal': showGoalPanel(g); break;
    default: break;
  }
}

function panelEl(g: GameCtx, kind: string): HTMLElement {
  g.panel = kind;
  const p = $('#sidepanel');
  p.classList.remove('hidden');
  p.innerHTML = '';
  return p;
}

function row(parent: HTMLElement, label: string, value: string, cls = ''): void {
  const d = document.createElement('div');
  d.className = 'row';
  d.innerHTML = `<span>${label}</span><span class="val ${cls}">${value}</span>`;
  parent.appendChild(d);
}

export function showRidePanel(g: GameCtx, rideId: number | null): void {
  if (rideId === null) { hidePanel(g); return; }
  const ride = g.s.rides[rideId];
  if (!ride) { hidePanel(g); return; }
  g.selectedRide = rideId;
  const p = panelEl(g, 'ride');
  const def = RIDE_TYPES[ride.typeId];
  const h = document.createElement('h3');
  h.textContent = ride.name;
  p.appendChild(h);
  const status = ride.broken ? '<span class="status-broken">BROKEN DOWN</span>'
    : ride.open ? '<span class="status-open">Open</span>' : '<span class="status-closed">Closed</span>';
  const sd = document.createElement('div');
  sd.className = 'row';
  sd.innerHTML = `<span>Status</span><span>${status}</span>`;
  p.appendChild(sd);

  if (def.kind === 'stall') {
    row(p, 'Customers', String(ride.totalRiders));
  } else {
    row(p, 'Excitement', ride.excitement.toFixed(1));
    row(p, 'Intensity', ride.intensity.toFixed(1));
    row(p, 'Nausea', ride.nausea.toFixed(1));
    row(p, 'In queue', String(ride.queue.length));
    row(p, 'Riding now', String(ride.onBoard.length));
    row(p, 'Total riders', String(ride.totalRiders));
    row(p, 'Breakdowns', String(ride.breakdowns));
  }
  row(p, 'Revenue', `$${ride.revenue}`);
  row(p, 'Upkeep', `$${ride.runningCost}/month`);

  // Price control.
  const pr = document.createElement('div');
  pr.className = 'row';
  pr.innerHTML = `<span>${def.kind === 'stall' ? 'Price' : 'Ticket'}</span>`;
  const ctl = document.createElement('span');
  const minus = document.createElement('button');
  minus.textContent = '−';
  const priceLbl = document.createElement('span');
  priceLbl.textContent = ` $${ride.price} `;
  priceLbl.style.fontWeight = '600';
  const plus = document.createElement('button');
  plus.textContent = '+';
  minus.addEventListener('click', () => { ride.price = clamp(ride.price - 1, 0, 25); refreshPanel(g); });
  plus.addEventListener('click', () => { ride.price = clamp(ride.price + 1, 0, 25); refreshPanel(g); });
  ctl.append(minus, priceLbl, plus);
  pr.appendChild(ctl);
  p.appendChild(pr);

  const btns = document.createElement('div');
  btns.className = 'btnrow';
  const toggle = document.createElement('button');
  toggle.textContent = ride.open ? 'Close ride' : 'Open ride';
  toggle.addEventListener('click', () => { ride.open = !ride.open; refreshPanel(g); });
  const demo = document.createElement('button');
  demo.className = 'danger';
  demo.textContent = 'Demolish';
  demo.addEventListener('click', () => {
    demolishRide(g.s, ride.id);
    hidePanel(g);
  });
  btns.append(toggle, demo);
  p.appendChild(btns);
}

export function showCoasterPanel(g: GameCtx): void {
  const p = panelEl(g, 'coaster');
  const h = document.createElement('h3');
  h.textContent = '🎢 Coaster Builder';
  p.appendChild(h);

  if (g.placingStation || !g.builder) {
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML = 'Click a grass tile to place the <b>station</b>.<br>Press <b>R</b> to rotate the start direction.<br>The track must loop back to the station.';
    p.appendChild(hint);
    row(p, 'Start direction', ['East', 'South', 'West', 'North'][g.stationDir]);
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => { g.cancelCoaster(); setTool(g, 'select'); });
    p.appendChild(cancel);
    return;
  }

  const b = g.builder;
  const closed = isClosed(b);
  const cost = trackCost(b.pieces);
  row(p, 'Pieces', String(b.pieces.length));
  row(p, 'Cost', `$${cost}`, g.s.cash >= cost ? '' : 'status-broken');
  row(p, 'Height', String(b.head.z));
  row(p, 'Circuit', closed ? 'CLOSED ✓' : 'open', closed ? 'status-open' : 'status-closed');
  if (closed) {
    const stats = trackStats(b.pieces);
    row(p, 'Excitement', stats.excitement.toFixed(1));
    row(p, 'Intensity', stats.intensity.toFixed(1));
  }

  const mk = (label: string, kind: string): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      if (kind === 'undo') {
        undoPiece(b);
      } else {
        const err = addPiece(g.s, b, kind as never);
        if (err) setTicker(err, 'bad');
      }
      refreshPanel(g);
    });
    return btn;
  };
  const btns = document.createElement('div');
  btns.className = 'btnrow';
  btns.append(
    mk('⬆ Straight', 'straight'),
    mk('↰ Left', 'left'),
    mk('↱ Right', 'right'),
    mk('⤴ Up', 'up'),
    mk('⤵ Down', 'down'),
    mk('↩ Undo', 'undo'),
  );
  p.appendChild(btns);

  const btns2 = document.createElement('div');
  btns2.className = 'btnrow';
  const finish = document.createElement('button');
  finish.textContent = `✓ Finish ($${cost})`;
  finish.disabled = !closed;
  if (!closed) finish.style.opacity = '0.5';
  finish.addEventListener('click', () => g.finishCoaster());
  const cancel = document.createElement('button');
  cancel.className = 'danger';
  cancel.textContent = '✗ Cancel';
  cancel.addEventListener('click', () => { g.cancelCoaster(); setTool(g, 'select'); });
  btns2.append(finish, cancel);
  p.appendChild(btns2);

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Close the loop by steering the yellow arrow back onto the station tile at ground level, facing the same way.';
  p.appendChild(hint);
}

export function showFinancePanel(g: GameCtx): void {
  const p = panelEl(g, 'finance');
  const h = document.createElement('h3');
  h.textContent = '💰 Finances';
  p.appendChild(h);
  const f = g.s.finances;
  row(p, 'Cash', `$${g.s.cash}`, g.s.cash < 0 ? 'status-broken' : 'status-open');
  row(p, 'Entry fee income', `$${f.entryIncome}`);
  row(p, 'Ride tickets', `$${f.rideIncome}`);
  row(p, 'Stall sales', `$${f.stallIncome}`);
  row(p, 'Wages paid', `−$${f.wagesPaid}`);
  row(p, 'Ride upkeep', `−$${f.runningCosts}`);
  row(p, 'Construction', `−$${f.construction}`);

  const pr = document.createElement('div');
  pr.className = 'row';
  pr.innerHTML = '<span>Entry fee</span>';
  const ctl = document.createElement('span');
  const minus = document.createElement('button');
  minus.textContent = '−';
  const lbl = document.createElement('span');
  lbl.textContent = ` $${g.s.entryFee} `;
  lbl.style.fontWeight = '600';
  const plus = document.createElement('button');
  plus.textContent = '+';
  minus.addEventListener('click', () => { g.s.entryFee = clamp(g.s.entryFee - 1, 0, 50); refreshPanel(g); });
  plus.addEventListener('click', () => { g.s.entryFee = clamp(g.s.entryFee + 1, 0, 50); refreshPanel(g); });
  ctl.append(minus, lbl, plus);
  pr.appendChild(ctl);
  p.appendChild(pr);
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'High entry fees scare off new guests.';
  p.appendChild(hint);
}

export function showStaffPanel(g: GameCtx): void {
  const p = panelEl(g, 'staff');
  const h = document.createElement('h3');
  h.textContent = '👷 Staff';
  p.appendChild(h);
  const staff = Object.values(g.s.staff);
  if (staff.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'No staff hired. Handymen sweep litter; mechanics fix broken rides.';
    p.appendChild(hint);
  }
  for (const st of staff) {
    const d = document.createElement('div');
    d.className = 'row';
    const task = st.task === 'idle' ? 'patrolling' : st.task;
    d.innerHTML = `<span>${st.name} <span class="hint">(${task}, $${st.wage}/mo)</span></span>`;
    const fire = document.createElement('button');
    fire.className = 'danger';
    fire.textContent = 'Fire';
    fire.addEventListener('click', () => { fireStaff(g.s, st.id); refreshPanel(g); });
    d.appendChild(fire);
    p.appendChild(d);
  }
}

export function showGoalPanel(g: GameCtx): void {
  const p = panelEl(g, 'goal');
  const h = document.createElement('h3');
  h.textContent = '🎯 Scenario';
  p.appendChild(h);
  const sc = g.s.scenario;
  const deadlineMonth = MONTH_NAMES[(START_MONTH + sc.deadlineMonth) % 12];
  const deadlineYear = 1 + Math.floor((START_MONTH + sc.deadlineMonth) / 12);
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = `Reach the goal before ${deadlineMonth}, Year ${deadlineYear}. Bankruptcy ends the game.`;
  p.appendChild(hint);
  row(p, 'Guests', `${g.s.guestCount} / ${sc.goalGuests}`, g.s.guestCount >= sc.goalGuests ? 'status-open' : '');
  row(p, 'Park rating', `${g.s.rating} / ${sc.goalRating}`, g.s.rating >= sc.goalRating ? 'status-open' : '');
  row(p, 'Months left', String(Math.max(0, sc.deadlineMonth - monthIndex(g.s))));
}

export function setTicker(text: string, kind: 'info' | 'bad' | 'good' = 'info'): void {
  const t = $('#ticker');
  t.textContent = text;
  t.className = kind === 'info' ? '' : kind;
}

let lastMsgCount = -1;
let lastHud = '';

export function updateHUD(g: GameCtx): void {
  const s = g.s;
  const hud = `${s.cash}|${s.guestCount}|${s.rating}|${dateString(s)}`;
  if (hud !== lastHud) {
    lastHud = hud;
    const cashEl = $('#stat-cash');
    cashEl.textContent = `$${s.cash}`;
    cashEl.classList.toggle('negative', s.cash < 0);
    $('#stat-guests').textContent = `👥 ${s.guestCount}`;
    $('#stat-rating').textContent = `★ ${s.rating}`;
    $('#stat-date').textContent = dateString(s);
  }
  if (s.messages.length !== lastMsgCount) {
    lastMsgCount = s.messages.length;
    const m = s.messages[s.messages.length - 1];
    if (m) setTicker(m.text, m.kind);
  }
  // Live-refresh dynamic panels now and then.
  if (s.tick % 20 === 0 && (g.panel === 'ride' || g.panel === 'goal' || g.panel === 'finance' || g.panel === 'staff')) {
    refreshPanel(g);
  }
}

export function showGameOverOverlay(g: GameCtx): void {
  const o = $('#overlay');
  o.classList.remove('hidden');
  const result = g.s.gameOver;
  const title = result === 'won' ? '🏆 Scenario Complete!'
    : result === 'bankrupt' ? '💸 Bankrupt!'
    : '⏰ Time Up!';
  const body = result === 'won'
    ? `You reached ${g.s.guestCount} guests with a park rating of ${g.s.rating}. A magnificent park!`
    : result === 'bankrupt'
      ? 'The park ran out of money. The bank has seized the bumper cars.'
      : `The deadline passed with ${g.s.guestCount} guests and a rating of ${g.s.rating}. The investors are not amused.`;
  o.innerHTML = `<div class="panel"><h2>${title}</h2><p>${body}</p><div class="btnrow"></div></div>`;
  const btns = o.querySelector('.btnrow')!;
  const newBtn = document.createElement('button');
  newBtn.textContent = 'New Game';
  newBtn.addEventListener('click', () => { o.classList.add('hidden'); g.newGame(); });
  btns.appendChild(newBtn);
  if (result === 'won' || result === 'lost') {
    const keep = document.createElement('button');
    keep.textContent = 'Keep Playing';
    keep.addEventListener('click', () => {
      g.s.sandbox = true;
      o.classList.add('hidden');
    });
    btns.appendChild(keep);
  }
}
