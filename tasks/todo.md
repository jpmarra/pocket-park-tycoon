# Pocket Park Tycoon — build plan

- [x] Scaffold: Vite + TS strict + Vitest + Playwright, pinned deps
- [x] Sim core: grid/paths, guests+needs+BFS, rides+queues+breakdowns,
      staff, coaster builder+physics, economy, clock, scenario, save/load
- [x] 33 unit tests green
- [x] Isometric canvas renderer + DOM HUD/panels + input (pan/zoom/tools)
- [x] Playwright self-play smoke tests against production build (2 tests)
- [x] Balance pass (rating needs ride variety; spawn capped by capacity)
- [x] GitHub Actions Pages workflow + README
- [ ] Push to GitHub + enable Pages (needs repo auth)

## Review
Vertical slice is fully playable: build paths/rides/coasters, guests with
needs ride and spend, staff manage litter/breakdowns, scenario win/lose,
save/load. Cut from full RCT scope: terrain elevation, ride entrances as
separate placements, loans/marketing, multiple trains/block brakes, peep
thoughts UI.
