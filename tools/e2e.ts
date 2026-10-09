// Uçtan uca tarayıcı testi: 4 gerçek tarayıcı sayfası (ev sahibi + 3 arkadaş) + 4 bot, gerçek klavye/fare olayları.
// Her sayfa rolünü öğrenir, rolüne uygun girdiyi verir ve etkisi SUNUCU durumunda doğrulanır.
//   npm run build && npx tsx tools/e2e.ts [çıktı-klasörü]
// Hata varsa çıkış kodu 1.

import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { startServer } from '../server/index';
import type { CountRt } from '../server/entities';
import { Bot } from './bot';

const outDir = path.resolve(process.argv[2] ?? 'shots-e2e');
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const results: Array<{ name: string; ok: boolean; info: string }> = [];
function check(name: string, ok: boolean, info = ''): void {
  results.push({ name, ok, info });
  console.log(`  ${ok ? '✔' : '✘'} ${name}${info ? ' — ' + info : ''}`);
}

function chromePath(): string | undefined {
  for (const p of ['/opt/pw-browsers/chromium', process.env.CHROME_PATH ?? '']) if (p && fs.existsSync(p)) return p;
  return undefined;
}

interface Pg {
  name: string;
  page: Page;
  slots: string[];
  stack: number;
}

const errs: string[] = [];

async function mkPage(browser: Browser, url: string, name: string): Promise<Pg> {
  const ctx: BrowserContext = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${name}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errs.push(`[${name}] pageerror: ${e.message}`));
  await page.addInitScript((n) => {
    localStorage.setItem('tk.settings', JSON.stringify({ name: n, sid: 'sid-' + n, quality: 'low', tts: false, volume: 0.05, hints: true, sens: 1, toggleGrip: false }));
  }, name);
  await page.goto(url);
  await page.waitForSelector('#nameinp', { timeout: 20000 });
  return { name, page, slots: [], stack: -1 };
}

/** Koşul sağlanana kadar bekler (yavaş başsız makinede sabit uyku yerine yoklama). */
async function until(cond: () => boolean | Promise<boolean>, ms = 5000, step = 50): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return true;
    await sleep(step);
  }
  return cond();
}

const ev = <T>(p: Pg, expr: string): Promise<T> => p.page.evaluate(`(() => { const T = window.__tk; return (${expr}); })()`) as Promise<T>;
const run = (p: Pg, body: string): Promise<void> => p.page.evaluate(`(() => { const T = window.__tk; ${body} })()`) as Promise<void>;

