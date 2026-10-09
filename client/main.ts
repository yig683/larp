import './style.css';
import { PROTOCOL_VERSION, SLOT_IDS, STACK_NAMES } from '../shared/constants';
import { buildSalon, sceneExtras } from '../shared/level';
import { archById } from '../shared/phrases';
import type { GameEvent, S2C, SceneId, Snapshot } from '../shared/protocol';
import { CF } from '../shared/protocol';
import { Audio } from './audio';
import { updateCamera } from './camera';
import { Entities } from './entities';
import { Fx } from './fx';
import { Input } from './input';
import { Labels } from './labels';
import { Interp, Net } from './net';
import { S, saveSettings, esc } from './state';
import { UI } from './ui';
import { QUALITY, World } from './world';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const world = new World(canvas, QUALITY[S.settings.quality]);
const fx = new Fx();
world.scene.add(fx.group);
const labels = new Labels(document.getElementById('labels')!);
const interp = new Interp();
const ents = new Entities(world.dynamic, interp, fx, labels);
const audio = new Audio();
const salon = buildSalon();
let loadedScene: SceneId | '' = '';
let needYawInit = false;
let wantPhoto: string | null = null;
let t = 0;

const input = new Input(canvas, {
  onSay: (i) => net.send({ t: 'say', i }),
  onLockChange: (locked) => ui.setLocked(locked),
  onToggle: (what) => {
    if (what === 'tuning') ui.toggleTuning();
    else if (what === 'mute') audio.setMuted(!audio.muted);
    else if (what === 'hints') {
      S.settings.hints = !S.settings.hints;
      saveSettings();
    } else if (what === 'report') {
      /* gece sonunda buton var */
    }
  },
});

const ui: UI = new UI(
  document.getElementById('ui')!,
  {
    join: (name) => {
      if (!name) {
        S.err = 'Bir isim yaz.';
        ui.showMenu();
        return;
      }
      S.settings.name = name;
      saveSettings();
      S.err = '';
      audio.init();
      net.connect();
    },
    host: (a) => {
      audio.init();
      net.send({ t: 'lobby', a });
    },
    lock: () => {
      audio.init();
      input.requestLock();
    },
    tune: (key, value) => net.send({ t: 'tune', key, value }),
    tuneReset: () => net.send({ t: 'tuneReset' }),
    volume: (v) => audio.setVolume(v),
    quality: (q) => world.setQuality(QUALITY[q]),
  },
  input,
);

const net: Net = new Net(
  () => ({ t: 'hello', v: PROTOCOL_VERSION, name: S.settings.name || 'Misafir', sid: S.settings.sid, host: S.hostToken || undefined }),
  {
    onMsg: (m) => onMsg(m),
    onSnap: (s) => onSnap(s),
    onStatus: (st) => {
      S.connected = st === 'open';
      if (st === 'closed') S.reconnecting = true;
    },
  },
);

// ---------------------------------------------------------------- mesajlar

function myAssignUpdate(): void {
  S.myStack = -1;
  S.mySlots = [];
  for (const a of S.assign) {
    const mine = SLOT_IDS.filter((s) => a.slots[s] === S.me.id);
    if (mine.length > 0) {
      S.myStack = a.stack;
      S.mySlots = mine;
    }
  }
}

function enterLobby(): void {
  S.phase = 'lobby';
  ents.clear();
  interp.reset();
  loadedScene = '';
  S.hud = null;
  S.scene = null;
  S.inKidMode = false;
  ui.showHud(false);
  audio.stopMusic();
  ui.renderLobby();
}

