// Sunucu girişi: statik dosyalar (dist/), WebSocket (/ws), 60 Hz oyun döngüsü.

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { WebSocketServer } from 'ws';
import { DT } from '../shared/constants';
import type { C2S } from '../shared/protocol';
import { Rng } from '../shared/rng';
import { assignStacks } from '../shared/roles';
import { TUNING_DEFAULTS, type Tuning } from '../shared/tuning';
import { Game } from './game';
import { initRapier } from './rapier';
import { Room, type Conn } from './room';

export interface ServerOpts {
  port?: number;
  host?: string;
  distDir?: string;
  hostToken?: string;
  tuningFile?: string | null;
  build?: string;
  quiet?: boolean;
}

export interface RunningServer {
  room: Room;
  port: number;
  hostToken: string;
  distDir: string;
  close(): Promise<void>;
  setPublicUrl(url: string): void;
  lanUrls(): string[];
}

const here = path.dirname(fileURLToPath(import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);

function buildId(): string {
  if (process.env.BUILD_ID) return process.env.BUILD_ID;
  let ver = '0.1.0';
  try {
    ver = (JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')) as { version: string }).version;
  } catch {
    /* yoksay */
  }
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: path.join(here, '..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return `v${ver}+${sha}`;
  } catch {
    return `v${ver}`;
  }
}

export function lanUrls(port: number): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${port}`);
    }
  }
  return out;
}

/** İlk adımların JIT/WASM ısınması (ilk fizik adımı ~100 ms sürer). */
async function warmup(tuning: Tuning): Promise<void> {
  await initRapier();
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  const players = new Map(ids.map((id) => [id, { id, name: `w${id}`, color: id % 8 }]));
  const g = new Game({ scene: 'dinner', index: 0, total: 3, assigns: assignStacks(ids, new Rng(1)), players, tuning: { ...tuning }, seed: 1 });
  for (let i = 0; i < 40; i++) g.step();
  g.buildSnapshot(true);
  g.dispose();
}

export async function startServer(opts: ServerOpts = {}): Promise<RunningServer> {
  const distDir = path.resolve(opts.distDir ?? path.join(here, '..', 'dist'));
  const hostToken = opts.hostToken ?? crypto.randomBytes(6).toString('hex');
  const tuningFile = opts.tuningFile === undefined ? path.join(process.cwd(), 'tuning.local.json') : opts.tuningFile;
  const log = (...a: unknown[]): void => {
    if (!opts.quiet) console.log(...a);
  };

  let saved: Partial<Tuning> | undefined;
  if (tuningFile && fs.existsSync(tuningFile)) {
    try {
      saved = JSON.parse(fs.readFileSync(tuningFile, 'utf8')) as Partial<Tuning>;
      log(`Kayıtlı ayarlar yüklendi: ${tuningFile}`);
    } catch {
      saved = undefined;
    }
  }
  let saveTimer: NodeJS.Timeout | null = null;
  const room = new Room(opts.build ?? buildId(), hostToken, saved, (t) => {
    if (!tuningFile) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        fs.writeFileSync(tuningFile, JSON.stringify(t, null, 2));
      } catch {
        /* yoksay */
      }
    }, 500);
  });

  await warmup(room.tuning);

  const gzCache = new Map<string, { mtime: number; buf: Buffer }>();
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/healthz') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
        return;
      }
      if (url.pathname === '/api/host') {
        if (url.searchParams.get('token') !== hostToken) {
          res.writeHead(403);
          res.end('yetkisiz');
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ publicUrl: room.publicUrl ?? null, lan: lanUrls((server.address() as { port: number }).port), build: room.build, status: room.status() }));
        return;
      }
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.resolve(distDir, '.' + rel);
      if (!file.startsWith(distDir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      let st: fs.Stats;
      try {
        st = fs.statSync(file);
      } catch {
        // SPA: bilinmeyen yol -> index.html (yoksa yönerge)
        const idx = path.join(distDir, 'index.html');
        if (!fs.existsSync(idx)) {
          res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('İstemci derlenmemiş. Önce `npm run build` çalıştırın.');
          return;
        }
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Bulunamadı');
        return;
      }
      if (!st.isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const headers: Record<string, string> = { 'content-type': MIME[ext] ?? 'application/octet-stream' };
      headers['cache-control'] = rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
      const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
      if (acceptsGzip && COMPRESSIBLE.has(ext)) {
        let c = gzCache.get(file);
        if (!c || c.mtime !== st.mtimeMs) {
          c = { mtime: st.mtimeMs, buf: zlib.gzipSync(fs.readFileSync(file), { level: 6 }) };
          gzCache.set(file, c);
        }
        headers['content-encoding'] = 'gzip';
        headers['content-length'] = String(c.buf.length);
        res.writeHead(200, headers);
        res.end(c.buf);
        return;
      }
      headers['content-length'] = String(st.size);
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(res);
    } catch {
      res.writeHead(500);
      res.end();
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const p = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (p !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws) => {
    const conn: Conn = {
      send: (t) => {
        if (ws.readyState === 1) ws.send(t);
      },
      sendBin: (b) => {
        if (ws.readyState === 1 && ws.bufferedAmount < 400_000) ws.send(b, { binary: true });
      },
      close: () => {
        try {
          ws.close();
        } catch {
          /* yoksay */
        }
      },
    };
    let player: ReturnType<Room['join']> = null;
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let msg: C2S;
      try {
        msg = JSON.parse(data.toString()) as C2S;
      } catch {
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;
      try {
        if (msg.t === 'hello') {
          if (!player) player = room.join(conn, msg);
          return;
        }
        if (!player) return;
        room.onMessage(player, msg);
      } catch (e) {
        console.error('Mesaj işlenirken hata:', e);
      }
    });
    ws.on('close', () => room.leave(conn));
    ws.on('error', () => {
      /* yoksay */
    });
  });

  // 60 Hz sabit adımlı döngü (birikimli)
  let last = performance.now();
  let acc = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    acc += (now - last) / 1000;
    last = now;
    if (acc > 0.25) acc = 0.25;
    try {
      while (acc >= DT) {
        room.tick();
        acc -= DT;
      }
    } catch (e) {
      console.error('Oyun döngüsü hatası:', e);
    }
  }, 8);

  await new Promise<void>((resolve) => server.listen(opts.port ?? 3000, opts.host ?? '0.0.0.0', resolve));
  const port = (server.address() as { port: number }).port;

  return {
    room,
    port,
    hostToken,
    distDir,
    lanUrls: () => lanUrls(port),
    setPublicUrl: (u: string) => {
      room.publicUrl = u;
    },
    close: async () => {
      clearInterval(timer);
      for (const c of wss.clients) c.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
      room.game?.dispose();
    },
  };
}

// Doğrudan çalıştırma: `tsx server/index.ts`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const srv = await startServer({ port });
  console.log(`Trençkot Kontu sunucusu hazır → http://localhost:${srv.port}/?host=${srv.hostToken}`);
  for (const u of srv.lanUrls()) console.log(`  Aynı ağdaki arkadaşlar için: ${u}`);
  void TUNING_DEFAULTS;
}
