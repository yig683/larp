// Görsel tur: tek kişilik modda gerçek istemciyi sürer, sunucu tarafında "servo" ile oynayarak
// yemek / vals sahnelerinin, sonuç ekranının, gazetenin ve panellerin ekran görüntüsünü alır.
//   npm run build && npx tsx tools/tour.ts <çıktı-klasörü> [kalite: low|mid|high]

import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { startServer } from '../server/index';
import type { CountRt, HandRt, PropRt } from '../server/entities';
import type { Game } from '../server/game';
import { dist3, fwdX, fwdZ, rightX, rightZ, type V3 } from '../shared/math';

const outDir = path.resolve(process.argv[2] ?? 'shots-tour');
const quality = process.argv[3] ?? 'mid';
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const srv = await startServer({ port: 0, quiet: true, tuningFile: null, hostToken: 'tok', distDir: path.resolve('dist') });
const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 1100, height: 620 } });
const page: Page = await ctx.newPage();
const errs: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errs.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
await page.addInitScript(
  (q) => localStorage.setItem('tk.settings', JSON.stringify({ name: 'Tur', sid: 'sid-tur', quality: q, tts: false, volume: 0.05, hints: true, sens: 1, toggleGrip: false })),
  quality,
);

const ev = <T>(expr: string): Promise<T> => page.evaluate(`(() => { const T = window.__tk; return (${expr}); })()`) as Promise<T>;
const run = (body: string): Promise<void> => page.evaluate(`(() => { const T = window.__tk; ${body} })()`) as Promise<void>;
const shot = async (name: string): Promise<void> => {
  await page.screenshot({ path: path.join(outDir, name) });
  console.log('  ✔', name);
};
const phaseIs = (ph: string) => page.waitForFunction((p) => (window as unknown as { __tk: { S: { phase: string } } }).__tk.S.phase === p, ph, { timeout: 60000 });
const hostSkip = (): void => {
  const host = Array.from(srv.room.players.values()).find((p) => p.host);
  if (host) srv.room.onMessage(host, { t: 'lobby', a: 'skip' });
};

await page.goto(`http://127.0.0.1:${srv.port}/?host=tok&debug=1`);
await page.waitForSelector('#nameinp');
await page.click('[data-act=join]');
await phaseIs('lobby');
await page.click('[data-act=solo]');
await phaseIs('briefing');
// sayfanın kendi girdisini sustur (servo sunucu tarafında oynuyor); fare kilidini taklit et
await run("const o = T.net.send.bind(T.net); T.net.send = (m) => (m.t === 'inp' ? undefined : o(m)); T.input.locked = true;");

/** Hedef sahnenin oyun fazına ilerler (sunucuda "atla" ile). */
async function toScene(id: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const sc = await ev<string | null>('T.S.scene && T.S.scene.id');
    const ph = await ev<string>('T.S.phase');
    if (sc === id && ph === 'playing') return;
    hostSkip();
    await sleep(600);
  }
  throw new Error('sahneye ulaşılamadı: ' + id);
}

// ---------------------------------------------------------------- servo yardımcıları