function onMsg(m: S2C): void {
  switch (m.t) {
    case 'welcome':
      S.me = { id: m.you, host: m.host };
      S.players = m.players;
      S.tuning = m.tuning;
      S.build = m.build;
      S.publicUrl = m.publicUrl;
      S.reconnecting = false;
      S.err = '';
      if (m.phase === 'lobby') enterLobby();
      else S.phase = m.phase;
      if (m.host) void refreshInvite();
      break;
    case 'players':
      S.players = m.players;
      if (S.phase === 'lobby' && m.phase === 'lobby') ui.renderLobby();
      myAssignUpdate();
      break;
    case 'tuning':
      S.tuning = m.tuning;
      if (ui.tuningOpen) ui.renderTuning();
      break;
    case 'scene': {
      S.scene = m.info;
      S.assign = m.assign;
      S.result = null;
      S.gazette = null;
      S.wheel = [];
      S.hud = null;
      myAssignUpdate();
      S.inKidMode = false;
      if (loadedScene !== m.info.id) {
        world.loadLevel(salon, sceneExtras(m.info.id));
        loadedScene = m.info.id;
      }
      interp.reset();
      ents.load(
        m.entities,
        m.assign.map((a) => a.stack),
      );
      for (const a of m.assign) S.spectateStack = a.stack;
      S.spectateStack = m.assign[0]?.stack ?? 0;
      needYawInit = S.myStack >= 0;
      break;
    }
    case 'phase':
      S.phase = m.phase;
      S.phaseSince = performance.now();
      if (m.phase === 'briefing') {
        S.briefingUntil = performance.now() + (m.countdown ?? 8) * 1000;
        ui.showHud(true);
        ui.renderBriefing();
        audio.startMusic();
        ui.setLocked(input.locked);
      } else if (m.phase === 'playing') {
        ui.setScreen('');
        ui.showHud(true);
        audio.startMusic();
        ui.setLocked(input.locked);
      } else if (m.phase === 'lobby') enterLobby();
      break;
    case 'hud':
      S.hud = m;
      ui.onHud();
      audio.tension = m.stacks.some((s) => s.mode === 'burst' || s.susp > 82);
      break;
    case 'evs':
      for (const e of m.list) onEvent(e);
      break;
    case 'wheel': {
      const i = S.wheel.findIndex((w) => w.stack === m.stack);
      if (i >= 0) S.wheel[i] = m;
      else S.wheel.push(m);
      break;
    }
    case 'result':
      S.result = m.result;
      S.resultNext = m.next;
      S.phase = 'sceneEnd';
      input.releaseLock();
      ui.renderResult();
      audio.play(m.result.success ? 'fanfare' : 'womp');
      break;
    case 'night':
      S.gazette = m.gazette;
      S.report = m.report;
      S.phase = 'nightEnd';
      audio.stopMusic();
      ui.renderNight(m.gazette);
      break;
    case 'err':
      S.err = m.msg;
      if (S.phase === 'menu') ui.showMenu();
      break;
    case 'pong':
      S.rtt = net.rtt;
      break;
  }
}

