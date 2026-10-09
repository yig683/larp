// Ses sohbeti sinyalleşmesi: oda yalnızca hedefe, temizlenmiş zarfla iletir.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, iceFromEnv, type RunningServer } from '../server/index';
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

describe('Ağ: ses sohbeti sinyalleşmesi', () => {
  it('welcome ICE sunucularını içerir; ses durumu oyunculara yayılır', async () => {
    for (const n of ['A', 'B', 'C']) bots.push(await Bot.connect(url, n));
    const [a, b, c] = bots as [Bot, Bot, Bot];
    await Promise.all(bots.map((x) => x.waitFor(() => x.id > 0 && x.players.length === 3, 3000, 'katılım')));
    expect(a.ice.length).toBeGreaterThan(0);
    a.send({ t: 'voice', mode: 2, vs: 111 });
    await b.waitFor(() => b.players.find((p) => p.id === a.id)?.voice === 2, 2000, 'ses modu');
    expect(b.players.find((p) => p.id === a.id)?.vs).toBe(111);
    expect(c.players.find((p) => p.id === b.id)?.voice).toBe(0);
  });

  it('rtc yalnızca hedefe ulaşır ve gönderen kimliği sunucudan gelir', async () => {
    const [a, b, c] = bots as [Bot, Bot, Bot];
    a.send({ t: 'rtc', to: b.id, d: { vs: 111, desc: { type: 'offer', sdp: 'v=0 test' } } });
    await b.waitFor(() => b.rtcIn.length > 0, 2000, 'rtc');
    expect(b.rtcIn[0]!.from).toBe(a.id);
    expect(b.rtcIn[0]!.d.desc?.type).toBe('offer');
    await sleep(150);
    expect(c.rtcIn).toHaveLength(0);
    expect(a.rtcIn).toHaveLength(0);
  });

  it('geçersiz hedef, kendine gönderme ve bozuk içerik atılır; aday sınırlanır', async () => {
    const [a, b] = bots as [Bot, Bot, Bot];
    const n0 = b.rtcIn.length;
    a.send({ t: 'rtc', to: 9999, d: { vs: 1, desc: { type: 'offer', sdp: 'x' } } });
    a.send({ t: 'rtc', to: a.id, d: { vs: 1, desc: { type: 'offer', sdp: 'x' } } });
    a.send({ t: 'rtc', to: b.id, d: { vs: 1, desc: { type: 'hack' as never, sdp: 'x' } } });
    a.send({ t: 'rtc', to: b.id, d: { vs: 1 } });
    a.send({ t: 'rtc', to: b.id, d: 'bozuk' as never });
    a.send({ t: 'rtc', to: b.id, d: { vs: 1, cand: { candidate: 'c'.repeat(5000), sdpMid: '0', sdpMLineIndex: 0 } } });
    a.send({ t: 'rtc', to: b.id, d: { vs: 1, cand: null } });
    await sleep(300);
    const got = b.rtcIn.slice(n0);
    expect(got).toHaveLength(2);
    expect(got[0]!.d.cand?.candidate.length).toBe(1000);
    expect(got[1]!.d.cand).toBeNull();
  });

  it('sinyal akışı hız sınırlıdır ama normal ICE yoğunluğuna yeter', async () => {
    const [a, b] = bots as [Bot, Bot, Bot];
    const n0 = b.rtcIn.length;
    for (let i = 0; i < 100; i++) a.send({ t: 'rtc', to: b.id, d: { vs: 1, cand: { candidate: `candidate:${i}`, sdpMid: '0', sdpMLineIndex: 0 } } });
    await sleep(500);
    expect(b.rtcIn.length - n0).toBe(100);
    const n1 = b.rtcIn.length;
    for (let i = 0; i < 2000; i++) a.send({ t: 'rtc', to: b.id, d: { vs: 1, cand: { candidate: `candidate:${i}`, sdpMid: '0', sdpMLineIndex: 0 } } });
    await sleep(800);
    expect(b.rtcIn.length - n1).toBeLessThan(1500);
  });

  it('bağlantısı kopan oyuncunun ses durumu sıfırlanır; ICE ortam değişkenleri okunur', async () => {
    const [a, b] = bots as [Bot, Bot, Bot];
    a.close();
    await b.waitFor(() => (b.players.find((p) => p.id === a.id)?.voice ?? 0) === 0, 2000, 'ses sıfırlandı');
    const d = iceFromEnv({ TURN_URL: 'turn:x.example:3478, turns:x.example:5349', TURN_USER: 'u', TURN_PASS: 'p' } as NodeJS.ProcessEnv);
    expect(d[0]!.urls).toContain('stun:stun.l.google.com:19302');
    expect(d[1]).toEqual({ urls: ['turn:x.example:3478', 'turns:x.example:5349'], username: 'u', credential: 'p' });
    expect(iceFromEnv({ TK_ICE: '[{"urls":"stun:a"}]' } as NodeJS.ProcessEnv)).toEqual([{ urls: 'stun:a' }]);
    expect(iceFromEnv({ TK_ICE: 'bozuk' } as NodeJS.ProcessEnv)[0]!.urls).toBeTruthy();
  });
});