const game = (): Game => srv.room.game!;
const me = (): CountRt => game().counts[0]!;
const owner = (slot: 'handL' | 'handR' | 'head' | 'legs'): number => me().assign.slots[slot];
function localFor(c: CountRt, side: 0 | 1, w: V3): { x: number; y: number; f: number } {
  const sh = game().countSys.shoulder(c, side);
  const dx = w.x - sh.x;
  const dz = w.z - sh.z;
  return { x: dx * rightX(c.yaw) + dz * rightZ(c.yaw), y: w.y - sh.y, f: dx * fwdX(c.yaw) + dz * fwdZ(c.yaw) };
}
function reach(side: 0 | 1, w: V3, grip: boolean, slap = false): void {
  const l = localFor(me(), side, w);
  game().setInput(owner(side === 0 ? 'handL' : 'handR'), { t: 'inp', seq: 0, [side === 0 ? 'hl' : 'hr']: { x: l.x, y: l.y, f: l.f, grip, slap } });
}
function servoTip(side: 0 | 1, prop: PropRt, goal: V3, grip: boolean): void {
  const g = game();
  const h = me().hands[side];
  const cp = g.propSys.consumePoint(prop);
  const t = h.body.translation();
  reach(side, { x: goal.x - (cp.x - t.x), y: goal.y - (cp.y - t.y), z: goal.z - (cp.z - t.z) }, grip);
}
function findProp(kind: string, nearX: number): PropRt {
  let best: PropRt | null = null;
  let bd = 1e9;
  for (const p of game().props.values()) {
    if (p.kind.kind !== kind) continue;
    const d = Math.abs(p.body.translation().x - nearX);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best!;
}
const tick = (): Promise<void> => sleep(16);

/** Kaşığı çorbaya daldırıp doldurur. */
async function scoop(spoon: PropRt, bowl: PropRt): Promise<void> {
  const g = game();
  const t0 = Date.now();
  while (spoon.load < 0.95 && Date.now() - t0 < 15000) {
    const bp = bowl.body.translation();
    const cp = g.propSys.consumePoint(spoon);
    const above = Math.hypot(cp.x - bp.x, cp.z - bp.z) > 0.06;
    servoTip(1, spoon, { x: bp.x, y: bp.y + (above ? 0.16 : 0.0), z: bp.z }, true);
    await tick();
  }
}

// ---------------------------------------------------------------- 1) Karşılama (hızlıca)
await sleep(800);
await toScene('reception');
await sleep(1200);
await run("T.input.group = 'head'");
await shot('r1-head.png');
// misafirlere doğru yürü: bacak girdisi
game().setInput(owner('legs'), { t: 'inp', seq: 0, mz: 1, yaw: 0 });
await sleep(2500);
game().setInput(owner('legs'), { t: 'inp', seq: 0, mz: 0, yaw: 0 });
await shot('r2-head-walk.png');

// ---------------------------------------------------------------- 2) Akşam Yemeği
hostSkip(); // oyunu bitir
await sleep(3500);
await shot('r3-result.png');
await toScene('dinner');
await sleep(1500);
await run("T.input.group = 'head'");
await shot('d1-head.png');
await run("T.input.group = 'hands'");
await shot('d2-hands.png');
await run("T.input.group = 'legs'");
await shot('d3-legs.png');
await run("T.input.group = 'hands'");

{
  const g = game();
  const c = me();
  const spoon = findProp('spoon', c.x);
  const bowl = findProp('bowl', c.x);
  const hand: HandRt = c.hands[1];
  // kaşığa uzan
  let t0 = Date.now();
  while (hand.held !== spoon && Date.now() - t0 < 12000) {
    const sp = spoon.body.translation();
    reach(1, { x: sp.x, y: sp.y + 0.12, z: sp.z }, dist3(hand.body.translation(), sp) < 0.5);
    await tick();
  }
  await shot('d4-hands-grab.png');
  // çorbaya daldır
  await scoop(spoon, bowl);
  await shot('d5-hands-scoop.png');
  // kaşığı ağıza taşı: kafa ağzı açar
  t0 = Date.now();
  let shotNear = false;
  while (c.stats.soup < 0.9 && Date.now() - t0 < 15000) {
    const mp = g.countSys.mouthPos(c);
    servoTip(1, spoon, mp, true);
    g.setInput(owner('head'), { t: 'inp', seq: 0, mouth: true });
    if (!shotNear && dist3(g.propSys.consumePoint(spoon), mp) < 0.45) {
      shotNear = true;
      await run("T.input.group = 'head'");
      await shot('d6-head-spoon-near.png');
      await run("T.input.group = 'hands'");
    }
    await tick();
  }
  g.setInput(owner('head'), { t: 'inp', seq: 0, mouth: false });
  await sleep(300);
  await shot('d7-hands-after-eat.png');
  await run("T.input.group = 'head'");
  await shot('d8-head-after-eat.png');
  // ikinci kaşık: al, sonra şiddetle salla (dökülme + leke)
  await run("T.input.group = 'hands'");
  await scoop(spoon, bowl);
  const base = hand.body.translation();
  for (let k = 0; k < 14; k++) {
    reach(1, { x: base.x + (k % 2 === 0 ? 0.6 : -0.6), y: base.y + 0.3, z: base.z }, true);
    await sleep(160);
    if (k === 7) await shot('d9-hands-jerk.png');
  }
  await sleep(500);
  await shot('d10-hands-spilled.png');
  await run("T.input.group = 'head'");
  await shot('d11-head-spilled.png');
  await run("T.input.group = 'legs'");
  await shot('d12-legs.png');
}

// söylem çarkı: Düşes'in sorusu geldiyse çark açılır
{
  await run("T.input.group = 'head'");
  const t0 = Date.now();
  while ((await ev<number>('T.S.wheel.length')) === 0 && Date.now() - t0 < 25000) await sleep(300);
  await page.keyboard.down('KeyQ');
  await sleep(700);
  await page.mouse.move(560, 300);
  await page.mouse.move(600, 270);
  await sleep(500);
  await shot('d13-wheel.png');
  await page.keyboard.up('KeyQ');
  await sleep(1200);
  await shot('d14-after-say.png');
}

// ---------------------------------------------------------------- 3) Vals
await toScene('waltz');
await sleep(2500);
await run("T.input.group = 'head'");
await shot('w1-head.png');
await run("T.input.group = 'hands'");
await shot('w2-hands.png');
await run("T.input.group = 'legs'");
await shot('w3-legs.png');

// ---------------------------------------------------------------- sonuç, gazete, paneller
hostSkip();
await sleep(3500);
await shot('x1-result.png');
hostSkip(); // sonuç -> gece sonu
await phaseIs('nightEnd');
await sleep(1200);
await shot('x2-gazette.png');
await page.keyboard.press('F8');
await sleep(400);
await shot('x4-tuning.png');
await page.keyboard.press('F8');
await page.click('#gear');
await sleep(300);
await shot('x5-settings.png');

await browser.close();
await srv.close();
console.log(errs.length ? `\nTarayıcı hataları/uyarıları (${errs.length}):\n` + errs.slice(0, 20).join('\n') : '\nTarayıcıda hata yok.');
process.exit(0);
