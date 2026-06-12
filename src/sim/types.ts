// Core data model. The whole simulation state is plain JSON-serializable data
// so save/load is a stringify/parse round-trip and tests can snapshot it.

export type TileKind = 'grass' | 'path' | 'entrance';

export interface Tile {
  kind: TileKind;
  litter: number; // 0..5
  rideId: number | null; // ride footprint occupying this tile
}

export type Dir = 0 | 1 | 2 | 3; // 0=+x (E), 1=+y (S), 2=-x (W), 3=-y (N)
export const DIRV: ReadonlyArray<{ x: number; y: number }> = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

// RCT-style track pieces are a COMBINATION of turn, slope, banking and a
// special element — mirroring the original builder's control groups.
export type TrackSpecial = 'none' | 'station' | 'loop' | 'corkscrewL' | 'corkscrewR' | 'brakes';

export interface PieceOp {
  turn: -1 | 0 | 1; // left / straight / right
  slope: -2 | -1 | 0 | 1 | 2; // steep down / down / level / up / steep up (z delta)
  bank: -1 | 0 | 1; // banked left / flat / banked right
  chain: boolean; // chain lift on this piece
  special: TrackSpecial;
}

export interface TrackPiece extends PieceOp {
  x: number;
  y: number;
  dirIn: Dir;
  dirOut: Dir;
  zIn: number;
  zOut: number;
}

export type StallProduct = 'food' | 'drink' | 'balloon' | 'toilet';

export interface RideTypeDef {
  id: string;
  name: string;
  cost: number;
  runningCost: number; // per month
  capacity: number;
  duration: number; // ride cycle ticks
  excitement: number; // 0..10
  intensity: number; // 0..10
  nausea: number; // 0..10
  w: number;
  h: number;
  color: string;
  kind: 'ride' | 'stall' | 'coaster';
  category: 'gentle' | 'thrill' | 'coaster' | 'stall';
  product?: StallProduct;
  defaultPrice: number;
  reliability: number; // 0..1
  height: number; // visual height in z units
}

export type RideState = 'loading' | 'running';

export interface Ride {
  id: number;
  typeId: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  price: number;
  open: boolean;
  broken: boolean;
  breakdowns: number;
  repairTicks: number; // >0 while a mechanic is actively repairing
  mechanicId: number | null;
  state: RideState;
  stateTicks: number;
  queue: number[]; // guest ids waiting at the entrance
  onBoard: number[]; // guest ids currently riding
  totalRiders: number;
  revenue: number;
  excitement: number;
  intensity: number;
  nausea: number;
  duration: number;
  capacity: number;
  reliability: number;
  runningCost: number;
  age: number; // ticks since built
  track?: TrackPiece[]; // present for custom coasters
  trainPos?: number; // continuous piece index while running
  trainSpeed?: number;
  cars: number; // train length for coasters (capacity = cars * 2)
}

export type GuestState = 'walking' | 'queuing' | 'riding' | 'gone';
export type GuestActivity = 'none' | 'wander' | 'toRide' | 'toStall' | 'leaving';

export interface Guest {
  id: number;
  name: string;
  x: number; // tile coords, float (render position)
  y: number;
  tx: number; // current tile, int
  ty: number;
  path: { x: number; y: number }[];
  pathIdx: number;
  state: GuestState;
  activity: GuestActivity;
  targetRide: number | null;
  happiness: number; // 0..100
  hunger: number; // 0..100 (high = hungry)
  thirst: number;
  energy: number; // 0..100 (low = tired)
  nausea: number;
  cash: number;
  intensityTol: number; // max ride intensity this guest accepts
  hasTrash: boolean;
  trashTimer: number;
  patience: number;
  lastRide: number | null;
  ridesRidden: number;
  ticksInPark: number;
  idleTicks: number;
  color: string;
  balloon: string | null; // colour of a carried balloon
}

export type StaffRole = 'handyman' | 'mechanic';
export type StaffTask = 'idle' | 'toLitter' | 'sweeping' | 'toRide' | 'repairing';

export interface Staff {
  id: number;
  role: StaffRole;
  name: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  path: { x: number; y: number }[];
  pathIdx: number;
  task: StaffTask;
  targetX: number;
  targetY: number;
  targetRide: number | null;
  workTicks: number;
  wage: number; // per month
  color: string;
}

export interface Message {
  tick: number;
  text: string;
  kind: 'info' | 'bad' | 'good';
}

export interface Scenario {
  name: string;
  goalGuests: number;
  goalRating: number;
  deadlineMonth: number; // month index at which the goal is evaluated
}

export interface Finances {
  entryIncome: number;
  rideIncome: number;
  stallIncome: number;
  wagesPaid: number;
  runningCosts: number;
  construction: number;
}

export type GameOver = 'none' | 'won' | 'bankrupt' | 'lost';

export interface ParkState {
  version: number;
  seed: number;
  rng: number;
  tick: number;
  cash: number;
  entryFee: number;
  guests: Record<number, Guest>;
  guestCount: number;
  rides: Record<number, Ride>;
  staff: Record<number, Staff>;
  grid: Tile[];
  gridW: number;
  gridH: number;
  nextId: number;
  rating: number; // 0..999
  totalGuestsEver: number;
  messages: Message[];
  scenario: Scenario;
  gameOver: GameOver;
  sandbox: boolean; // true once player chooses to keep playing past a result
  finances: Finances;
}

// --- Constants ---

export const GRID_W = 36;
export const GRID_H = 36;
export const TICKS_PER_MONTH = 1500;
export const PATH_COST = 10;
export const STARTING_CASH = 3000;
export const MAX_GUESTS = 160;
export const GUEST_SPEED = 0.09; // tiles per tick
export const QUEUE_PATIENCE = 450;
export const REPAIR_TICKS = 220;
export const SWEEP_TICKS = 30;
export const HANDYMAN_WAGE = 50;
export const MECHANIC_WAGE = 80;
export const MAX_TRACK_Z = 12;
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const START_MONTH = 2; // March

// --- Small helpers (deterministic, state-threaded RNG) ---

export function rand(s: ParkState): number {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}

export function randInt(s: ParkState, n: number): number {
  return Math.floor(rand(s) * n);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function tileAt(s: ParkState, x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= s.gridW || y >= s.gridH) return null;
  return s.grid[y * s.gridW + x];
}

export function inBounds(s: ParkState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < s.gridW && y < s.gridH;
}

export function monthIndex(s: ParkState): number {
  return Math.floor(s.tick / TICKS_PER_MONTH);
}

export function dateString(s: ParkState): string {
  const m = monthIndex(s);
  const month = MONTH_NAMES[(START_MONTH + m) % 12];
  const year = 1 + Math.floor((START_MONTH + m) / 12);
  return `${month}, Year ${year}`;
}

export function addMessage(s: ParkState, text: string, kind: Message['kind'] = 'info'): void {
  s.messages.push({ tick: s.tick, text, kind });
  if (s.messages.length > 30) s.messages.splice(0, s.messages.length - 30);
}
