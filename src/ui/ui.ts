import type { Dir, ParkState, PieceOp } from '../sim/types';
import { clamp, dateString, monthIndex, MONTH_NAMES, START_MONTH } from '../sim/types';
import { RIDE_TYPES } from '../sim/ridedefs';
import { demolishRide } from '../sim/grid';
import { hireStaff, fireStaff } from '../sim/staff';
import type { TrackBuilder } from '../sim/coaster';
import {
  COASTER_DESIGNS, COASTER_TYPES, addPiece, undoPiece, isClosed, trackCost,
  trackStats, designCost, designStats, op,
} from '../sim/coaster';
import type { Camera } from '../render/renderer';

// Shared mutable game context. main.ts creates it; ui.ts and input.ts mutate it.
export interface BuilderSelection {
  turn: -1 | 0 | 1;
  slope: -2 | -1 | 0 | 1 | 2;
  bank: -1 | 0 | 1;
  chain: boolean;
}

export interface GameCtx {
  s: ParkState;
  cam: Camera;
  tool: string; // select | path | delpath | ride:<id> | coaster | design:<id>
  hover: { x: number; y: number } | null;
  canAct: boolean;
  builder: TrackBuilder | null;
  builderSel: BuilderSelection;
  coasterTypeId: string; // type chosen for a custom build
  placingStation: boolean;
  stationDir: Dir;
  selectedRide: number | null;
  speed: number;
  panel: string;
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

function button(parent: HTMLElement, label: string, title: string, onClick: () => void, opts: { tool?: string; cls?: string } = {}): HTMLButtonElement {
  const b = document.createElement('button');
  b.innerHTML = label;
  b.title = title;
  if (opts.tool) b.dataset.tool = opts.tool;
  if (opts.cls) b.className = opts.cls;
  b.addEventListener('click', onClick);
  parent.appendChild(b);
  return b;
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

  const g1 = group();
  button(g1, '🔍 Select', 'Inspect rides', () => setTool(g, 'select'), { tool: 'select' });
  button(g1, '🛤 Path $10', 'Build paths (click or drag)', () => setTool(g, 'path'), { tool: 'path' });
  button(g1, '⛏ Remove', 'Remove paths', () => setTool(g, 'delpath'), { tool: 'delpath' });

  const g2 = group();
  button(g2, '🎠 Gentle', 'Gentle rides', () => showBuildMenu(g, 'gentle'));
  button(g2, '🚀 Thrill', 'Thrill rides', () => showBuildMenu(g, 'thrill'));
  button(g2, '🎢 Coasters', 'Custom coasters & pre-built designs', () => showCoasterMenu(g));
  button(g2, '🍔 Stalls', 'Food, drink & facilities', () => showBuildMenu(g, 'stall'));

  const g3 = group();
  button(g3, '🧹 Handyman $50', 'Hire a handyman ($50/month)', () => { hireStaff(g.s, 'handyman'); refreshPanel(g); });
  button(g3, '🔧 Mechanic $50', 'Hire a mechanic ($80/month)', () => { hireStaff(g.s, 'mechanic'); refreshPanel(g); });
  button(g3, '👷 Staff', 'Manage staff', () => showStaffPanel(g));

  const g4 = group();
  button(g4, '💰 Finances', 'Income, costs, entry fee', () => showFinancePanel(g));
  button(g4, '🎯 Goal', 'Scenario objective', () => showGoalPanel(g));
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

function header(parent: HTMLElement, text: string): void {
  const h = document.createElement('h3');
  h.textContent = text;
  parent.appendChild(h);
}

// ----------------------------------------------------------- build menus --

export function showBuildMenu(g: GameCtx, category: 'gentle' | 'thrill' | 'stall'): void {
  const p = panelEl(g, 'menu');
  const titles = { gentle: '🎠 Gentle Rides', thrill: '🚀 Thrill Rides', stall: '🍔 Stalls & Facilities' };
  header(p, titles[category]);
  for (const def of Object.values(RIDE_TYPES)) {
    if (def.category !== category) continue;
    const d = document.createElement('div');
    d.className = 'row';
    d.innerHTML = `<span>${def.name} <span class="hint">${def.w}×${def.h}</span></span>`;
    const b = document.createElement('button');
    b.textContent = `$${def.cost}`;
    b.dataset.build = def.id;
    b.addEventListener('click', () => setTool(g, `ride:${def.id}`));
    d.appendChild(b);
    p.appendChild(d);
  }
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Pick one, then click a grass spot next to a path.';
  p.appendChild(hint);
}

export function showCoasterMenu(g: GameCtx): void {
  const p = panelEl(g, 'menu');
  header(p, '🎢 Build a Coaster');

  const sub1 = document.createElement('div');
  sub1.className = 'hint';
  sub1.innerHTML = '<b>Custom track</b> — pick a type, place a station, build piece by piece:';
  p.appendChild(sub1);
  for (const cfg of Object.values(COASTER_TYPES)) {
    const d = document.createElement('div');
    d.className = 'row';
    const caps = [
      cfg.allowsInversions ? 'loops' : null,
      cfg.allowsSteep ? 'steep' : null,
    ].filter(Boolean).join(', ') || 'gentle';
    d.innerHTML = `<span>${cfg.name} <span class="hint">${caps}</span></span>`;
    const b = document.createElement('button');
    b.textContent = 'Build';
    b.dataset.build = cfg.id;
    b.addEventListener('click', () => {
      g.coasterTypeId = cfg.id;
      setTool(g, 'coaster');
    });
    d.appendChild(b);
    p.appendChild(d);
  }

  const sub2 = document.createElement('div');
  sub2.className = 'hint';
  sub2.style.marginTop = '10px';
  sub2.innerHTML = '<b>Pre-built designs</b> — proven layouts, ready to drop in:';
  p.appendChild(sub2);
  for (const d of COASTER_DESIGNS) {
    const stats = designStats(d);
    const cost = designCost(d);
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = `<span>${d.name} <span class="hint">${COASTER_TYPES[d.typeId].name}<br>E ${stats.excitement.toFixed(1)} · I ${stats.intensity.toFixed(1)} · N ${stats.nausea.toFixed(1)}</span></span>`;
    const b = document.createElement('button');
    b.textContent = `$${cost}`;
    b.title = d.desc;
    b.dataset.build = d.id;
    b.addEventListener('click', () => setTool(g, `design:${d.id}`));
    el.appendChild(b);
    p.appendChild(el);
  }
}

// --------------------------------------------------------- coaster builder --

export function showCoasterPanel(g: GameCtx): void {
  const p = panelEl(g, 'coaster');
  const cfg = COASTER_TYPES[g.coasterTypeId];
  header(p, `🎢 ${cfg.name}`);

  if (g.placingStation || !g.builder) {
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML = 'Click a grass tile to place the <b>station</b>.<br>Press <b>R</b> to rotate the start direction.<br>Steer the track back onto the station to close the circuit.';
    p.appendChild(hint);
    row(p, 'Start direction', ['East', 'South', 'West', 'North'][g.stationDir]);
    button(p, 'Cancel', 'Cancel', () => { g.cancelCoaster(); setTool(g, 'select'); }, { cls: 'danger' });
    return;
  }

  const b = g.builder;
  const closed = isClosed(b);
  const cost = trackCost(b.pieces, b.typeId);
  row(p, 'Pieces', String(b.pieces.length));
  row(p, 'Cost', `$${cost}`, g.s.cash >= cost ? '' : 'status-broken');
  row(p, 'Height', String(b.head.z));
  row(p, 'Circuit', closed ? 'CLOSED ✓' : 'open', closed ? 'status-open' : 'status-closed');
  if (closed) {
    const stats = trackStats(b.pieces, b.typeId);
    if (stats.valid) {
      row(p, 'Excitement', stats.excitement.toFixed(2), 'status-open');
      row(p, 'Intensity', stats.intensity.toFixed(2));
      row(p, 'Nausea', stats.nausea.toFixed(2));
      row(p, 'Max speed', `${Math.round(stats.maxSpeed * 160)} km/h`);
      row(p, 'Inversions', String(stats.inversions));
      row(p, 'Airtime', String(stats.airtime));
    } else {
      const warn = document.createElement('div');
      warn.className = 'hint status-broken';
      warn.textContent = `⚠ ${stats.reason}`;
      p.appendChild(warn);
    }
  }

  const sel = g.builderSel;
  const mkGroup = (title: string, options: Array<[string, () => boolean, () => void]>): void => {
    const lbl = document.createElement('div');
    lbl.className = 'hint';
    lbl.style.marginTop = '6px';
    lbl.textContent = title;
    p.appendChild(lbl);
    const rowEl = document.createElement('div');
    rowEl.className = 'btnrow';
    for (const [text, isActive, onPick] of options) {
      const btn = document.createElement('button');
      btn.textContent = text;
      if (isActive()) btn.classList.add('active');
      btn.addEventListener('click', () => { onPick(); refreshPanel(g); });
      rowEl.appendChild(btn);
    }
    p.appendChild(rowEl);
  };

  mkGroup('Direction', [
    ['↰ Left', () => sel.turn === -1, () => { sel.turn = -1; }],
    ['⬆ Straight', () => sel.turn === 0, () => { sel.turn = 0; }],
    ['↱ Right', () => sel.turn === 1, () => { sel.turn = 1; }],
  ]);
  const slopes: Array<[string, -2 | -1 | 0 | 1 | 2]> = cfg.allowsSteep
    ? [['⤓', -2], ['↘', -1], ['—', 0], ['↗', 1], ['⤒', 2]]
    : [['↘', -1], ['—', 0], ['↗', 1]];
  mkGroup('Slope', slopes.map(([t, v]) => [t, () => sel.slope === v, () => { sel.slope = v; }]));
  mkGroup('Banking', [
    ['⟲ Left', () => sel.bank === -1, () => { sel.bank = -1; }],
    ['— None', () => sel.bank === 0, () => { sel.bank = 0; }],
    ['⟳ Right', () => sel.bank === 1, () => { sel.bank = 1; }],
  ]);
  mkGroup('Chain lift', [
    ['⛓ On', () => sel.chain, () => { sel.chain = true; }],
    ['Off', () => !sel.chain, () => { sel.chain = false; }],
  ]);

  const addRow = document.createElement('div');
  addRow.className = 'btnrow';
  const tryAdd = (o: PieceOp): void => {
    const err = addPiece(g.s, b, o);
    if (err) setTicker(err, 'bad');
    refreshPanel(g);
  };
  button(addRow, '➕ Add piece', 'Add the selected piece', () => tryAdd(op({ turn: sel.turn, slope: sel.slope, bank: sel.bank, chain: sel.chain })));
  button(addRow, '↩ Undo', 'Remove the last piece', () => { undoPiece(b); refreshPanel(g); });
  p.appendChild(addRow);

  if (cfg.allowsInversions) {
    const specials = document.createElement('div');
    specials.className = 'btnrow';
    button(specials, '➰ Loop', 'Vertical loop (straight, level)', () => tryAdd(op({ special: 'loop' })));
    button(specials, '🌀 Cork L', 'Corkscrew left', () => tryAdd(op({ special: 'corkscrewL' })));
    button(specials, '🌀 Cork R', 'Corkscrew right', () => tryAdd(op({ special: 'corkscrewR' })));
    button(specials, '🟨 Brakes', 'Brake run', () => tryAdd(op({ special: 'brakes' })));
    p.appendChild(specials);
  } else {
    const specials = document.createElement('div');
    specials.className = 'btnrow';
    button(specials, '🟨 Brakes', 'Brake run', () => tryAdd(op({ special: 'brakes' })));
    p.appendChild(specials);
  }

  const doneRow = document.createElement('div');
  doneRow.className = 'btnrow';
  const stats = closed ? trackStats(b.pieces, b.typeId) : null;
  const finish = button(doneRow, `✓ Finish ($${cost})`, 'Open the coaster', () => g.finishCoaster());
  if (!closed || !stats?.valid) {
    finish.disabled = true;
    finish.style.opacity = '0.5';
  }
  button(doneRow, '✗ Cancel', 'Abandon construction', () => { g.cancelCoaster(); setTool(g, 'select'); }, { cls: 'danger' });
  p.appendChild(doneRow);
}

// ------------------------------------------------------------ info panels --

export function showRidePanel(g: GameCtx, rideId: number | null): void {
  if (rideId === null) { hidePanel(g); return; }
  const ride = g.s.rides[rideId];
  if (!ride) { hidePanel(g); return; }
  g.selectedRide = rideId;
  const p = panelEl(g, 'ride');
  const def = RIDE_TYPES[ride.typeId];
  header(p, ride.name);
  const status = ride.broken ? '<span class="status-broken">BROKEN DOWN</span>'
    : ride.open ? '<span class="status-open">Open</span>' : '<span class="status-closed">Closed</span>';
  const sd = document.createElement('div');
  sd.className = 'row';
  sd.innerHTML = `<span>Status</span><span>${status}</span>`;
  p.appendChild(sd);

  if (def.kind === 'stall') {
    row(p, 'Customers', String(ride.totalRiders));
  } else {
    row(p, 'Excitement', ride.excitement.toFixed(2));
    row(p, 'Intensity', ride.intensity.toFixed(2));
    row(p, 'Nausea', ride.nausea.toFixed(2));
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

  // Train length for coasters.
  if (ride.track) {
    const cfg = COASTER_TYPES[ride.typeId];
    const tr = document.createElement('div');
    tr.className = 'row';
    tr.innerHTML = '<span>Train cars</span>';
    const ctl2 = document.createElement('span');
    const minus2 = document.createElement('button');
    minus2.textContent = '−';
    const lbl2 = document.createElement('span');
    lbl2.textContent = ` ${ride.cars} `;
    lbl2.style.fontWeight = '600';
    const plus2 = document.createElement('button');
    plus2.textContent = '+';
    minus2.addEventListener('click', () => {
      ride.cars = clamp(ride.cars - 1, 2, cfg?.maxCars ?? 8);
      ride.capacity = ride.cars * 2;
      refreshPanel(g);
    });
    plus2.addEventListener('click', () => {
      ride.cars = clamp(ride.cars + 1, 2, cfg?.maxCars ?? 8);
      ride.capacity = ride.cars * 2;
      refreshPanel(g);
    });
    ctl2.append(minus2, lbl2, plus2);
    tr.appendChild(ctl2);
    p.appendChild(tr);
  }

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

export function showFinancePanel(g: GameCtx): void {
  const p = panelEl(g, 'finance');
  header(p, '💰 Finances');
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
  header(p, '👷 Staff');
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
  header(p, '🎯 Scenario');
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
let lastPanelRefresh = 0;

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
  // Live-refresh dynamic panels about once a second (time-based, because
  // tick-modulo checks can be skipped entirely at fast speed).
  const now = performance.now();
  if (now - lastPanelRefresh > 1000
    && (g.panel === 'ride' || g.panel === 'goal' || g.panel === 'finance' || g.panel === 'staff')) {
    lastPanelRefresh = now;
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
      ? 'The park ran out of money. The bank has seized the dodgems.'
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
