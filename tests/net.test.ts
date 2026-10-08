import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Bot } from '../tools/bot';
import { startServer, type RunningServer } from '../server/index';
import { CF } from '../shared/protocol';

let srv: RunningServer;
let url: string;
const bots: Bot[] = [];

beforeAll(async () => {
  srv = await startServer({ port: 0, tuningFile: null, quiet: true, distDir: '/nonexistent', hostToken: 'testtoken' });
  url = `ws://127.0.0.1:${srv.port}/ws`;
}, 60000);

afterAll(async () => {
  for (const b of bots) b.close();
  await srv.close();
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('Ağ: 8 bot, tam gece', () => {
  it('sürüm uyuşmazlığı reddedilir', async () => {
    const b = await Bot.connect(url, 'Eski', { version: 999 });
    await b.waitFor(() => b.err.length > 0 || b.closed, 3000, 'sürüm hatası');
    expect(b.err).toContain('Sürüm');
    b.close();
  });

  it('8 bot katılır, ev sahibi başlatır, roller 2x4 dağılır', async () => {
    const host = await Bot.connect(url, 'Ev', { hostToken: 'testtoken' });
    bots.push(host);
    for (let i = 1; i < 8; i++) bots.push(await Bot.connect(url, `Misafir${i}`));
    await Promise.all(bots.map((b) => b.waitFor(() => b.id > 0, 4000, 'welcome')));
    expect(host.host).toBe(true);
    expect(bots[1]!.host).toBe(false);
    await host.waitFor(() => host.players.length === 8, 3000, '8 oyuncu');

    // Ev sahibi olmayan başlatamaz
    bots[1]!.send({ t: 'lobby', a: 'start' });
    await sleep(150);
    expect(host.phase).toBe('lobby');

    host.send({ t: 'lobby', a: 'start' });
    await Promise.all(bots.map((b) => b.waitFor(() => b.phase === 'briefing' && b.scene !== null, 5000, 'brifing')));
    expect(host.scene!.id).toBe('reception');
    expect(host.assign).toHaveLength(2);
    const owners = new Set<number>();
    for (const a of host.assign) for (const id of Object.values(a.slots)) owners.add(id);
    expect(owners.size).toBe(8);
    for (const b of bots) expect(b.mySlots().length).toBeGreaterThan(0);
  }, 30000);

  it('oyun başlar; snapshotlar ~20 Hz akar; HUD gelir', async () => {
    const host = bots[0]!;
    host.send({ t: 'lobby', a: 'skip' }); // brifing'i atla
    await Promise.all(bots.map((b) => b.waitFor(() => b.phase === 'playing', 4000, 'oyun')));
    for (const b of bots) b.autoplay();
    const t0 = Date.now();
    const c0 = bots.map((b) => b.snapCount);
    await sleep(3000);
    const dt = (Date.now() - t0) / 1000;
    for (let i = 0; i < bots.length; i++) {
      const rate = (bots[i]!.snapCount - c0[i]!) / dt;
      expect(rate).toBeGreaterThan(14);
      expect(rate).toBeLessThan(26);
    }
    expect(host.hud).not.toBeNull();
    expect(host.hud!.stacks).toHaveLength(2);
    const snap = host.snap!;
    expect(snap.counts).toHaveLength(2);
    // bacak girdisi veren botlar yüzünden Kontlar yerinden oynadı
    const moved = snap.counts.some((c) => Math.abs(c.x) > 3.3 || c.z < 8.4);
    expect(moved).toBe(true);
    expect(host.err).toBe('');
  }, 30000);

  it('ev sahibi olmayan ayar değiştiremez; ev sahibi değiştirir ve herkese yayılır', async () => {
    const host = bots[0]!;
    const other = bots[2]!;
    const before = host.tuning!.walkSpeed;
    other.send({ t: 'tune', key: 'walkSpeed', value: 3.9 });
    await sleep(200);
    expect(host.tuning!.walkSpeed).toBe(before);
    host.send({ t: 'tune', key: 'walkSpeed', value: 2.7 });
    await other.waitFor(() => other.tuning!.walkSpeed === 2.7, 2000, 'ayar yayını');
    host.send({ t: 'tuneReset' });
    await other.waitFor(() => other.tuning!.walkSpeed === before, 2000, 'ayar sıfırlama');
  });

  it('kopan oyuncu aynı kimlikle geri döner ve rolünü korur', async () => {
    const victim = bots[5]!;
    const id = victim.id;
    const slots = victim.mySlots().slice().sort();
    const sid = victim.sid;
    victim.close();
    await sleep(300);
    const back = await Bot.connect(url, 'Misafir5', { sid });
    bots[5] = back;
    await back.waitFor(() => back.id === id && back.scene !== null && back.snap !== null, 4000, 'yeniden bağlanma');
    expect(back.mySlots().slice().sort()).toEqual(slots);
    expect(back.phase).toBe('playing');
    back.autoplay();
  }, 15000);

  it('üç sahne tamamlanır, gazete ve rapor üretilir', async () => {
    const host = bots[0]!;
    // Sahneyi bitir -> sonuç -> sonraki sahneye geç (x3)
    for (let i = 0; i < 3; i++) {
      host.send({ t: 'lobby', a: 'skip' }); // oyunu erken bitir
      await host.waitFor(() => host.result !== null, 9000, `sahne ${i + 1} sonucu`);
      expect(host.result!.stacks).toHaveLength(2);
      host.send({ t: 'lobby', a: 'skip' }); // sonuç ekranını atla
      if (i < 2) {
        await host.waitFor(() => host.scene!.index === i + 1 && host.phase === 'briefing', 5000, 'sonraki sahne');
        for (const b of bots) b.stopAutoplay();
        host.send({ t: 'lobby', a: 'skip' }); // brifing atla
        await Promise.all(bots.map((b) => b.waitFor(() => b.phase === 'playing', 4000, 'oyun')));
        for (const b of bots) b.autoplay();
      }
    }
    await host.waitFor(() => host.gazette !== null, 5000, 'gazete');
    const g = host.gazette!;
    expect(g.headline.head.length).toBeGreaterThan(5);
    expect(g.scores).toHaveLength(2);
    expect(g.ads.length).toBe(3);
    expect(host.report).toContain('Oturum Raporu');
    expect(host.report).toContain('Karşılama');
    expect(host.report).toContain('Akşam Yemeği');
    expect(host.report).toContain('Vals');
    // rapor rol dağılımı satırlarını içerir
    expect(host.report).toMatch(/Bacaklar=/);
    host.send({ t: 'lobby', a: 'again' });
    await host.waitFor(() => host.phase === 'lobby', 3000, 'lobiye dönüş');
  }, 90000);
});

describe('Ağ: tek kişilik deneme', () => {
  it('tek oyuncu tüm slotları yönetir ve oyun akar', async () => {
    const solo = await Bot.connect(url, 'Tek', { hostToken: 'testtoken', sid: 'solo-1' });
    bots.push(solo);
    // diğer botları kapat ki lobi boş kalsın
    for (const b of bots) if (b !== solo) b.close();
    await sleep(500);
    await solo.waitFor(() => solo.phase === 'lobby', 3000, 'lobi');
    solo.send({ t: 'lobby', a: 'solo' });
    await solo.waitFor(() => solo.phase === 'briefing', 4000, 'brifing');
    expect(solo.mySlots().sort()).toEqual(['handL', 'handR', 'head', 'legs']);
    solo.send({ t: 'lobby', a: 'skip' });
    await solo.waitFor(() => solo.phase === 'playing', 3000, 'oyun');
    solo.input({ mz: 1, mx: 0, yaw: 0, hyaw: 0.4, hpitch: 0, mouth: true });
    await sleep(1500);
    const c = solo.snap!.counts[0]!;
    expect(c.z).toBeLessThan(8.5);
    expect(c.headYaw).toBeCloseTo(0.4, 1);
    expect(c.mouth).toBeGreaterThan(0.9);
    expect(solo.snap!.counts).toHaveLength(1);
    void CF;
  }, 20000);
});
