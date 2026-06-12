import type { ParkState } from './types';

// The entire sim state is plain data, so persistence is a JSON round-trip.
// localStorage access lives in the UI layer to keep the sim headless.

export const SAVE_VERSION = 2;

export function serialize(s: ParkState): string {
  return JSON.stringify(s);
}

export function deserialize(json: string): ParkState | null {
  try {
    const s = JSON.parse(json) as ParkState;
    if (typeof s !== 'object' || s === null) return null;
    if (s.version !== SAVE_VERSION) return null;
    if (!Array.isArray(s.grid) || typeof s.gridW !== 'number') return null;
    if (s.grid.length !== s.gridW * s.gridH) return null;
    return s;
  } catch {
    return null;
  }
}