async function refreshInvite(): Promise<void> {
  try {
    const r = await fetch(`/api/host?token=${encodeURIComponent(S.hostToken)}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = (await r.json()) as { publicUrl: string | null; lan: string[] };
    S.publicUrl = j.publicUrl ?? j.lan[0] ?? location.origin;
    if (S.phase === 'lobby') ui.renderLobby();
  } catch {
    /* yoksay */
  }
}

function onSnap(s: Snapshot): void {
  interp.push(s, performance.now());
  if (needYawInit && S.myStack >= 0) {
    const c = s.counts.find((x) => x.stack === S.myStack);
    if (c) {
      input.resetForScene(c.yaw);
      needYawInit = false;
    }
  }
}

// ---------------------------------------------------------------- olaylar

const MOOD_ICON: Record<string, string> = { happy: '♥', angry: '!!', shock: '?!', confused: '?' };

function countHeadAnchor(stack: number): () => { x: number; y: number; z: number } | null {
  return () => {
    const cs = ents.countState(stack, performance.now(), false);
    if (!cs || (cs.flags & CF.BURST) !== 0) return null;
    return { x: cs.x, y: 3.55 - 0.85 * cs.bow, z: cs.z };
  };
}

function photo(kind: string, delay = 260): void {
  window.setTimeout(() => (wantPhoto = kind), delay);
}

function isMine(stack: number | undefined): boolean {
  return stack === undefined || stack < 0 || stack === S.myStack || (S.myStack < 0 && stack === S.spectateStack);
}

function onEvent(e: GameEvent): void {
  const k = e.k;
  const stack = typeof e.stack === 'number' ? e.stack : -1;
  switch (k) {
    case 'say': {
      const text = String(e.text ?? '');
      if (e.who === 'count') {
        labels.bubble('c' + stack, esc(text), 'count', 4500, countHeadAnchor(stack));
        audio.speak(text, stack === 0 ? 0.55 : 1.35, 0.95);
      } else {
        const id = Number(e.npc);
        const nm = String(e.name ?? ents.npcName(id));
        const arch = archById(ents.npcArch(id));
        labels.bubble(
          'n' + id,
          `<b class="who">${esc(nm)}</b>${esc(text)}`,
          e.ask ? 'npc ask' : 'npc',
          e.ask ? 9000 : 4800,
          () => {
            const p = ents.npcPos(id);
            return p ? { x: p.x, y: p.y + 0.3, z: p.z } : null;
          },
          0.2,
        );
        if (isMine(stack) || stack < 0) audio.speak(text, arch.pitch, arch.rate);
      }
      break;
    }
    case 'susp': {
      if (!isMine(stack)) break;
      const d = Number(e.d);
      if (Math.abs(d) >= 1) ui.feed(`${d > 0 ? '+' : ''}${Math.round(d)} Şüphe · ${String(e.why)}`, d > 0 ? 'bad' : 'good');
      break;
    }
    case 'splash': {
      const liquid = String(e.liquid);
      const onto = String(e.onto);
      fx.splash(Number(e.x), Number(e.y), Number(e.z), liquid, Number(e.amt), onto);
      audio.play('splash', Math.min(1, 0.4 + Number(e.amt)));
      if (onto === 'coat' && stack >= 0) ents.stainCount(stack, liquid, Number(e.y));
      if (onto === 'npc') {
        ents.stainNpc(Number(e.npc), liquid, Number(e.y));
        photo('spillNpc');
      }
      break;
    }
    case 'eat':
      audio.play('eat');
      if (isMine(stack) && e.what !== 'wine') ui.feed(e.what === 'soup' ? 'Mmm, çorba!' : 'Nefis!', 'good');
      break;
    case 'scoop':
      if (isMine(stack)) audio.play('scoop');
      break;
    case 'crash': {
      const broke = !!e.broke;
      fx.crash(Number(e.x), Number(e.y), Number(e.z), broke);
      audio.play('crash', Math.min(1, 0.3 + Number(e.mag) / 8));
      if (broke) photo('shatter');
      break;
    }
    case 'react': {
      const id = Number(e.npc);
      const mood = String(e.mood);
      labels.bubble(
        'r' + id,
        MOOD_ICON[mood] ?? '?',
        'react ' + mood,
        1700,
        () => {
          const p = ents.npcPos(id);
          return p ? { x: p.x, y: p.y + 0.45, z: p.z } : null;
        },
        0.5,
      );
      if (mood === 'shock') audio.play('gasp', 0.6);
      break;
    }
    case 'burst':
      fx.burst(Number(e.x), Number(e.z));
      audio.play('pop');
      audio.play('alarm');
      ui.banner(`${STACK_NAMES[stack] ?? 'Kont'}: PALTO PATLADI!`);
      if (stack === S.myStack) photo('burst', 120);
      else photo('burst', 200);
      break;
    case 'spawn':
      ents.spawn(e.def as never);
      if ((e.def as { type: string }).type === 'guard') audio.play('alarm', 0.5);
      break;
    case 'despawn':
      ents.despawn(Number(e.id));
      break;
    case 'caught':
      audio.play('bump');
      ui.feed(`${nameOfPlayer(Number(e.player))} yakalandı!`, 'bad');
      photo('caught');
      break;
    case 'rescued':
      ui.feed('Arkadaşın kurtarıldı!', 'good');
      audio.play('ding');
      photo('rescued');
      break;
    case 'restack':
      audio.play('fanfare', 0.7);
      fx.confetti(Number(e.x), 2, Number(e.z));
      ui.feed('Trençkot yeniden yığıldı!', 'good');
      photo('restack');
      if (stack === S.myStack) needYawInit = true;
      break;
    case 'grab':
      if (stack === S.myStack) audio.play('grab');
      break;
    case 'drop':
      if (stack === S.myStack) audio.play('drop');
      break;
    case 'slap':
      audio.play('slap', 0.7);
      break;
    case 'hit':
      audio.play('slap');
      audio.play('gasp');
      fx.shake = Math.max(fx.shake, 0.25);
      photo('slap', 140);
      break;
    case 'obj':
      if (isMine(stack)) {
        audio.play('ding');
        ui.feed('Hedef tamam!', 'good');
      }
      break;
    case 'banner':
      if (isMine(stack)) ui.banner(String(e.text));
      break;
    case 'clink':
      fx.clink(Number(e.x), Number(e.y), Number(e.z));
      audio.play('clink');
      photo('toast', 150);
      break;
    case 'toast':
      fx.confetti(Number(e.x), 3.5, Number(e.z));
      audio.play('fanfare');
      photo('waltzDone', 200);
      break;
    case 'greet': {
      if (!isMine(stack)) break;
      if (e.phase === 'prompt') {
        ui.banner(`${String(e.hint)}!`);
        audio.play('bell');
      } else if (e.phase === 'ok') {
        audio.play('ding');
        ui.feed(e.bonus ? 'Doğru selam + nezaket bonusu!' : 'Doğru selam!', 'good');
      } else if (e.phase === 'fail') {
        audio.play('womp', 0.6);
        ui.feed('Selam kaçtı...', 'bad');
      }
      break;
    }
    case 'answer':
      if (isMine(stack)) {
        ui.feed(String(e.text), e.ok ? 'good' : 'bad');
        audio.play(e.ok ? 'ding' : 'womp', 0.7);
      }
      break;
    case 'link':
      audio.play('link');
      break;
    default:
      break;
  }
}

function nameOfPlayer(id: number): string {
  return S.players.find((p) => p.id === id)?.name ?? 'Biri';
}

// ---------------------------------------------------------------- döngü

let last = performance.now();
let sendAcc = 0;
let statAcc = 0;
let fpsAvg = 60;

function resize(): void {
  world.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

canvas.addEventListener('click', () => {
  if ((S.phase === 'playing' || S.phase === 'briefing') && !input.locked) {
    audio.init();
    input.requestLock();
  }
});

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  fpsAvg += (1 / Math.max(dt, 1e-4) - fpsAvg) * 0.05;
  S.fps = fpsAvg;

  const inGame = S.phase === 'briefing' || S.phase === 'playing';
  // çaylak modu geçişi
  const kid = ents.kidOf(S.me.id);
  if (!!kid !== S.inKidMode) {
    S.inKidMode = !!kid;
    if (kid) input.enterKid(kid.yaw);
  }
  // girdi
  if (inGame && input.locked) {
    const reach = S.tuning.handReach;
    const msg = input.update(dt, reach, S.inKidMode);
    sendAcc += dt;
    if (msg && sendAcc >= 1 / 30) {
      sendAcc = 0;
      if (S.phase === 'playing') {
        net.send({ t: 'inp', seq: input.nextSeq(), ...msg });
        input.sent();
      }
    }
  } else if (S.phase === 'sceneEnd' && input.locked) input.releaseLock();

  // sahne
  const sides: Array<0 | 1> = [];
  if (S.mySlots.includes('handL')) sides.push(0);
  if (S.mySlots.includes('handR')) sides.push(1);
  ents.update(now, dt, t, S.myStack >= 0 && sides.length > 0 ? { stack: S.myStack, sides } : null);
  const cam = updateCamera({ world, ents, input, fx, nowMs: now, t, dt });
  fx.update(dt);
  labels.update(world.camera, window.innerWidth, window.innerHeight);
  ui.frame(now, fpsAvg, interp.snapsPerSec, cam.view);
  world.renderer.render(world.scene, world.camera);

  if (wantPhoto) {
    capturePhoto(wantPhoto);
    wantPhoto = null;
  }

  statAcc += dt;
  if (statAcc > 3 && S.connected) {
    statAcc = 0;
    net.send({ t: 'stats', fps: fpsAvg, rtt: net.rtt });
    S.rtt = net.rtt;
  }
}

function capturePhoto(kind: string): void {
  try {
    const w = 400;
    const h = 225;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.drawImage(canvas, 0, 0, w, h);
    const url = c.toDataURL('image/jpeg', 0.62);
    const list = ui.photos.get(kind) ?? [];
    list.push(url);
    if (list.length > 3) list.shift();
    ui.photos.set(kind, list);
  } catch {
    /* yoksay */
  }
}

// ---------------------------------------------------------------- başlangıç

ui.showMenu();
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __tk: unknown }).__tk = { S, ents, input, world, interp, net, fx, ui, audio, labels };
}
// Kayıtlı adı olan ev sahibi için kolaylık: ?autojoin=1
if (new URLSearchParams(location.search).get('autojoin') && S.settings.name) {
  S.err = '';
  net.connect();
}
requestAnimationFrame(frame);
