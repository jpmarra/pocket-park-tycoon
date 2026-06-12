import { expect, test } from '@playwright/test';

// Self-play smoke test against the production build:
// start a park, lay paths, place a ride via the real UI, run the clock fast,
// and verify guests arrive, ride, and money moves — with zero console errors.

test('self-play: build, simulate, guests ride, money flows, no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('/');
  await expect(page.locator('#stat-cash')).toContainText('$');
  await page.waitForFunction(() => window.game !== undefined, undefined, { polling: 100 });

  const startCash = await page.evaluate(() => window.game.ctx.s.cash);
  expect(startCash).toBe(20000);

  // --- Lay two path tiles east of the starter path via real canvas clicks ---
  await page.locator('button[data-tool="path"]').click();
  for (const [tx, ty] of [[19, 30], [20, 30]] as const) {
    const pt = await page.evaluate(([x, y]) => window.game.tileToScreen(x, y), [tx, ty]);
    await page.mouse.click(pt.x, pt.y);
  }
  const afterPaths = await page.evaluate(() => window.game.ctx.s.cash);
  expect(afterPaths).toBe(startCash - 20);

  // --- Place a carousel next to the starter path (via the Gentle menu) ---
  await page.locator('#toolbar button', { hasText: 'Gentle' }).click();
  await page.locator('#sidepanel button[data-build="carousel"]').click();
  const ridePt = await page.evaluate(() => window.game.tileToScreen(16, 30));
  await page.mouse.click(ridePt.x, ridePt.y);
  const rideInfo = await page.evaluate(() => {
    const rides = Object.values(window.game.ctx.s.rides);
    return rides.length > 0 ? { id: rides[0].id, name: rides[0].name } : null;
  });
  expect(rideInfo).not.toBeNull();
  const afterRide = await page.evaluate(() => window.game.ctx.s.cash);
  expect(afterRide).toBe(afterPaths - 500);

  // --- Hire a mechanic so breakdowns get repaired during the long sim run ---
  await page.locator('button', { hasText: 'Mechanic' }).click();
  const staffCount = await page.evaluate(() => Object.keys(window.game.ctx.s.staff).length);
  expect(staffCount).toBe(1);

  // --- Fast-forward the clock; prove the live sim advances on its own ---
  await page.locator('#speed-4').click();
  const t0 = await page.evaluate(() => window.game.ctx.s.tick);
  await page.waitForFunction(
    (t) => window.game.ctx.s.tick > t, t0,
    { timeout: 30_000, polling: 100 },
  );

  // Then push the sim hard so the smoke test stays fast and immune to
  // background-page timer throttling: the sim core is deterministic and
  // headless, so stepping it directly is equivalent to waiting at fast speed.
  await page.evaluate(() => window.game.step(6000));

  const result = await page.evaluate((rid) => {
    const s = window.game.ctx.s;
    return {
      guests: s.guestCount,
      totalGuestsEver: s.totalGuestsEver,
      riders: s.rides[rid]?.totalRiders ?? 0,
      cash: s.cash,
      rating: s.rating,
      tick: s.tick,
      entryIncome: s.finances.entryIncome,
      rideIncome: s.finances.rideIncome,
    };
  }, rideInfo!.id);

  expect(result.totalGuestsEver).toBeGreaterThan(0);
  expect(result.riders).toBeGreaterThan(0); // guests actually rode the ride
  expect(result.entryIncome).toBeGreaterThan(0); // entry fees collected
  expect(result.rideIncome).toBeGreaterThan(0); // tickets sold
  expect(result.cash).not.toBe(afterRide); // money changed
  expect(result.tick).toBeGreaterThan(6000);

  // --- HUD reflects the sim ---
  await expect(page.locator('#stat-guests')).toContainText(String(result.guests));
  await expect(page.locator('#stat-cash')).toContainText('$');

  // --- Save works ---
  await page.locator('#btn-save').click();
  await expect(page.locator('#ticker')).toContainText('Park saved');

  // --- Ride panel opens via select tool ---
  await page.locator('button[data-tool="select"]').click();
  await page.mouse.click(ridePt.x, ridePt.y);
  await expect(page.locator('#sidepanel')).toBeVisible();
  await expect(page.locator('#sidepanel h3')).toContainText('Merry-Go-Round');

  // --- Screenshot the running game (HUD + built ride visible) ---
  await page.screenshot({ path: 'test-results/game-screenshot.png' });

  expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0);
});

test('pre-built coaster design builds and runs trains', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('/');
  await page.waitForFunction(() => window.game !== undefined, undefined, { polling: 100 });

  // Pick the Little Comet design from the Coasters menu and place it west of
  // the starter path, station row adjacent.
  await page.locator('#toolbar button', { hasText: 'Coasters' }).click();
  await page.locator('#sidepanel button[data-build="little-comet"]').click();
  const pt = await page.evaluate(() => window.game.tileToScreen(11, 28));
  await page.mouse.click(pt.x, pt.y);

  const built = await page.evaluate(() => {
    const rides = Object.values(window.game.ctx.s.rides);
    const c = rides.find((r) => r.track !== undefined);
    return c ? { id: c.id, pieces: c.track?.length ?? 0, excitement: c.excitement, name: c.name } : null;
  });
  expect(built).not.toBeNull();
  expect(built!.pieces).toBe(22);
  expect(built!.name).toContain('Little Comet');
  expect(built!.excitement).toBeGreaterThan(1);

  // The loop's footprint (x 10..17) sits right beside the starter path
  // column at x=18, so guests can already reach its queue tile.
  // A mechanic keeps the coaster running through breakdowns.
  await page.locator('button', { hasText: 'Mechanic' }).click();
  await page.locator('#speed-4').click();
  const t0 = await page.evaluate(() => window.game.ctx.s.tick);
  await page.waitForFunction(
    (t) => window.game.ctx.s.tick > t, t0,
    { timeout: 30_000, polling: 100 },
  );
  await page.evaluate(() => window.game.step(8000));

  const after = await page.evaluate((rid) => ({
    riders: window.game.ctx.s.rides[rid]?.totalRiders ?? 0,
    everGuests: window.game.ctx.s.totalGuestsEver,
  }), built!.id);
  expect(after.everGuests).toBeGreaterThan(0);
  expect(after.riders).toBeGreaterThan(0);

  await page.screenshot({ path: 'test-results/coaster-screenshot.png' });

  expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0);
});
