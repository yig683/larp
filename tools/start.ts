// Tek komutla başlatıcı: istemciyi derler (gerekirse), sunucuyu açar, internet tüneli kurar
// (arkadaşların kurulumsuz bağlanması için) ve ev sahibinin tarayıcısını açar.
//
//   npm start                 → derle + sunucu + tünel + tarayıcı
//   npm start -- --no-tunnel  → yalnızca yerel ağ (LAN) bağlantısı
//   npm start -- --port 4000  → başka port
//   npm start -- --rebuild    → istemciyi zorla yeniden derle
//   npm start -- --no-open    → tarayıcıyı açma

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index';
import { lastTunnelError, openTunnel, waitReachable, type Tunnel } from './tunnel';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n: string): boolean => args.includes(`--${n}`);
const opt = (n: string): string | undefined => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const C = {
  gold: (s: string): string => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string): string => `\x1b[2m${s}\x1b[0m`,
  red: (s: string): string => `\x1b[31m${s}\x1b[0m`,
  green: (s: string): string => `\x1b[32m${s}\x1b[0m`,
  bold: (s: string): string => `\x1b[1m${s}\x1b[0m`,
};

// ---------------------------------------------------------------- derleme

function newestMtime(p: string): number {
  let st: fs.Stats;
  try {
    st = fs.statSync(p);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.mtimeMs;
  let m = st.mtimeMs;
  for (const f of fs.readdirSync(p)) m = Math.max(m, newestMtime(path.join(p, f)));
  return m;
}

function ensureBuilt(force: boolean): void {
  const out = path.join(root, 'dist', 'index.html');
  const srcM = Math.max(...['client', 'shared', 'index.html', 'vite.config.ts', 'package.json'].map((x) => newestMtime(path.join(root, x))));
  const stale = !fs.existsSync(out) || newestMtime(out) < srcM;
  if (!stale && !force) return;
  console.log(C.dim('İstemci derleniyor (ilk seferde ~10 sn)…'));
  const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const r = spawnSync(process.execPath, [vite, 'build', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(C.red('Derleme başarısız oldu. `npm install` çalıştırıp tekrar deneyin.'));
    process.exit(1);
  }
}

// ---------------------------------------------------------------- tarayıcı

function openBrowser(url: string): void {
  try {
    const [cmd, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    const p = spawn(cmd!, a as string[], { stdio: 'ignore', detached: true });
    p.on('error', () => undefined);
    p.unref();
  } catch {
    /* tarayıcıyı elle açın */
  }
}

// ---------------------------------------------------------------- ana akış

async function main(): Promise<void> {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    console.error(C.red(`Node.js 20 veya üstü gerekli (sizde ${process.versions.node}). https://nodejs.org adresinden LTS sürümünü kurun.`));
    process.exit(1);
  }
  const port = Number(opt('port') ?? process.env.PORT ?? 3000);
  ensureBuilt(flag('rebuild'));

  console.log(C.dim('Sunucu başlatılıyor…'));
  const srv = await startServer({ port });
  const hostUrl = `http://localhost:${srv.port}/?host=${srv.hostToken}`;

  let tunnel: Tunnel | null = null;
  if (!flag('no-tunnel') && !flag('lan')) {
    console.log(C.dim('İnternet tüneli açılıyor (arkadaşların kurulumsuz bağlansın diye)…'));
    tunnel = await openTunnel(srv.port);
    if (tunnel) {
      srv.setPublicUrl(tunnel.url);
      tunnel.proc.on('exit', () => console.log(C.red('\n⚠ Tünel kapandı: arkadaşların bağlantısı kopar. Sunucuyu yeniden başlatın.')));
    }
  }

  const line = '═'.repeat(64);
  console.log(`\n${C.gold(line)}\n${C.bold(C.gold('  TRENÇKOT KONTU — sunucu hazır'))}\n${C.gold(line)}`);
  console.log(`\n  ${C.bold('Sen (ev sahibi):')}  ${hostUrl}\n  ${C.dim('Tarayıcın otomatik açılır; ev sahibi yetkisi bu bağlantıdadır, başkasına verme.')}`);
  if (tunnel) {
    console.log(`\n  ${C.bold('Arkadaşların için:')}  ${C.green(tunnel.url)}\n  ${C.dim('Bu adresi Discord’dan at; lobide de “Bağlantıyı kopyala” düğmesi var.')}`);
    const ok = await waitReachable(tunnel.url);
    if (!ok) console.log(C.dim('  (Tünel adresi henüz yayılıyor olabilir; açılmazsa 30 sn bekleyip tekrar dene.)'));
  } else {
    console.log(`\n  ${C.red('İnternet tüneli yok.')} ${flag('no-tunnel') || flag('lan') ? '' : 'Tünel kurulamadı (internet/güvenlik duvarı?).'}`);
    if (lastTunnelError()) console.log(`  ${C.dim('Son hata: ' + lastTunnelError())}`);
  }
  const lan = srv.lanUrls();
  if (lan.length > 0) console.log(`\n  ${C.bold('Aynı Wi‑Fi/ağdaki arkadaşlar:')}  ${lan.join('   ')}`);
  if (!tunnel) {
    console.log(`\n  ${C.dim('Uzaktaki arkadaşlar için seçenekler: (1) aynı sanal ağ: Tailscale/Radmin VPN kurup yukarıdaki adresi kullanın,')}`);
    console.log(`  ${C.dim('(2) `ngrok http ' + srv.port + '` ya da başka bir tünel, (3) modemden ' + srv.port + ' numaralı portu yönlendirin.')}`);
  }
  console.log(`\n  Durdurmak için ${C.bold('Ctrl+C')}. Oyun ayarları (F8) ${C.dim('tuning.local.json')} dosyasına kaydedilir.\n`);

  if (!flag('no-open')) openBrowser(hostUrl);

  const stop = async (): Promise<void> => {
    console.log('\nKapatılıyor…');
    try {
      tunnel?.proc.kill();
      await srv.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((e) => {
  console.error(C.red('Başlatılamadı:'), e);
  if (String((e as { code?: string }).code) === 'EADDRINUSE') console.error(C.red('Bu port başka bir program tarafından kullanılıyor: `npm start -- --port 3001` deneyin.'));
  process.exit(1);
});
