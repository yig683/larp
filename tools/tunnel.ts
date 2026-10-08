// Cloudflare "quick tunnel": hesap açmadan, bu bilgisayardaki sunucuya internetten https adresi verir.
// cloudflared yoksa GitHub sürümlerinden bir kereliğine tools/bin/ altına indirir.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const C = {
  dim: (s: string): string => `\x1b[2m${s}\x1b[0m`,
  red: (s: string): string => `\x1b[31m${s}\x1b[0m`,
};

export function cloudflaredAsset(): { asset: string; tgz: boolean } | null {
  const a = process.arch;
  switch (process.platform) {
    case 'win32':
      return { asset: a === 'ia32' ? 'cloudflared-windows-386.exe' : 'cloudflared-windows-amd64.exe', tgz: false };
    case 'linux':
      return { asset: a === 'arm64' ? 'cloudflared-linux-arm64' : a === 'arm' ? 'cloudflared-linux-arm' : a === 'ia32' ? 'cloudflared-linux-386' : 'cloudflared-linux-amd64', tgz: false };
    case 'darwin':
      return { asset: a === 'arm64' ? 'cloudflared-darwin-arm64.tgz' : 'cloudflared-darwin-amd64.tgz', tgz: true };
    default:
      return null;
  }
}

function runsOk(cmd: string): boolean {
  try {
    return spawnSync(cmd, ['--version'], { stdio: 'ignore', timeout: 8000 }).status === 0;
  } catch {
    return false;
  }
}

export async function findCloudflared(): Promise<string | null> {
  const env = process.env.CLOUDFLARED;
  if (env && fs.existsSync(env)) return env;
  if (runsOk('cloudflared')) return 'cloudflared';
  const binDir = path.join(root, 'tools', 'bin');
  const exe = path.join(binDir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (fs.existsSync(exe)) return exe;
  const a = cloudflaredAsset();
  if (!a) return null;
  console.log(C.dim('Tünel aracı (cloudflared) indiriliyor, bir kereye mahsus…'));
  fs.mkdirSync(binDir, { recursive: true });
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${a.asset}`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (a.tgz) {
      const tgz = path.join(binDir, 'cloudflared.tgz');
      fs.writeFileSync(tgz, buf);
      const r = spawnSync('tar', ['-xzf', tgz, '-C', binDir], { stdio: 'ignore' });
      fs.rmSync(tgz, { force: true });
      if (r.status !== 0) throw new Error('tar açılamadı');
    } else {
      fs.writeFileSync(exe, buf);
    }
    if (process.platform !== 'win32') fs.chmodSync(exe, 0o755);
    return exe;
  } catch (e) {
    console.log(C.red(`cloudflared indirilemedi (${(e as Error).message}).`));
    return null;
  }
}

export interface Tunnel {
  url: string;
  proc: ChildProcess;
}

let lastErr = '';
export const lastTunnelError = (): string => lastErr;

export function runTunnel(bin: string, port: number, timeoutMs = 40000): Promise<Tunnel | null> {
  return new Promise((resolve) => {
    // 127.0.0.1: "localhost" bazı makinelerde IPv6'ya çözülüp sunucuya ulaşamaz.
    const proc = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let done = false;
    const finish = (t: Tunnel | null): void => {
      if (done) return;
      done = true;
      clearTimeout(to);
      if (!t) proc.kill();
      resolve(t);
    };
    const to = setTimeout(() => finish(null), timeoutMs);
    const onData = (d: Buffer): void => {
      const text = d.toString();
      // api.trycloudflare.com hata iletilerinde geçer; gerçek adres rastgele sözcüklerden oluşur
      const m = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/.exec(text);
      if (m) return finish({ url: m[0], proc });
      const err = /failed to .*|error .*|ERR .*/i.exec(text);
      if (err) lastErr = err[0].slice(0, 160);
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.on('error', () => finish(null));
    proc.on('exit', () => finish(null));
  });
}

/** Tünel adresi yayılana kadar (DNS) bekler; 30 sn içinde açılmazsa yine de adresi verir. */
export async function waitReachable(url: string): Promise<boolean> {
  for (let i = 0; i < 15; i++) {
    try {
      const r = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return true;
    } catch {
      /* henüz değil */
    }
    await sleep(2000);
  }
  return false;
}

export async function openTunnel(port: number, bin0?: string): Promise<Tunnel | null> {
  const bin = bin0 ?? (await findCloudflared());
  if (!bin) return null;
  for (let i = 0; i < 3; i++) {
    const t = await runTunnel(bin, port);
    if (t) return t;
    if (i < 2) {
      console.log(C.dim(`Tünel kurulamadı, yeniden deneniyor (${i + 2}/3)…`));
      await sleep(2500);
    }
  }
  return null;
}

