import { chromium } from '@playwright/test';
import { preview } from 'vite';
const server = await preview({ preview: { port: 4199 } });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('PAGE ERR:', e));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text()); });
await page.goto('http://localhost:4199/');
await page.waitForFunction(() => window.game !== undefined, undefined, { polling: 100 });
const ok = await page.evaluate(() => {
  const { api, ctx } = window.game;
  const s = ctx.s;
  s.cash = 20000;
  const ex = 18, ey = 35;
  for (let y = ey - 9; y >= 13; y--) api.buildPath(ex, y);
  for (let x = ex - 8; x <= ex + 8; x++) api.buildPath(x, ey - 12);
  for (let y = ey - 13; y >= ey - 18; y--) { api.buildPath(ex - 8, y); api.buildPath(ex + 8, y); }
  const r1 = api.placeRide('carousel', ex - 3, ey - 6);
  const r2 = api.placeRide('bumper', ex + 2, ey - 8);
  const r3 = api.placeRide('ferris', ex - 6, ey - 16);
  const r4 = api.placeRide('droptower', ex + 4, ey - 16);
  const r5 = api.placeRide('foodstall', ex - 1, ey - 11);
  const r6 = api.placeRide('drinkstall', ex + 1, ey - 13);
  // coaster loop NW, station (8,9), footprint (7..14, 9..13)
  for (let x = 15; x <= 18; x++) api.buildPath(x, 11);
  api.buildPath(18, 12);
  const r7 = api.buildDemoLoop(8, 9);
  api.hireStaff('handyman');
  api.hireStaff('mechanic');
  window.game.step(4500);
  return { r1, r2, r3, r4, r5, r6, r7, guests: s.guestCount };
});
console.log(JSON.stringify(ok));
const frame = async (tx, ty, zoom, name) => {
  await page.evaluate(([tx, ty, zoom]) => {
    const { ctx } = window.game;
    ctx.cam.zoom = zoom;
    const c = window.game.tileToScreen(tx, ty);
    ctx.cam.x += 720 - c.x;
    ctx.cam.y += 430 - c.y;
  }, [tx, ty, zoom]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `docs/${name}.png` });
};
await frame(17, 21, 1.15, 'showcase');
await frame(16, 27, 2.4, 'closeup-rides');
await frame(11, 11, 2.2, 'closeup-coaster');
await browser.close();
await server.close();
process.exit(0);
