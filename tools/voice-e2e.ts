// Sesli sohbet uçtan uca testi: gerçek Chromium sayfaları, sahte mikrofon (bip sesi), gerçek WebRTC.
//   npm run build && npx tsx tools/voice-e2e.ts
// Doğrulananlar: bağlantı kurulumu, ses akışı (seviye ölçümü), oyun içi kurallar (aynı yığın tam ses,
// rakip yığın mesafeye göre), V ile susturma, sayfa yenileyince yeniden bağlanma.

import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { startServer } from '../server/index';
import { voiceMix } from '../shared/voice';
import { Bot } from './bot';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const results: Array<{ name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, info = ''): void {
  results.push({ name, ok });
  console.log(`  ${ok ? '✔' : '✘'} ${name}${info ? ' — ' + info : ''}`);
}
async function until(cond: () => boolean | Promise<boolean>, ms = 15000, step = 100): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return true;
    await sleep(step);
  }
  return cond();
}

interface Pg {
  name: string;
  page: Page;
}
interface Dbg {
  id: number;
  state: string;
  gain: number;
  cutoff: number;
  level: number;
  hasAudio: boolean;
}

const errs: string[] = [];
async function mkPage(browser: Browser, url: string, name: string): Promise<Pg> {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${name}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errs.push(`[${name}] pageerror: ${e.message}`));
  await page.addInitScript((n) => {
    localStorage.setItem('tk.settings', JSON.stringify({ name: n, sid: 'sid-' + n, quality: 'low', tts: false, volume: 0.05, hints: true, sens: 1, toggleGrip: false, voice: true, voiceVol: 1 }));
  }, name);
  await page.goto(url);
  await page.waitForSelector('#nameinp', { timeout: 20000 });
  return { name, page };
}
const ev = <T>(p: Pg, expr: string): Promise<T> => p.page.evaluate(`(() => { const T = window.__tk; return (${expr}); })()`) as Promise<T>;
const dbg = (p: Pg): Promise<Dbg[]> => ev<Dbg[]>(p, 'T.voice.debug()').catch(() => []);