async function main(): Promise<void> {
  const srv = await startServer({ port: 0, quiet: true, tuningFile: null, hostToken: 'tok', distDir: path.resolve('dist') });
  const base = `http://127.0.0.1:${srv.port}`;
  const wsUrl = `ws://127.0.0.1:${srv.port}/ws`;
  const browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const bots: Bot[] = [];
  try {
    console.log('Sayfalar açılıyor…');
    const host = await mkPage(browser, `${base}/?host=tok&debug=1`, 'Ev');
    const pages: Pg[] = [host];
    for (const n of ['Ali', 'Veli', 'Can']) pages.push(await mkPage(browser, `${base}/?debug=1`, n));
    for (const p of pages) await p.page.click('[data-act=join]');
    await Promise.all(pages.map((p) => p.page.waitForFunction(() => (window as unknown as { __tk: { S: { phase: string } } }).__tk.S.phase === 'lobby', undefined, { timeout: 15000 })));
    for (let i = 1; i <= 4; i++) bots.push(await Bot.connect(wsUrl, `Bot${i}`));
    await sleep(600);
    const lobbyCount = await ev<number>(host, 'T.S.players.length');
    check('lobi: 8 oyuncu her sayfada görünür', lobbyCount === 8, `ev sahibi ${lobbyCount} oyuncu görüyor`);
    const friendCount = await ev<number>(pages[1]!, 'T.S.players.length');
    check('lobi: arkadaş sayfası da 8 oyuncu görür', friendCount === 8, String(friendCount));
    const friendHost = await ev<boolean>(pages[1]!, 'T.S.me.host');
    check('lobi: arkadaş ev sahibi değildir', friendHost === false);
    await host.page.screenshot({ path: path.join(outDir, '01-lobby.png') });

    await host.page.click('[data-act=start]');
    await Promise.all(pages.map((p) => p.page.waitForFunction(() => (window as unknown as { __tk: { S: { phase: string } } }).__tk.S.phase === 'briefing', undefined, { timeout: 15000 })));
    await host.page.screenshot({ path: path.join(outDir, '02-briefing.png') });
    // brifing en çok 8 sn sürer; yavaş makinede 'Hemen başlat' düğmesi kaybolmuş olabilir, doğal geçişi bekle
    await Promise.all(pages.map((p) => p.page.waitForFunction(() => (window as unknown as { __tk: { S: { phase: string } } }).__tk.S.phase === 'playing', undefined, { timeout: 40000 })));
    for (const p of pages) {
      await run(p, 'T.input.locked = true');
      p.slots = await ev<string[]>(p, 'T.S.mySlots');
      p.stack = await ev<number>(p, 'T.S.myStack');
    }
    console.log('  roller:', pages.map((p) => `${p.name}=${p.stack}/${p.slots.join('+')}`).join(' · '));
    check('her sayfanın tek rolü ve yığını var', pages.every((p) => p.slots.length === 1 && p.stack >= 0));
    await sleep(1500);

    const g = srv.room.game!;
    const cOf = (p: Pg): CountRt => g.counts[p.stack]!;

    // ---- rolüne göre gerçek girdi
    const sayEvents: string[] = [];
    const origEmit = g.emit.bind(g);
    g.emit = (e) => {
      if (e.k === 'say') sayEvents.push(String(e.text));
      origEmit(e);
    };

    for (const p of pages) {
      const role = p.slots[0]!;
      const c = cOf(p);
      if (role === 'legs') {
        const z0 = c.z;
        await p.page.keyboard.down('KeyW');
        const walked = await until(() => z0 - c.z > 1.0, 6000);
        await p.page.keyboard.up('KeyW');
        check(`${p.name} (Bacaklar): W tuşu Kont'u yürütür`, walked, `z ${z0.toFixed(2)} → ${c.z.toFixed(2)}`);
        const yaw0 = c.yaw;
        let mx = 300;
        const turned = await until(async () => {
          mx += 10;
          await p.page.mouse.move(mx, 180);
          return Math.abs(c.yaw - yaw0) > 0.05;
        }, 6000, 40);
        check(`${p.name} (Bacaklar): fare Kont'u döndürür`, turned, `yaw ${yaw0.toFixed(2)} → ${c.yaw.toFixed(2)}`);
        await p.page.keyboard.down('Space');
        const bowed = await until(() => c.bow > 0.3, 4000);
        await p.page.keyboard.up('Space');
        check(`${p.name} (Bacaklar): Boşluk reverans yaptırır`, bowed, `bow ${c.bow.toFixed(2)}`);
      } else if (role === 'head') {
        await p.page.mouse.down();
        const opened = await until(() => c.mouth > 0.6, 5000);
        await p.page.mouse.up();
        check(`${p.name} (Kafa): sol tık ağzı açar`, opened, `ağız ${c.mouth.toFixed(2)}`);
        const hy0 = c.input.hyaw;
        let mx = 200;
        const turned = await until(async () => {
          mx += 12;
          await p.page.mouse.move(mx, 180);
          return Math.abs(c.input.hyaw - hy0) > 0.05;
        }, 6000, 40);
        check(`${p.name} (Kafa): fare başı çevirir`, turned, `hyaw ${hy0.toFixed(2)} → ${c.input.hyaw.toFixed(2)}`);
        // söylem çarkı
        await p.page.keyboard.down('KeyQ');
        const open = await until(() => ev<boolean>(p, 'T.input.wheelOpen'), 4000);
        let k = 0;
        const picked = await until(async () => {
          k++;
          await p.page.mouse.move(320 + k * 8, 180 - k * 12);
          return (await ev<number>(p, 'T.input.wheelSel')) >= 0;
        }, 6000, 60);
        await p.page.screenshot({ path: path.join(outDir, `wheel-${p.name}.png`) });
        const sel = await ev<number>(p, 'T.input.wheelSel');
        const before = sayEvents.length;
        await p.page.keyboard.up('KeyQ');
        const spoke = await until(() => sayEvents.length > before, 5000);
        check(`${p.name} (Kafa): Q çarkı açar, seçip bırakınca konuşur`, open && picked && spoke, `açık=${open} seçim=${sel} söz=${sayEvents.slice(before).join('|')}`);
      } else if (role === 'handL' || role === 'handR') {
        const side = role === 'handL' ? 0 : 1;
        const h = c.hands[side]!;
        const p0 = h.body.translation();
        let k = 0;
        const moved = await until(async () => {
          k++;
          await p.page.mouse.move(300 - k * 6, 180 + k * 4);
          const q = h.body.translation();
          return Math.hypot(q.x - p0.x, q.y - p0.y, q.z - p0.z) > 0.08;
        }, 8000, 40);
        const p1 = h.body.translation();
        check(`${p.name} (${role}): fare eli oynatır`, moved, `Δ=${Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z).toFixed(2)} m`);
        await p.page.mouse.down();
        const gripOn = await until(() => h.input.grip === true, 4000);
        await p.page.mouse.up();
        const gripOff = await until(() => h.input.grip === false, 4000);
        check(`${p.name} (${role}): sol tık basılıyken tutma açık, bırakınca kapanır`, gripOn && gripOff, `açıldı=${gripOn} kapandı=${gripOff}`);
        await p.page.mouse.down({ button: 'right' });
        await p.page.mouse.up({ button: 'right' });
        const slapped = await until(() => h.slapT > 0 || h.slapCd > 0, 4000, 20);
        check(`${p.name} (${role}): sağ tık tokat başlatır`, slapped, `slapCd=${h.slapCd.toFixed(2)}`);
      }
    }
    for (const p of pages) await p.page.screenshot({ path: path.join(outDir, `play-${p.name}.png`) });

    // ---- sayfa yenileme: aynı kimlikle geri gelir, rolü korur
    const rp = pages[1]!;
    await rp.page.reload();
    await rp.page.waitForSelector('#nameinp', { timeout: 20000 });
    await rp.page.click('[data-act=join]');
    const back2 = await until(async () => (await ev<string>(rp, 'T.S.phase').catch(() => '')) === 'playing', 30000, 250);
    const slots2 = await ev<string[]>(rp, 'T.S.mySlots').catch(() => []);
    const dbg = await ev<string>(rp, 'JSON.stringify({ phase: T.S.phase, err: T.S.err, connected: T.S.connected, id: T.S.me.id })').catch(() => '?');
    check('sayfa yenilenince aynı rolle oyuna döner', back2 && slots2.join() === rp.slots.join(), `${rp.slots.join()} → ${slots2.join()} ${dbg}`);

    // ---- palto patlaması: tüm çaylaklar tarayıcıdan (WASD + E) yeniden yığılır
    const target = pages[0]!;
    const members = Array.from(new Set(cOf(target).assign.members));
    const stackPages = pages.filter((p) => p.stack === target.stack);
    const stackBots = bots.filter((b) => members.includes(b.id));
    check('patlama testi: yığında en az bir gerçek sayfa var', stackPages.length >= 1);
    const cc = cOf(target);
    // bu test girdi hattını sınar; yavaş başsız sayfalarda muhafızlar haksız avantaj kazanır
    g.tuning.guardCount = 0;
    g.addSusp(target.stack, 500, 'e2e', cc.x, cc.z, true);
    const inKid = await until(() => ev<boolean>(target, 'T.S.inKidMode'), 15000, 100);
    check('patlama: sayfa çaylak moduna geçer', inKid);
    await target.page.screenshot({ path: path.join(outDir, 'burst-kid.png') });
    for (const b of stackBots) b.autoplay();
    // gerçek sayfalar: paltoya doğru yürü (yaw'u elle ayarlayıp W + E)
    const pile = { x: cc.pileX, z: cc.pileZ };
    const tick = setInterval(() => {
      void (async () => {
        for (const p of stackPages) {
          const me = await ev<{ x: number; z: number } | null>(
            p,
            "(() => { const k = T.ents.kidOf(T.S.me.id); return k ? { x: k.x, z: k.z } : null; })()",
          ).catch(() => null);
          if (!me) continue;
          const d = Math.hypot(pile.x - me.x, pile.z - me.z);
          const yaw = Math.atan2(-(pile.x - me.x), -(pile.z - me.z));
          await run(p, `T.input.kidYaw = ${yaw};`).catch(() => undefined);
          if (d > 1.1) await p.page.keyboard.down('KeyW').catch(() => undefined);
          else await p.page.keyboard.up('KeyW').catch(() => undefined);
          if (d < 1.7) await p.page.keyboard.down('KeyE').catch(() => undefined);
        }
      })();
    }, 150);
    const t0 = Date.now();
    let dbgT = 0;
    while (cc.mode !== 'stacked' && Date.now() - t0 < 30000) {
      await sleep(200);
      if (process.env.E2E_DEBUG && Date.now() - dbgT > 2000) {
        dbgT = Date.now();
        console.log('   botlar:', stackBots.map((b) => `${b.name} id=${b.id} kidId=${b.kidId} kidStack=${b.kidStack} faz=${b.phase} pile=${JSON.stringify(b.piles.get(b.kidStack))} chars=${b.snap?.chars.length} kidChar=${JSON.stringify(b.snap?.chars.find((c) => c.id === b.kidId))}`).join(' | '));
        console.log('   kids:', Array.from(g.kids.values()).map((k) => `${k.name}(${k.x.toFixed(1)},${k.z.toFixed(1)}) use=${k.use} mz=${k.mz} caught=${k.caughtUntil > g.time}`).join(' | '), `pile=(${pile.x.toFixed(1)},${pile.z.toFixed(1)}) restack=${cc.restack.toFixed(2)}`);
      }
    }
    clearInterval(tick);
    check('patlama: çaylaklar (gerçek tarayıcı girdisiyle) yeniden yığılır', cc.mode === 'stacked', `mod=${cc.mode} ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
    const back = await until(async () => !(await ev<boolean>(target, 'T.S.inKidMode')), 15000, 100);
    check('yeniden yığılma: sayfa çaylak modundan çıkar', back);
    await target.page.screenshot({ path: path.join(outDir, 'restacked.png') });
  } finally {
    for (const b of bots) b.close();
    await browser.close();
    await srv.close();
  }
  const bad = errs.filter((e) => !/favicon|Failed to load resource/.test(e));
  console.log(bad.length ? `\nTarayıcı hataları/uyarıları (${bad.length}):\n` + bad.slice(0, 20).join('\n') : '\nTarayıcıda hata yok.');
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} kontrol geçti.`);
  process.exit(failed.length > 0 || bad.some((e) => e.includes('pageerror')) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
