// Ağ üzerinden palto patlaması: 8 bot, Şüphe zorla doldurulur, çaylaklar paltoya koşup yeniden yığılır.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../server/index';
import { Bot } from '../tools/bot';

let srv: RunningServer;
let url: string;
const bots: Bot[] = [];
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  srv = await startServer({ port: 0, tuningFile: null, quiet: true, distDir: '/nonexistent', hostToken: 'tok' });
  url = `ws://127.0.0.1:${srv.port}/ws`;
}, 60000);

afterAll(async () => {
  for (const b of bots) b.close();
  await srv.close();
});

describe('Ağ: palto patlaması ve yeniden yığılma', () => {
  it('8 bot: patlama → herkes çaylak → paltoya koşar → yeniden yığılır', async () => {
    bots.push(await Bot.connect(url, 'Ev', { hostToken: 'tok' }));
    for (let i = 1; i < 8; i++) bots.push(await Bot.connect(url, `M${i}`));
    const host = bots[0]!;
    await host.waitFor(() => host.players.length === 8, 4000, '8 oyuncu');
    host.send({ t: 'lobby', a: 'start' });
    await host.waitFor(() => host.phase === 'briefing', 4000, 'brifing');
    host.send({ t: 'lobby', a: 'skip' });
    await Promise.all(bots.map((b) => b.waitFor(() => b.phase === 'playing', 5000, 'oyun')));

    const g = srv.room.game!;
    const c = g.counts[0]!;
    const members = Array.from(new Set(c.assign.members));
    expect(members).toHaveLength(4);
    g.addSusp(0, 500, 'test', c.x, c.z, true);
    expect(c.mode).toBe('burst');

    // yalnızca patlayan yığının üyeleri çaylak olur
    const mine = bots.filter((b) => members.includes(b.id));
    await Promise.all(mine.map((b) => b.waitFor(() => b.kidId !== 0, 3000, 'çaylak doğuşu')));
    for (const b of bots) if (!members.includes(b.id)) expect(b.kidId).toBe(0);
    expect(g.kids.size).toBe(4);
    expect(g.counts[1]!.mode).toBe('stacked');

    // çaylaklar paltoya koşar, E'ye basılı tutar
    for (const b of mine) b.autoplay();
    const t0 = Date.now();
    while (c.mode !== 'stacked' && Date.now() - t0 < 25000) await sleep(100);
    expect(c.mode).toBe('stacked');
    expect(g.kids.size).toBe(0);
    // yeniden yığılan Kont'un rolleri yerinde: herkes yine kendi slotunda
    for (const b of mine) await b.waitFor(() => b.kidId === 0, 3000, 'çaylak kalkışı');
    expect(c.bursts).toBe(1);
    expect(host.events.some((e) => e.k === 'restack')).toBe(true);
  }, 60000);
});
