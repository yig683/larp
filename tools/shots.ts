// Başsız tarayıcıda gerçek istemciyi sürer ve ekran görüntüsü alır (görsel duman testi).
// Kullanım: npx tsx tools/shots.ts <çıktı-klasörü> [senaryo: full8 | solo | kid]
// Sunucu, derlenmiş istemciyi (dist/) servis eder: önce `npm run build`.

import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { startServer } from '../server/index';
import { Bot } from './bot';

const outDir = path.resolve(process.argv[2] ?? 'shots');
const scenario = process.argv[3] ?? 'solo';
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function chromePath(): string | undefined {
  for (const p of ['/opt/pw-browsers/chromium', process.env.CHROME_PATH ?? '']) if (p && fs.existsSync(p)) return p;
  return undefined;
}

interface Hook {
  S: { phase: string; myStack: number; mySlots: string[]; players: unknown[]; hud: unknown; inKidMode: boolean };
  input: { group: string; locked: boolean; activeHand: number; wheelOpen: boolean; wheelSel: number; hand: Array<{ x: number; y: number; f: number }>; grip: boolean[] };
  ents: { counts: Map<number, unknown> };
}

async function mkPage(ctx: BrowserContext, url: string, name: string, errs: string[]): Promise<Page> {
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${name}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errs.push(`[${name}] pageerror: ${e.message}`));
  await page.addInitScript((n) => {
    localStorage.setItem('tk.settings', JSON.stringify({ name: n, sid: 'sid-' + n, quality: 'mid', tts: false, volume: 0.1, hints: true, sens: 1, toggleGrip: false }));
  }, name);
  await page.goto(url);
  return page;
}

// tek ifade değerlendirir ve değerini döndürür
const evalTk = <T>(page: Page, fn: string): Promise<T> => page.evaluate(`(() => { const T = window.__tk; return (${fn}); })()`) as Promise<T>;
// birden çok deyim çalıştırır (dönüş değeri yok)
const runTk = (page: Page, body: string): Promise<void> => page.evaluate(`(() => { const T = window.__tk; ${body} })()`) as Promise<void>;

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(outDir, name) });
  console.log('  ✔', name);
}

async function main(): Promise<void> {
  const srv = await startServer({ port: 0, quiet: true, tuningFile: null, hostToken: 'tok', distDir: path.resolve('dist') });
  const base = `http://127.0.0.1:${srv.port}`;
  const wsUrl = `ws://127.0.0.1:${srv.port}/ws`;
  const errs: string[] = [];
  const browser: Browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 620 } });
  try {
    const host = await mkPage(ctx, `${base}/?host=tok&debug=1`, 'Ayse', errs);
    await host.waitForSelector('#nameinp', { timeout: 20000 });
    await shot(host, '01-menu.png');
    await host.click('[data-act=join]');
    await host.waitForFunction(() => (window as unknown as { __tk: Hook }).__tk.S.phase === 'lobby', undefined, { timeout: 15000 });
    await sleep(400);

    const bots: Bot[] = [];
    if (scenario === 'full8') {
      for (let i = 1; i < 8; i++) bots.push(await Bot.connect(wsUrl, `Bot${i}`));
      await sleep(600);
    }
    await shot(host, '02-lobby.png');

    await host.click(scenario === 'full8' ? '[data-act=start]' : '[data-act=solo]');
    await host.waitForFunction(() => (window as unknown as { __tk: Hook }).__tk.S.phase === 'briefing', undefined, { timeout: 15000 });
    await sleep(1500);
    await shot(host, '03-briefing.png');

    // fare kilidini sahte kilitle (başsız ortamda gerçek kilit yok)
    await runTk(host, 'T.input.locked = true');
    await host.keyboard.press('Tab').catch(() => undefined);
    srvHostSkip(srv);
    await host.waitForFunction(() => (window as unknown as { __tk: Hook }).__tk.S.phase === 'playing', undefined, { timeout: 15000 });
    for (const b of bots) b.autoplay();
    await sleep(2500);

    const mySlots = await evalTk<string[]>(host, 'T.S.mySlots');
    console.log('  roller:', mySlots.join(','), '· grup:', await evalTk<string>(host, 'T.input.group'));
    await shot(host, '04-play-a.png');

    if (scenario === 'solo') {
      // eller görünümü: sağ eli tabağa uzat
      await runTk(host, "T.input.group = 'hands'");
      await runTk(host, 'T.input.hand[1].x = -0.2; T.input.hand[1].y = -0.3; T.input.hand[1].f = 1.0');
      await sleep(1500);
      await shot(host, '05-hands.png');
      await runTk(host, "T.input.group = 'legs'");
      await sleep(900);
      await shot(host, '06-legs.png');
      await runTk(host, "T.input.group = 'body'");
      // kafa görünümüne dön ve aşağı bak (masa)
      await runTk(host, 'T.input.headPitch = -0.35');
      await sleep(900);
      await shot(host, '07-head-down.png');
    } else {
      await sleep(1500);
      await shot(host, '05-play-b.png');
      // izleyici sayfası: ikinci bir tarayıcı sekmesi
    }
    if (scenario === 'kid') {
      /* ayrı senaryo: patlatma */
    }

    // Şüpheyi doldurup patlat (kid senaryosu için sunucu içinden)
    const g = srv.room.game;
    if (g && (scenario === 'kid' || scenario === 'solo')) {
      const c = g.counts[0]!;
      g.addSusp(0, 200, 'test', c.x, c.z, true);
      await sleep(2500);
      await shot(host, '08-burst-kid.png');
      // yeniden yığıl
      for (const k of g.kids.values()) g.setInput(k.playerId, { t: 'inp', seq: 9, use: true });
      for (const gd of g.guards.values()) {
        gd.body.setTranslation({ x: 13, y: 1, z: 9 }, true);
        gd.x = 13;
        gd.z = 9;
      }
    }
    await sleep(500);
    await shot(host, '09-after.png');
    for (const b of bots) b.close();
  } finally {
    await browser.close();
    await srv.close();
  }
  console.log(errs.length ? `\nTarayıcı hataları/uyarıları (${errs.length}):\n` + errs.slice(0, 20).join('\n') : '\nTarayıcıda hata yok.');
  process.exit(errs.some((e) => e.includes('pageerror')) ? 1 : 0);
}

function srvHostSkip(srv: { room: { game: unknown; onMessage: (p: never, m: never) => void; players: Map<number, unknown> } }): void {
  const host = Array.from(srv.room.players.values()).find((p) => (p as { host: boolean }).host);
  if (host) srv.room.onMessage(host as never, { t: 'lobby', a: 'skip' } as never);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
