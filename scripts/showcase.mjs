// Builds a fully-stocked showcase park against the production build and
// captures screenshots into docs/. Run: node scripts/showcase.mjs
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4199 } });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGE ERR:', e));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text()); });
await page.goto('http://localhost:4199/');
await page.waitForFunction(() => window.game !== undefined, undefined, { polling: 100 });

const result = await page.evaluate(() => {
  const { api, ctx } = window.game;
  const s = ctx.s;
  s.cash = 60000;
  const built = {};
  // Main street north + cross streets.
  for (let y = 4; y <= 26; y++) api.buildPath(18, y);
  for (let x = 8; x <= 28; x++) { api.buildPath(x, 30); api.buildPath(x, 24); }
  // Gentle rides around the y=30 street.
  built.carousel = api.placeRide('carousel', 14, 31);
  built.spiralslide = api.placeRide('spiralslide', 11, 31);
  built.haunted = api.placeRide('haunted', 24, 31);
  built.spacerings = api.placeRide('spacerings', 8, 31);
  built.ferris = api.placeRide('ferris', 20, 27);
  built.obstower = api.placeRide('obstower', 24, 27);
  // Thrill rides around the y=24 street.
  built.swingship = api.placeRide('swingship', 10, 22);
  built.twist = api.placeRide('twist', 14, 22);
  built.simulator = api.placeRide('simulator', 21, 22);
  built.droptower = api.placeRide('droptower', 24, 22);
  built.bumper = api.placeRide('bumper', 27, 22);
  built.gokarts = api.placeRide('gokarts', 10, 25);
  // Stalls along the main street.
  built.foodstall = api.placeRide('foodstall', 17, 28);
  built.drinkstall = api.placeRide('drinkstall', 19, 29);
  built.friesstall = api.placeRide('friesstall', 17, 26);
  built.icecream = api.placeRide('icecream', 19, 25);
  built.candyfloss = api.placeRide('candyfloss', 17, 21);
  built.balloonstall = api.placeRide('balloonstall', 19, 21);
  built.toilets = api.placeRide('toilets', 17, 19);
  // Coasters in the corners, connected to the street grid.
  for (let x = 15; x <= 17; x++) api.buildPath(x, 12);
  built.twisterCoaster = api.buildDesign('twister', 3, 10);
  for (let x = 19; x <= 22; x++) api.buildPath(x, 12);
  built.mouse = api.buildDesign('mouse-trap', 24, 10);
  for (let x = 15; x <= 17; x++) api.buildPath(x, 20);
  built.cyclone = api.buildDesign('cyclone', 6, 15);
  for (let x = 19; x <= 22; x++) api.buildPath(x, 18);
  built.comet = api.buildDesign('little-comet', 24, 16);
  for (let x = 16; x <= 17; x++) api.buildPath(x, 3);
  built.woodchip = api.buildDesign('woodchip', 3, 2);
  api.hireStaff('handyman');
  api.hireStaff('handyman');
  api.hireStaff('mechanic');
  api.hireStaff('mechanic');
  window.game.step(5000);
  return { built, guests: s.guestCount, cash: s.cash, rating: s.rating };
});
console.log(JSON.stringify(result));

const frame = async (tx, ty, zoom, name) => {
  await page.evaluate(([x, y, z]) => {
    const { ctx } = window.game;
    ctx.cam.zoom = z;
    const c = window.game.tileToScreen(x, y);
    ctx.cam.x += 720 - c.x;
    ctx.cam.y += 430 - c.y;
  }, [tx, ty, zoom]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `docs/${name}.png` });
};

await frame(18, 18, 0.85, 'screenshot');
await frame(8, 12, 1.7, 'closeup-coaster');
await frame(17, 24, 1.8, 'closeup-rides');
await browser.close();
await server.close();
process.exit(0);
