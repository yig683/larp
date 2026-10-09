// Genel bakış ekran görüntüleri: 8 kişilik gecede iki Kont'u DIŞARIDAN gösteren sabit kameralar.
//   npm run build && npx tsx tools/overview.ts <çıktı-klasörü>

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from '../server/index';
import { Bot } from './bot';

const outDir = path.resolve(process.argv[2] ?? 'shots-overview');
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const srv = await startServer({ port: 0, quiet: true, tuningFile: null, hostToken: 'tok', distDir: path.resolve('dist') });
const wsUrl = `ws://127.0.0.1:${srv.port}/ws`;
const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await (await browser.newContext({ viewport: { width: 1100, height: 620 } })).newPage();
const errs: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errs.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
await page.addInitScript(() => localStorage.setItem('tk.settings', JSON.stringify({ name: 'Ev', sid: 'sid-ev', quality: 'mid', tts: false, volume: 0.05, hints: false, sens: 1, toggleGrip: false, voice: false })));
const run = (body: string): Promise<void> => page.evaluate(`(() => { const T = window.__tk; ${body} })()`) as Promise<void>;
const shot = async (name: string): Promise<void> => {
  await page.screenshot({ path: path.join(outDir, name) });
  console.log('  ✔', name);
};
const hostSkip = (): void => {
  const host = Array.from(srv.room.players.values()).find((p) => p.host);
  if (host) srv.room.onMessage(host, { t: 'lobby', a: 'skip' });
};

await page.goto(`http://127.0.0.1:${srv.port}/?host=tok&debug=1`);
await page.waitForSelector('#nameinp');
await page.click('[data-act=join]');
await page.waitForFunction(() => (window as unknown as { __tk: { S: { phase: string } } }).__tk.S.phase === 'lobby');
const bots: Bot[] = [];
for (let i = 1; i < 8; i++) bots.push(await Bot.connect(wsUrl, `Bot${i}`));
await sleep(500);
await page.click('[data-act=start]');
await page.waitForFunction(() => (window as unknown as { __tk: { S: { phase: string } } }).__tk.S.phase === 'briefing');
await run('T.input.locked = true;');

async function toScene(id: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const sc = await page.evaluate(() => (window as unknown as { __tk: { S: { scene: { id: string } | null } } }).__tk.S.scene?.id);
    const ph = await page.evaluate(() => (window as unknown as { __tk: { S: { phase: string } } }).__tk.S.phase);
    if (sc === id && ph === 'playing') return;
    hostSkip();
    await sleep(600);
  }
  throw new Error('sahneye ulaşılamadı: ' + id);
}
const cam = (x: number, y: number, z: number, tx: number, ty: number, tz: number, fov = 60): Promise<void> => run(`T.S.debugCam = { x: ${x}, y: ${y}, z: ${z}, tx: ${tx}, ty: ${ty}, tz: ${tz}, fov: ${fov} };`);

// Karşılama: iki Kont halıda
await toScene('reception');
await sleep(1500);
await cam(0, 3.2, 3.0, 0, 1.6, 8.6, 62);
await shot('o1-reception-front.png');
await cam(-9, 4.5, 12, 0, 1.4, 4, 55);
await shot('o2-reception-wide.png');
await cam(-1.5, 2.2, 5.8, -3, 1.9, 8.6, 50);
await shot('o3-gustavo-close.png');

// Yemek: masa ve iki Kont
await toScene('dinner');
await sleep(1500);
await cam(0, 3.0, 1.8, 0, 1.6, -3, 66);
await shot('o4-dinner-front.png');
await cam(-6, 3.4, 2.4, -1.5, 1.7, -2.4, 52);
await shot('o5-dinner-side.png');

// Vals: iki Kont pistte
await toScene('waltz');
await sleep(1500);
await cam(0, 5.5, 8, 0, 1.2, 1, 62);
await shot('o6-waltz-wide.png');

for (const b of bots) b.close();
await browser.close();
await srv.close();
console.log(errs.length ? `\nTarayıcı hataları/uyarıları (${errs.length}):\n` + errs.slice(0, 10).join('\n') : '\nTarayıcıda hata yok.');
process.exit(0);
