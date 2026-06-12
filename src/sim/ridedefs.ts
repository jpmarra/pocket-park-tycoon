import type { RideTypeDef } from './types';

// Ride roster modelled on the original RollerCoaster Tycoon line-up:
// gentle rides, thrill rides, three coaster track types, and a row of stalls.
// (All artwork is original — drawn procedurally in the renderer.)
export const RIDE_TYPES: Record<string, RideTypeDef> = {
  // --- Gentle rides ---
  carousel: {
    id: 'carousel', name: 'Merry-Go-Round', cost: 500, runningCost: 30,
    capacity: 12, duration: 120, excitement: 3.2, intensity: 1.5, nausea: 1.2,
    w: 2, h: 2, color: '#d4a017', kind: 'ride', category: 'gentle', defaultPrice: 3, reliability: 0.97, height: 2,
  },
  ferris: {
    id: 'ferris', name: 'Ferris Wheel', cost: 900, runningCost: 45,
    capacity: 16, duration: 220, excitement: 4.8, intensity: 1.8, nausea: 1.0,
    w: 3, h: 3, color: '#9b59b6', kind: 'ride', category: 'gentle', defaultPrice: 4, reliability: 0.96, height: 6,
  },
  haunted: {
    id: 'haunted', name: 'Haunted House', cost: 700, runningCost: 25,
    capacity: 14, duration: 180, excitement: 3.8, intensity: 2.6, nausea: 1.4,
    w: 2, h: 2, color: '#5b4a6b', kind: 'ride', category: 'gentle', defaultPrice: 3, reliability: 0.98, height: 3,
  },
  spiralslide: {
    id: 'spiralslide', name: 'Spiral Slide', cost: 400, runningCost: 18,
    capacity: 8, duration: 90, excitement: 2.8, intensity: 1.2, nausea: 0.8,
    w: 2, h: 2, color: '#e2a13c', kind: 'ride', category: 'gentle', defaultPrice: 2, reliability: 0.99, height: 4,
  },
  obstower: {
    id: 'obstower', name: 'Observation Tower', cost: 1100, runningCost: 40,
    capacity: 18, duration: 260, excitement: 4.2, intensity: 1.0, nausea: 0.6,
    w: 2, h: 2, color: '#7f8c8d', kind: 'ride', category: 'gentle', defaultPrice: 4, reliability: 0.97, height: 10,
  },
  spacerings: {
    id: 'spacerings', name: 'Space Rings', cost: 480, runningCost: 22,
    capacity: 6, duration: 140, excitement: 3.4, intensity: 3.2, nausea: 2.6,
    w: 2, h: 2, color: '#3aa0a8', kind: 'ride', category: 'gentle', defaultPrice: 3, reliability: 0.97, height: 3,
  },
  // --- Thrill rides ---
  bumper: {
    id: 'bumper', name: 'Dodgems', cost: 600, runningCost: 35,
    capacity: 10, duration: 160, excitement: 4.1, intensity: 2.8, nausea: 1.8,
    w: 3, h: 2, color: '#3b82c4', kind: 'ride', category: 'thrill', defaultPrice: 3, reliability: 0.95, height: 1,
  },
  droptower: {
    id: 'droptower', name: 'Launched Freefall', cost: 750, runningCost: 40,
    capacity: 8, duration: 100, excitement: 6.5, intensity: 7.2, nausea: 4.5,
    w: 2, h: 2, color: '#c0392b', kind: 'ride', category: 'thrill', defaultPrice: 5, reliability: 0.93, height: 8,
  },
  swingship: {
    id: 'swingship', name: 'Swinging Ship', cost: 850, runningCost: 38,
    capacity: 16, duration: 170, excitement: 5.4, intensity: 4.6, nausea: 3.8,
    w: 3, h: 2, color: '#a3692c', kind: 'ride', category: 'thrill', defaultPrice: 4, reliability: 0.95, height: 5,
  },
  twist: {
    id: 'twist', name: 'Twist', cost: 650, runningCost: 32,
    capacity: 12, duration: 150, excitement: 4.9, intensity: 5.2, nausea: 4.8,
    w: 2, h: 2, color: '#c44b8e', kind: 'ride', category: 'thrill', defaultPrice: 4, reliability: 0.94, height: 2,
  },
  simulator: {
    id: 'simulator', name: 'Motion Simulator', cost: 900, runningCost: 42,
    capacity: 8, duration: 200, excitement: 5.0, intensity: 4.4, nausea: 4.0,
    w: 2, h: 2, color: '#4a69bd', kind: 'ride', category: 'thrill', defaultPrice: 5, reliability: 0.92, height: 3,
  },
  gokarts: {
    id: 'gokarts', name: 'Go-Karts', cost: 1000, runningCost: 50,
    capacity: 8, duration: 240, excitement: 5.8, intensity: 3.4, nausea: 1.2,
    w: 4, h: 3, color: '#6d6f2e', kind: 'ride', category: 'thrill', defaultPrice: 5, reliability: 0.94, height: 1,
  },
  // --- Coaster track types (stats computed from the built layout) ---
  'coaster-wooden': {
    id: 'coaster-wooden', name: 'Wooden Roller Coaster', cost: 0, runningCost: 60,
    capacity: 0, duration: 0, excitement: 0, intensity: 0, nausea: 0,
    w: 0, h: 0, color: '#9a6a38', kind: 'coaster', category: 'coaster', defaultPrice: 6, reliability: 0.90, height: 0,
  },
  'coaster-mini': {
    id: 'coaster-mini', name: 'Steel Mini Coaster', cost: 0, runningCost: 40,
    capacity: 0, duration: 0, excitement: 0, intensity: 0, nausea: 0,
    w: 0, h: 0, color: '#2e9c6a', kind: 'coaster', category: 'coaster', defaultPrice: 4, reliability: 0.95, height: 0,
  },
  'coaster-twister': {
    id: 'coaster-twister', name: 'Steel Twister', cost: 0, runningCost: 70,
    capacity: 0, duration: 0, excitement: 0, intensity: 0, nausea: 0,
    w: 0, h: 0, color: '#d8453e', kind: 'coaster', category: 'coaster', defaultPrice: 7, reliability: 0.92, height: 0,
  },
  // --- Stalls & facilities ---
  foodstall: {
    id: 'foodstall', name: 'Burger Bar', cost: 250, runningCost: 15,
    capacity: 0, duration: 0, excitement: 0, intensity: 0, nausea: 0,
    w: 1, h: 1, color: '#cf6b2d', kind: 'stall', category: 'stall', product: 'food', defaultPrice: 4, reliability: 1, height: 1,
  },
  friesstall: {
    id: 'friesstall', name: 'Fries Stall', cost: 220, runningCost: 14,
    capacity: 0, duration: 0, excitement: 0, intensity: 0, nausea: 0,
    w: 1, h: 1, color: '#d8b023', kind: 'stall', category: 'stall', product: 'food', defaultPrice: 3, reliability: 1, height: 1,
  },
  icecream: {
    id: 'icecream', name: 'Ice Cream Stall', cost: 220, runningCost: 14,
    capacity: 0, duration: 0, excitement: 0, intensity: 0, nausea: 0,
    w: 1, h: 1, color: '#e8a8c8', kind: 'stall', category: 'stall', product: 'food', defaultPrice: 2, reliability: 1, height: 1,
  },
  candyfloss: {
    id: 'candyfloss', name: 'Cotton Candy Stall', cost: 200, runningCost: 12,
    capacity: 0, duration: 0, excitement: 0, intensity: 0, nausea: 0,
    w: 1, h: 1, color: '#c87dd8', kind: 'stall', category: 'stall', product: 'food', defaultPrice: 2, reliability: 1, height: 1,
  },
  drinkstall: {
    id: 'drinkstall', name: 'Drink Stall', cost: 200, runningCost: 12,
    capacity: 0, duration: 0, excitement: 0, intensity: 0, nausea: 0,
    w: 1, h: 1, color: '#1f9c8a', kind: 'stall', category: 'stall', product: 'drink', defaultPrice: 2, reliability: 1, height: 1,
  },
  balloonstall: {
    id: 'balloonstall', name: 'Balloon Stall', cost: 180, runningCost: 10,
    capacity: 0, duration: 0, excitement: 0, intensity: 0, nausea: 0,
    w: 1, h: 1, color: '#e84d6f', kind: 'stall', category: 'stall', product: 'balloon', defaultPrice: 2, reliability: 1, height: 1,
  },
  toilets: {
    id: 'toilets', name: 'Toilets', cost: 150, runningCost: 8,
    capacity: 0, duration: 0, excitement: 0, intensity: 0, nausea: 0,
    w: 1, h: 1, color: '#88a8b8', kind: 'stall', category: 'stall', product: 'toilet', defaultPrice: 0, reliability: 1, height: 1,
  },
};

// Per-piece construction prices (multiplied by the coaster type's factor).
export const TRACK_PIECE_COST = {
  base: 40,
  turn: 12,
  slope: 18,
  steep: 32,
  bank: 8,
  chain: 14,
  brakes: 18,
  loop: 160,
  corkscrew: 120,
  station: 100,
};
