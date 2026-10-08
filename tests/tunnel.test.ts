// Tünel yardımcısı: sahte bir "cloudflared" ile adres ayrıştırma ve hata yolları.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cloudflaredAsset, lastTunnelError, openTunnel, runTunnel } from '../tools/tunnel';

let dir = '';

function fake(name: string, body: string): string {
  const f = path.join(dir, name);
  fs.writeFileSync(f, `#!/usr/bin/env node\n${body}\n`);
  fs.chmodSync(f, 0o755);
  return f;
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-tunnel-'));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const isWin = process.platform === 'win32';

describe.skipIf(isWin)('Tünel', () => {
  it('cloudflared çıktısından rastgele sözcüklü adresi bulur (api. adresini yok sayar)', async () => {
    const bin = fake(
      'ok.mjs',
      `
console.error('2026-01-01T00:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...');
console.error('2026-01-01T00:00:01Z INF POST https://api.trycloudflare.com/tunnel ok');
setTimeout(() => {
  console.error('2026-01-01T00:00:02Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |');
  console.error('2026-01-01T00:00:02Z INF |  https://quiet-forest-sample-words.trycloudflare.com                                       |');
}, 100);
setInterval(() => {}, 1000);
`,
    );
    const t = await runTunnel(bin, 3000, 5000);
    expect(t).not.toBeNull();
    expect(t!.url).toBe('https://quiet-forest-sample-words.trycloudflare.com');
    t!.proc.kill();
  });

  it('adres çıkmadan biterse null döner ve son hatayı saklar', async () => {
    const bin = fake(
      'bad.mjs',
      `
console.error('2026-01-01T00:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...');
console.error('failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": dial tcp: lookup api.trycloudflare.com: no such host');
process.exit(1);
`,
    );
    const t = await runTunnel(bin, 3000, 5000);
    expect(t).toBeNull();
    expect(lastTunnelError()).toContain('failed to request quick Tunnel');
  });

  it('zaman aşımında vazgeçer ve süreci öldürür', async () => {
    const bin = fake('hang.mjs', `setInterval(() => {}, 1000);`);
    const t0 = Date.now();
    const t = await runTunnel(bin, 3000, 600);
    expect(t).toBeNull();
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it('openTunnel verilen ikiliyi kullanır', async () => {
    const bin = fake('ok2.mjs', `console.error('https://a-b-c-d.trycloudflare.com'); setInterval(() => {}, 1000);`);
    const t = await openTunnel(3000, bin);
    expect(t?.url).toBe('https://a-b-c-d.trycloudflare.com');
    t?.proc.kill();
  });
});

describe('cloudflared varlık adı', () => {
  it('bu platform için bir indirme adı üretir', () => {
    const a = cloudflaredAsset();
    expect(a).not.toBeNull();
    expect(a!.asset.startsWith('cloudflared-')).toBe(true);
  });
});
