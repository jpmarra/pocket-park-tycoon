import { describe, expect, it } from 'vitest';
import { createPark, buildPath, entranceTile, placeRide } from '../src/sim/grid';
import { findPath, queueTileFor } from '../src/sim/path';

describe('pathfinding', () => {
  it('finds a route along connected path tiles', () => {
    const s = createPark(7);
    const e = entranceTile(s);
    // Starter path goes up 8 tiles; extend it east 3 tiles at its end.
    const topY = e.y - 8;
    for (let x = e.x + 1; x <= e.x + 3; x++) buildPath(s, x, topY);
    const p = findPath(s, e.x, e.y, e.x + 3, topY);
    expect(p).not.toBeNull();
    expect(p![0]).toEqual({ x: e.x, y: e.y });
    expect(p![p!.length - 1]).toEqual({ x: e.x + 3, y: topY });
    // Path must be contiguous (each step is a 4-neighbour move).
    for (let i = 1; i < p!.length; i++) {
      const d = Math.abs(p![i].x - p![i - 1].x) + Math.abs(p![i].y - p![i - 1].y);
      expect(d).toBe(1);
    }
  });

  it('returns null when tiles are not connected', () => {
    const s = createPark(7);
    const e = entranceTile(s);
    buildPath(s, 2, 2); // isolated island
    expect(findPath(s, e.x, e.y, 2, 2)).toBeNull();
  });

  it('returns null when the target is grass', () => {
    const s = createPark(7);
    const e = entranceTile(s);
    expect(findPath(s, e.x, e.y, 1, 1)).toBeNull();
  });

  it('finds the queue tile adjacent to a ride footprint', () => {
    const s = createPark(7);
    const e = entranceTile(s);
    const ride = placeRide(s, 'carousel', e.x - 2, e.y - 5)!;
    const qt = queueTileFor(s, ride);
    expect(qt).not.toBeNull();
    // It must be a path tile touching the footprint perimeter.
    const t = s.grid[qt!.y * s.gridW + qt!.x];
    expect(t.kind).toBe('path');
  });

  it('returns no queue tile for an unreachable ride', () => {
    const s = createPark(7);
    const ride = placeRide(s, 'carousel', 2, 2)!; // far from any path
    expect(queueTileFor(s, ride)).toBeNull();
  });
});
