import type { ParkState } from './types';
import {
  TICKS_PER_MONTH, addMessage, clamp, dateString, rand,
} from './types';
import { applyMonthlyCosts } from './grid';
import { spawnGuest, tickGuest } from './guest';
import { tickRide } from './ride';
import { tickStaff } from './staff';
import { RIDE_TYPES } from './ridedefs';

export { createPark } from './grid';

function updateRating(s: ParkState): void {
  const guests = Object.values(s.guests);
  const avgHappiness = guests.length > 0
    ? guests.reduce((sum, g) => sum + g.happiness, 0) / guests.length
    : 65;
  let litter = 0;
  for (const t of s.grid) litter += t.litter;
  const rides = Object.values(s.rides).filter((r) => RIDE_TYPES[r.typeId].kind !== 'stall');
  const broken = rides.filter((r) => r.broken).length;
  // A high rating needs both happy guests AND a well-built park: variety of
  // rides and total excitement on offer. One carousel cannot carry a park.
  const rideBonus = Math.min(rides.length * 35, 250);
  const excitementBonus = Math.min(rides.reduce((sum, r) => sum + r.excitement, 0) * 5, 80);
  s.rating = Math.round(clamp(
    avgHappiness * 5.5 + rideBonus + excitementBonus - litter * 4 - broken * 60,
    0, 999,
  ));
}

function maybeSpawnGuest(s: ParkState): void {
  const openRides = Object.values(s.rides)
    .filter((r) => RIDE_TYPES[r.typeId].kind !== 'stall' && r.open && !r.broken).length;
  if (openRides === 0) return; // nobody visits a park with nothing to ride
  // Soft capacity: guests stop showing up when the park is crowded relative
  // to what there is to do. More rides = more visitors.
  const capacity = 10 + openRides * 12;
  if (s.guestCount >= capacity * 1.5) return;
  const crowding = s.guestCount >= capacity ? 0.1 : 1;
  const base = 0.004 + openRides * 0.004;
  const feeFactor = clamp(1.4 - s.entryFee / 25, 0.1, 1.3);
  const ratingFactor = 0.4 + s.rating / 900;
  if (rand(s) < base * feeFactor * ratingFactor * crowding) {
    spawnGuest(s);
  }
}

function checkScenario(s: ParkState): void {
  if (s.gameOver !== 'none' || s.sandbox) return;
  if (s.cash < 0) {
    s.gameOver = 'bankrupt';
    addMessage(s, 'The park has gone bankrupt!', 'bad');
    return;
  }
  const sc = s.scenario;
  if (s.guestCount >= sc.goalGuests && s.rating >= sc.goalRating) {
    s.gameOver = 'won';
    addMessage(s, `Scenario complete! ${s.guestCount} guests with a rating of ${s.rating}.`, 'good');
    return;
  }
  if (Math.floor(s.tick / TICKS_PER_MONTH) >= sc.deadlineMonth) {
    s.gameOver = 'lost';
    addMessage(s, 'Time has run out — the scenario goal was not met.', 'bad');
  }
}

// One deterministic simulation step. Pure state-in/state-out (mutates s),
// no rendering or browser APIs — this is what unit tests drive directly.
export function tick(s: ParkState): void {
  if (s.gameOver !== 'none' && !s.sandbox) return;
  s.tick++;

  maybeSpawnGuest(s);

  // Deterministic iteration order: numeric id ascending.
  const guestIds = Object.keys(s.guests).map(Number).sort((a, b) => a - b);
  for (const id of guestIds) {
    const g = s.guests[id];
    if (g) tickGuest(s, g);
  }

  const rideIds = Object.keys(s.rides).map(Number).sort((a, b) => a - b);
  for (const id of rideIds) {
    const r = s.rides[id];
    if (r) tickRide(s, r);
  }

  const staffIds = Object.keys(s.staff).map(Number).sort((a, b) => a - b);
  for (const id of staffIds) {
    const st = s.staff[id];
    if (st) tickStaff(s, st);
  }

  if (s.tick % TICKS_PER_MONTH === 0) {
    applyMonthlyCosts(s);
    addMessage(s, `It is now ${dateString(s)}.`);
  }

  if (s.tick % 40 === 0) updateRating(s);

  checkScenario(s);
}

export function step(s: ParkState, n: number): void {
  for (let i = 0; i < n; i++) tick(s);
}
