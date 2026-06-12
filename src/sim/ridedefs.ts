import type { RideTypeDef } from './types';

// Prebuilt rides + stalls. The custom coaster gets its stats computed from its
// track layout in coaster.ts; the 'coaster' entry here only carries base costs.
export const RIDE_TYPES: Record<string, RideTypeDef> = {
  carousel: {
    id: 'carousel', name: 'Carousel', cost: 500, runningCost: 30,
    capacity: 12, duration: 120, excitement: 3.2, intensity: 1.5, nausea: 1.2,
    w: 2, h: 2, color: '#d4a017', kind: 'ride', defaultPrice: 3, reliability: 0.97, height: 2,
  },
  bumper: {
    id: 'bumper', name: 'Bumper Cars', cost: 600, runningCost: 35,
    capacity: 10, duration: 160, excitement: 4.1, intensity: 2.8, nausea: 1.8,
    w: 3, h: 2, color: '#3b82c4', kind: 'ride', defaultPrice: 3, reliability: 0.95, height: 1,
  },
  ferris: {
    id: 'ferris', name: 'Ferris Wheel', cost: 900, runningCost: 45,
    capacity: 16, duration: 220, excitement: 4.8, intensity: 1.8, nausea: 1.0,
    w: 3, h: 3, color: '#9b59b6', kind: 'ride', defaultPrice: 4, reliability: 0.96, height: 6,
  },
  droptower: {
    id: 'droptower', name: 'Drop Tower', cost: 750, runningCost: 40,
    capacity: 8, duration: 100, excitement: 6.5, intensity: 7.2, nausea: 4.5,
    w: 2, h: 2, color: '#c0392b', kind: 'ride', defaultPrice: 5, reliability: 0.93, height: 8,
  },
  foodstall: {
    id: 'foodstall', name: 'Burger Stall', cost: 250, runningCost: 15,
    capacity: 0, duration: 0, excitement: 0, intensity: 0, nausea: 0,
    w: 1, h: 1, color: '#e67e22', kind: 'stall', product: 'food', defaultPrice: 4, reliability: 1, height: 1,
  },
  drinkstall: {
    id: 'drinkstall', name: 'Drink Stall', cost: 200, runningCost: 12,
    capacity: 0, duration: 0, excitement: 0, intensity: 0, nausea: 0,
    w: 1, h: 1, color: '#16a085', kind: 'stall', product: 'drink', defaultPrice: 2, reliability: 1, height: 1,
  },
  coaster: {
    id: 'coaster', name: 'Roller Coaster', cost: 0, runningCost: 50,
    capacity: 8, duration: 0, excitement: 0, intensity: 0, nausea: 0,
    w: 0, h: 0, color: '#e74c3c', kind: 'coaster', defaultPrice: 6, reliability: 0.92, height: 0,
  },
};

export const TRACK_PIECE_COST: Record<string, number> = {
  station: 120,
  straight: 40,
  left: 50,
  right: 50,
  up: 60,
  down: 60,
};