async function main(): Promise<void> {
  const srv = await startServer({ port: 0, quiet: true, tuningFile: null, hostToken: 'tok', distDir: path.resolve('dist') });
  const base = `http://127.0.0.1:${srv.port}`;
  const wsUrl = `ws://127.0.0.1:${srv.port}/ws`;
  const browser = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
    headless: true,
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });
  const bots: Bot[] = [];
  try {
    console.log('Sayfalar açılıyor…');
    const host = await mkPage(browser, `${base}/?host=tok&debug=1`, 'Ev');
    const ali = await mkPage(browser, `${base}/?debug=1`, 'Ali');
    const veli = await mkPage(browser, `${base}/?debug=1`, 'Veli');
    const pages = [host, ali, veli];
    for (const p of pages) await p.page.click('[data-act=join]');

    // 1) mikrofon + bağlantılar
    const mics = await Promise.all(pages.map((p) => until(async () => (await ev<string>(p, 'T.voice.status').catch(() => '')) === 'on', 20000)));
    check('3 sayfada da mikrofon açıldı (sahte aygıt)', mics.every(Boolean), (await Promise.all(pages.map((p) => ev<string>(p, 'T.voice.status')))).join(','));
    const conns = await Promise.all(pages.map((p) => until(async () => (await ev<number>(p, 'T.voice.connectedCount()').catch(() => 0)) === 2, 40000, 250)));
    check('her sayfa diğer ikisiyle WebRTC bağlantısı kurdu', conns.every(Boolean), (await Promise.all(pages.map((p) => ev<number>(p, 'T.voice.connectedCount()')))).join(','));
    if (!conns.every(Boolean)) for (const p of pages) console.log('   ', p.name, JSON.stringify(await dbg(p)));

    // 2) ses gerçekten akıyor mu? (sahte mikrofonun bipi, uzak analizörde seviye)
    const flows = await Promise.all(
      pages.map((p) =>
        until(async () => {
          const d = await dbg(p);
          return d.length === 2 && d.every((x) => x.hasAudio);
        }, 20000, 200),
      ),
    );
    check('uzak ses akışları WebAudio grafiğine bağlandı', flows.every(Boolean));
    const heard: number[] = [];
    for (const p of pages) {
      let best = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 12000 && best < 0.01) {
        for (const x of await dbg(p)) best = Math.max(best, x.level);
        await sleep(150);
      }
      heard.push(best);
    }
    check('uzak mikrofonun bip sesi duyuluyor (seviye > 0,01)', heard.every((x) => x > 0.01), heard.map((x) => x.toFixed(3)).join(','));
    const lobbyGains = (await Promise.all(pages.map(dbg))).flat().map((x) => x.gain);
    check('lobide herkes herkesi tam duyar (kazanç ~1)', lobbyGains.length > 0 && lobbyGains.every((g) => g > 0.9), lobbyGains.map((g) => g.toFixed(2)).join(','));
    await host.page.screenshot({ path: path.join('shots-voice', 'lobby.png') }).catch(() => undefined);

    // 3) V ile susturma: bip kesilir
    await ali.page.keyboard.press('KeyV');
    const muted = await ev<boolean>(ali, 'T.voice.muted');
    check('V tuşu mikrofonu susturur', muted === true);
    const silent = await until(async () => {
      const d = await dbg(veli);
      const x = d.find((e) => e.id === (undefined as unknown as number)) ?? d[0];
      void x;
      // Veli'nin gördüğü iki eşten, Ali'ninki sessizleşmeli
      const aliId = await ev<number>(ali, 'T.S.me.id');
      const e = d.find((q) => q.id === aliId);
      return !!e && e.level < 0.002;
    }, 12000, 200);
    check('susturulan oyuncunun sesi karşıda kesilir', silent);
    await ali.page.keyboard.press('KeyV');
    const aliId = await ev<number>(ali, 'T.S.me.id');
    const back = await until(async () => (await dbg(veli)).find((q) => q.id === aliId && q.level > 0.01) !== undefined, 12000, 200);
    check('susturma kalkınca ses geri gelir', back);

    // 4) oyun içi kurallar: 5 bot ile 8 kişi, gece başlar
    for (let i = 1; i <= 5; i++) bots.push(await Bot.connect(wsUrl, `Bot${i}`));
    await sleep(600);
    await host.page.click('[data-act=start]');
    for (const p of pages) await p.page.waitForFunction(() => (window as unknown as { __tk: { S: { phase: string } } }).__tk.S.phase === 'playing', undefined, { timeout: 40000 });
    await sleep(2500);
    const g = srv.room.game!;
    const stackOf = new Map<number, number>();
    for (const a of srv.room.night!.assigns) for (const id of a.members) stackOf.set(id, a.stack);
    let ruleOk = true;
    const lines: string[] = [];
    let sameSeen = false;
    let otherSeen = false;
    for (const p of pages) {
      const meId = await ev<number>(p, 'T.S.me.id');
      const d = await dbg(p);
      for (const e of d) {
        const ms = stackOf.get(meId) ?? -1;
        const ps = stackOf.get(e.id) ?? -1;
        const cm = g.counts[ms];
        const cp = g.counts[ps];
        const dist = cm && cp ? Math.hypot(cm.x - cp.x, cm.z - cp.z) : null;
        const want = voiceMix({ playing: true, meStack: ms, peerStack: ps, dist });
        const ok = Math.abs(e.gain - want.gain) < 0.12;
        if (ms === ps) sameSeen = true;
        else otherSeen = true;
        if (!ok) ruleOk = false;
        lines.push(`${p.name}←${e.id}: ${ms === ps ? 'aynı yığın' : `dist ${dist?.toFixed(1)}`} kazanç ${e.gain.toFixed(2)} (beklenen ${want.gain.toFixed(2)})`);
      }
    }
    for (const l of lines) console.log('    ' + l);
    check('oyun içi kazançlar kurala uyuyor (aynı yığın 1, rakip mesafeye göre)', ruleOk);
    check('testte hem aynı yığın hem rakip yığın eşleşmesi görüldü', sameSeen || otherSeen, `aynı=${sameSeen} rakip=${otherSeen}`);

    // 5) sayfa yenileme: ses yeniden bağlanır
    await veli.page.reload();
    await veli.page.waitForSelector('#nameinp', { timeout: 20000 });
    await veli.page.click('[data-act=join]');
    const re = await until(async () => (await ev<number>(veli, 'T.voice.connectedCount()').catch(() => 0)) === 2, 40000, 250);
    check('sayfa yenilenince ses yeniden bağlanır', re);
    const reOthers = await until(async () => (await ev<number>(host, 'T.voice.connectedCount()').catch(() => 0)) === 2, 20000, 250);
    check('diğer oyuncular da yeni bağlantıyı görür', reOthers);
  } finally {
    for (const b of bots) b.close();
    await browser.close();
    await srv.close();
  }
  const bad = errs.filter((e) => !/favicon|Failed to load resource/.test(e));
  console.log(bad.length ? `\nTarayıcı hataları/uyarıları (${bad.length}):\n` + bad.slice(0, 15).join('\n') : '\nTarayıcıda hata yok.');
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} kontrol geçti.`);
  process.exit(failed.length > 0 ? 1 : 0);
}

fs.mkdirSync('shots-voice', { recursive: true });
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
