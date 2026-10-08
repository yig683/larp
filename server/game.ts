// Bir skeçin (sahnenin) otoriter simülasyonu. Ağdan bağımsızdır: Room girdileri verir, snapshot/olay alır.
//
// Ağ olayları (GameEvent.k): say, susp, splash, eat, scoop, crash, react, burst, spawn, despawn, caught, released,
// restack, grab, drop, slap, obj, banner, wheel, clink, toast, greet, answer, hit

import {
  COUNT,
  DT,
  G,
  G_ALL,
  GUARD_DIM,
  HAND,
  ID,
  KEYFRAME_EVERY_S,
  KID,
  NPC_DIM,
  SLOT_IDS,
  STACK_NAMES,
  groups,
  type SlotId,
} from '../shared/constants';
import { buildSalon, sceneExtras, type LevelDef, type SceneExtras } from '../shared/level';
import { NavGrid } from '../shared/nav';
import { clamp, dist2, wrapPi } from '../shared/math';
import { PHRASES, QUESTIONS, fmt, phrasesByTag, titleOf, type PhraseTag } from '../shared/phrases';
import { propKind, type PropKind } from '../shared/props';
import type {
  BodyState,
  CharState,
  ContState,
  CountState,
  EntityDef,
  GameEvent,
  HudState,
  InputMsg,
  SceneId,
  SceneInfo,
  SceneResult,
  Snapshot,
  StackHud,
} from '../shared/protocol';
import { CF, CH } from '../shared/protocol';
import { Rng } from '../shared/rng';
import type { StackAssign } from '../shared/roles';
import type { Tuning } from '../shared/tuning';
import { BurstSystem } from './burst';
import { CountSystem } from './counts';
import { CountRt, GuardRt, HandRt, KidRt, NpcRt, PropRt } from './entities';
import { NpcSystem } from './npcs';
import { PropSystem } from './props';
import { RAPIER, addStaticShapes, type RWorld } from './rapier';
import { createScene } from './scenes';
import type { SceneLogic } from './scenes/types';

export interface PlayerLite {
  id: number;
  name: string;
  color: number;
}

export interface GameOpts {
  scene: SceneId;
  index: number;
  total: number;
  assigns: StackAssign[];
  players: Map<number, PlayerLite>;
  tuning: Tuning;
  seed: number;
}

export interface StoryEvent {
  t: number;
  kind: string;
  stack: number;
  w: number;
  a?: string;
  b?: string;
  n?: number;
}

export interface QuestionRt {
  npcId: number;
  tag: PhraseTag;
  text: string;
  expires: number;
}
export interface WheelRt {
  offered: number[];
  q: QuestionRt | null;
}

export const COUNT_G = [G.COUNT0, G.COUNT1] as const;
export const HAND_G = [G.HAND0, G.HAND1] as const;
export const HELD_G = [G.HELD0, G.HELD1] as const;

/**
 * Eşyanın çarpışma grupları. Kase ve kaşık birbirinden "geçer" (kaşık çorbaya dalabilsin), ellerden de geçer.
 * `held` = tutan yığın (-1: serbest).
 */
export function propGroups(kind: string, held: number): number {
  const isBowl = kind === 'bowl';
  const isSpoon = kind === 'spoon';
  const ownExcl = held >= 0 ? COUNT_G[held]! | HAND_G[held]! | HELD_G[held]! : 0;
  if (isBowl || isSpoon) {
    const own = isBowl ? G.BOWL : G.SPOON;
    const mem = held >= 0 ? HELD_G[held]! | own : own;
    const filter = G_ALL & ~(isBowl ? G.SPOON : G.BOWL) & ~ownExcl;
    return groups(mem, filter);
  }
  if (held < 0) return groups(G.PROP, G_ALL);
  return groups(HELD_G[held]!, G_ALL & ~ownExcl);
}

export class Game {
  readonly world: RWorld;
  readonly tuning: Tuning;
  readonly rng: Rng;
  readonly level: LevelDef;
  readonly extras: SceneExtras;
  readonly navGuard: NavGrid;
  readonly scene: SceneLogic;
  readonly info: SceneInfo;
  readonly players: Map<number, PlayerLite>;

  tick = 0;
  time = 0;
  counts: CountRt[] = [];
  props = new Map<number, PropRt>();
  npcs = new Map<number, NpcRt>();
  kids = new Map<number, KidRt>();
  guards = new Map<number, GuardRt>();
  wheels: WheelRt[] = [];
  lastSay: Array<{ tag: string; t: number }> = [];
  events: GameEvent[] = [];
  story: StoryEvent[] = [];
  result: SceneResult | null = null;
  endT = 0;

  private nextProp = ID.propBase;
  private nextNpc = ID.npcBase;
  private nextKid = ID.kidBase;
  private nextGuard = ID.guardBase;
  private lastKey = -999;
  private forced = false;

  readonly countSys: CountSystem;
  readonly propSys: PropSystem;
  readonly npcSys: NpcSystem;
  readonly burstSys: BurstSystem;

  constructor(readonly opts: GameOpts) {
    this.tuning = opts.tuning;
    this.rng = new Rng(opts.seed);
    this.players = opts.players;
    this.level = buildSalon();
    this.extras = sceneExtras(opts.scene);
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = DT;
    const shapes = [...this.level.shapes, ...this.extras.shapes];
    addStaticShapes(this.world, shapes);
    this.navGuard = NavGrid.build(this.level.bounds, shapes, GUARD_DIM.radius + 0.05, GUARD_DIM.height, 0.5);

    this.scene = createScene(opts.scene);
    this.info = {
      id: opts.scene,
      index: opts.index,
      total: opts.total,
      title: this.scene.title,
      intro: this.scene.intro,
      hint: this.scene.hint,
    };

    for (const a of opts.assigns) {
      this.counts.push(this.makeCount(a));
      this.wheels.push({ offered: [], q: null });
      this.lastSay.push({ tag: '', t: -99 });
    }

    this.countSys = new CountSystem(this);
    this.propSys = new PropSystem(this);
    this.npcSys = new NpcSystem(this);
    this.burstSys = new BurstSystem(this);

    this.scene.setup(this);
    for (const c of this.counts) this.refreshWheel(c.stack);
  }

  // ------------------------------------------------------------------ kurulum

  private makeCount(a: StackAssign): CountRt {
    const s = a.stack;
    const c = new CountRt(s, a);
    const sp = (this.scene ?? createScene(this.opts.scene)).spawn(s, this.opts.assigns.length);
    c.x = sp.x;
    c.z = sp.z;
    c.yaw = sp.yaw;
    const other = 1 - s;
    c.filterGroups = groups(COUNT_G[s]!, G.STATIC | G.PROP | G.NPC | G.GUARD | COUNT_G[other]! | HAND_G[other]! | HELD_G[other]!);
    c.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(c.x, COUNT.height / 2, c.z));
    const half = (COUNT.height - 2 * COUNT.radius) / 2;
    c.collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(half, COUNT.radius).setCollisionGroups(c.filterGroups).setFriction(0.2), c.body);
    c.cc = this.world.createCharacterController(0.02);
    c.cc.setUp({ x: 0, y: 1, z: 0 });
    c.cc.setSlideEnabled(true);
    c.cc.setApplyImpulsesToDynamicBodies(true);
    c.cc.setCharacterMass(70);
    for (const h of c.hands) this.makeHand(c, h);
    return c;
  }

  makeHand(c: CountRt, h: HandRt): void {
    const s = c.stack;
    const other = 1 - s;
    const rest = HandRt.rest(h.side);
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(c.x + (h.side === 0 ? -COUNT.shoulderX : COUNT.shoulderX) + rest.x, COUNT.shoulderY + rest.y, c.z - rest.f)
      .setGravityScale(0)
      .setLinearDamping(1.2)
      .setAngularDamping(4)
      .setCcdEnabled(true)
      .lockRotations();
    h.body = this.world.createRigidBody(desc);
    h.collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(HAND.radius)
        .setMass(HAND.mass)
        .setFriction(0.02)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0.1)
        .setCollisionGroups(groups(HAND_G[s]!, G.STATIC | G.PROP | G.NPC | COUNT_G[other]! | HAND_G[other]! | HELD_G[other]!)),
      h.body,
    );
  }

  spawnProp(kindName: string, x: number, y: number, z: number, opts: { ry?: number; sleep?: boolean; id?: number } = {}): PropRt {
    const k: PropKind = propKind(kindName);
    const id = opts.id ?? this.nextProp++;
    const p = new PropRt(id, k, x, y, z);
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.08)
      .setAngularDamping(0.5)
      .setCcdEnabled(k.mass < 2)
      .setSleeping(opts.sleep ?? true);
    if (opts.ry) desc.setRotation({ x: 0, y: Math.sin(opts.ry / 2), z: 0, w: Math.cos(opts.ry / 2) });
    p.body = this.world.createRigidBody(desc);
    let cd: RAPIER.ColliderDesc;
    switch (k.shape) {
      case 'ball':
        cd = RAPIER.ColliderDesc.ball(k.dim[0]!);
        break;
      case 'box':
        cd = RAPIER.ColliderDesc.cuboid(k.dim[0]!, k.dim[1]!, k.dim[2]!);
        break;
      default:
        cd = RAPIER.ColliderDesc.cylinder(k.dim[0]!, k.dim[1]!);
    }
    cd.setMass(k.mass).setFriction(k.friction).setRestitution(k.restitution).setCollisionGroups(propGroups(kindName, -1));
    p.collider = this.world.createCollider(cd, p.body);
    this.props.set(id, p);
    return p;
  }

  removeProp(p: PropRt): void {
    for (const h of p.holders.slice()) this.countSys.release(h);
    this.world.removeRigidBody(p.body);
    this.props.delete(p.id);
    this.emit({ k: 'despawn', id: p.id });
  }

  spawnNpc(arch: string, name: string, x: number, z: number, yaw: number, tag = ''): NpcRt {
    const id = this.nextNpc++;
    const n = new NpcRt(id, arch, name, x, z, yaw);
    n.tag = tag;
    n.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, NPC_DIM.height / 2, z));
    const half = (NPC_DIM.height - 2 * NPC_DIM.radius) / 2;
    n.collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(half, NPC_DIM.radius).setCollisionGroups(groups(G.NPC, G_ALL)).setFriction(0.3), n.body);
    this.npcs.set(id, n);
    return n;
  }

  newKidId(): number {
    return this.nextKid++;
  }
  newGuardId(): number {
    return this.nextGuard++;
  }

  // ------------------------------------------------------------------ olay / hikâye

  emit(ev: GameEvent): void {
    this.events.push(ev);
  }
  log(kind: string, stack: number, w: number, extra: Partial<StoryEvent> = {}): void {
    this.story.push({ t: this.time, kind, stack, w, ...extra });
  }
  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ------------------------------------------------------------------ girdi

  /** Bir oyuncunun girdisini, sahip olduğu slotlara dağıtır. */
  setInput(playerId: number, m: InputMsg): void {
    // Çaylak modu: oyuncunun kendi çaylağı varsa girdi ona gider.
    for (const k of this.kids.values()) {
      if (k.playerId === playerId) {
        k.mx = clamp(m.mx ?? 0, -1, 1);
        k.mz = clamp(m.mz ?? 0, -1, 1);
        if (typeof m.yaw === 'number' && Number.isFinite(m.yaw)) k.wantYaw = m.yaw;
        k.run = !!m.run;
        k.use = !!m.use;
        return;
      }
    }
    for (const c of this.counts) {
      if (c.mode !== 'stacked') continue;
      const own = (slot: SlotId): boolean => c.assign.slots[slot] === playerId;
      if (own('legs')) {
        c.input.mx = clamp(m.mx ?? 0, -1, 1);
        c.input.mz = clamp(m.mz ?? 0, -1, 1);
        if (typeof m.yaw === 'number' && Number.isFinite(m.yaw)) c.input.yaw = m.yaw;
        c.input.run = !!m.run;
        c.input.bow = !!m.bow;
      }
      if (own('head')) {
        if (typeof m.hyaw === 'number' && Number.isFinite(m.hyaw)) c.input.hyaw = clamp(m.hyaw, -COUNT.headYawMax, COUNT.headYawMax);
        if (typeof m.hpitch === 'number' && Number.isFinite(m.hpitch)) c.input.hpitch = clamp(m.hpitch, -COUNT.headPitchMax, COUNT.headPitchMax);
        c.input.mouth = !!m.mouth;
      }
      const setHand = (h: HandRt, src: InputMsg['hl']): void => {
        if (!src) return;
        const r = this.tuning.handReach;
        h.input.x = clamp(Number.isFinite(src.x) ? src.x : 0, -r, r);
        h.input.y = clamp(Number.isFinite(src.y) ? src.y : 0, -r, r);
        h.input.f = clamp(Number.isFinite(src.f) ? src.f : 0, -0.4, r);
        h.input.grip = !!src.grip;
        h.input.slap = !!src.slap;
      };
      if (own('handL')) setHand(c.hands[0], m.hl);
      if (own('handR')) setHand(c.hands[1], m.hr);
    }
  }

  /** Oyuncu oyundan ayrıldı: girdileri sıfırla, çaylağı varsa kaldır. */
  dropPlayer(playerId: number): void {
    this.clearInput(playerId);
    this.burstSys.dropPlayer(playerId);
  }

  /** Oyuncu bağlantısı koptuysa girdilerini sıfırla. */
  clearInput(playerId: number): void {
    for (const c of this.counts) {
      if (c.assign.slots.legs === playerId) {
        c.input.mx = 0;
        c.input.mz = 0;
        c.input.run = false;
        c.input.bow = false;
      }
      if (c.assign.slots.head === playerId) c.input.mouth = false;
      for (const h of c.hands) {
        const slot: SlotId = h.side === 0 ? 'handL' : 'handR';
        if (c.assign.slots[slot] === playerId) h.input.grip = false;
      }
    }
    for (const k of this.kids.values()) {
      if (k.playerId === playerId) {
        k.mx = 0;
        k.mz = 0;
        k.use = false;
      }
    }
  }

  // ------------------------------------------------------------------ söylem çarkı & sorular

  refreshWheel(stack: number): void {
    const w = this.wheels[stack];
    if (!w) return;
    const used = new Set<number>();
    const picks: number[] = [];
    const take = (list: readonly { id: number }[]): void => {
      for (let i = 0; i < 12 && list.length > 0; i++) {
        const p = list[this.rng.int(list.length)]!;
        if (!used.has(p.id)) {
          used.add(p.id);
          picks.push(p.id);
          return;
        }
      }
    };
    if (w.q) {
      take(phrasesByTag(w.q.tag));
      take(phrasesByTag('kötü'));
      if (this.rng.chance(0.4)) take(phrasesByTag('kötü'));
    } else if (this.rng.chance(0.55)) {
      take(phrasesByTag('kötü'));
    }
    const others = PHRASES.filter((p) => p.tag !== 'kötü' && p.tag !== w.q?.tag);
    let guard = 0;
    while (picks.length < 6 && guard++ < 40) take(others);
    w.offered = this.rng.shuffle(picks);
    this.emit({
      k: 'wheel',
      stack,
      q: w.q ? w.q.text : '',
      phrases: w.offered.map((id) => ({ i: id, text: PHRASES[id]!.text })),
    });
  }

  askQuestion(npcId: number, stack: number, tag?: PhraseTag): boolean {
    const w = this.wheels[stack];
    const npc = this.npcs.get(npcId);
    const c = this.counts[stack];
    if (!w || !npc || !c || c.mode !== 'stacked' || w.q) return false;
    const pool = tag ? QUESTIONS.filter((q) => q.tag === tag) : QUESTIONS;
    const q = pool[this.rng.int(pool.length)]!;
    w.q = { npcId, tag: q.tag, text: fmt(q.text, stack), expires: this.time + 14 };
    this.emit({ k: 'say', stack, who: 'npc', npc: npcId, name: npc.name, text: w.q.text, tag: q.tag, ask: 1 });
    this.refreshWheel(stack);
    return true;
  }

  /** Kafa oyuncusu çarktan bir cümle seçti. */
  sayPhrase(stack: number, index: number): void {
    const c = this.counts[stack];
    const w = this.wheels[stack];
    if (!c || !w || c.mode !== 'stacked') return;
    const pid = w.offered[index];
    const ph = pid === undefined ? undefined : PHRASES[pid];
    if (!ph) return;
    if (c.chew > 0 || c.mouth > 0.45) {
      this.emit({ k: 'say', stack, who: 'count', text: 'Mmmf mmf... mmmf!', tag: 'garble' });
      this.addSusp(stack, 4, 'ağzı dolu konuştu', c.x, c.z);
      this.log('garble', stack, 2);
      return;
    }
    this.emit({ k: 'say', stack, who: 'count', text: ph.text, tag: ph.tag });
    this.lastSay[stack] = { tag: ph.tag, t: this.time };
    const q = w.q;
    if (q) {
      const npc = this.npcs.get(q.npcId);
      w.q = null;
      if (ph.tag === q.tag) {
        c.stats.correct++;
        this.addSusp(stack, -12, 'doğru cevap', c.x, c.z, true);
        this.emit({ k: 'answer', stack, ok: 1, text: 'Doğru cevap!' });
        if (npc) this.npcSys.react(npc, 'happy', 'good', stack);
        this.log('correct', stack, 3, { a: npc?.name ?? '', b: ph.text });
      } else if (ph.tag === 'kötü') {
        c.stats.wrong++;
        this.addSusp(stack, 15, 'yoksulluk ağzından kaçtı', c.x, c.z);
        this.emit({ k: 'answer', stack, ok: 0, text: 'Olamaz, ağzından kaçtı!' });
        if (npc) this.npcSys.react(npc, 'angry', 'bad', stack);
        this.log('poor', stack, 6, { a: npc?.name ?? '', b: ph.text });
      } else {
        c.stats.wrong++;
        this.addSusp(stack, 7, 'konu dışı cevap', c.x, c.z);
        this.emit({ k: 'answer', stack, ok: 0, text: 'Konu dışı bir cevap...' });
        if (npc) this.npcSys.react(npc, 'confused', 'bad', stack);
        this.log('offtopic', stack, 3, { a: npc?.name ?? '', b: ph.text });
      }
    } else {
      // Serbest konuşma: yakındaki NPC'ler duyar
      const near = this.nearestNpc(c.x, c.z, 6);
      if (near) {
        if (ph.tag === 'kötü') {
          this.addSusp(stack, 10, 'yoksulluk ağzından kaçtı', c.x, c.z);
          this.npcSys.react(near, 'angry', 'bad', stack);
          this.log('poor', stack, 6, { a: near.name, b: ph.text });
        } else if (ph.tag === 'garip') {
          this.addSusp(stack, 4, 'tuhaf cümle', c.x, c.z);
          this.npcSys.react(near, 'confused', 'suspicious', stack);
        } else {
          this.addSusp(stack, -3, 'zarif cümle', c.x, c.z, true);
          this.npcSys.react(near, 'happy', 'good', stack);
        }
      }
    }
    this.refreshWheel(stack);
  }

  // ------------------------------------------------------------------ Şüphe

  hasWitness(x: number, z: number): boolean {
    const r = this.tuning.suspRange;
    for (const n of this.npcs.values()) if (dist2(n.x, n.z, x, z) < r) return true;
    for (const g of this.guards.values()) if (dist2(g.x, g.z, x, z) < r) return true;
    return false;
  }

  nearestNpc(x: number, z: number, maxD: number): NpcRt | null {
    let best: NpcRt | null = null;
    let bd = maxD;
    for (const n of this.npcs.values()) {
      const d = dist2(n.x, n.z, x, z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** Şüphe ekle/çıkar. `trusted` = tanık gerektirmeyen ödül/ceza. */
  addSusp(stack: number, amount: number, why: string, x: number, z: number, trusted = false): void {
    const c = this.counts[stack];
    if (!c || c.mode !== 'stacked') return;
    let a = amount;
    if (a > 0) {
      a *= this.tuning.suspMult;
      if (!trusted && !this.hasWitness(x, z)) a *= 0.25;
      if (c.grace > 0) a *= 0.3;
      c.calm = 0;
    }
    const before = c.susp;
    c.susp = clamp(c.susp + a, 0, 100);
    c.peak = Math.max(c.peak, c.susp);
    if (Math.abs(c.susp - before) >= 0.5) this.emit({ k: 'susp', stack, d: Math.round((c.susp - before) * 10) / 10, why, x, z });
    if (c.susp >= 100) this.burstSys.burst(c);
  }

  // ------------------------------------------------------------------ adım

  step(): void {
    const dt = DT;
    this.time += dt;
    this.tick++;
    this.countSys.update(dt);
    this.burstSys.preStep(dt);
    this.npcSys.update(dt);
    this.world.step();
    this.propSys.update(dt);
    this.countSys.post(dt);
    this.burstSys.update(dt);
    this.scene.update(this, dt);
    this.updateSuspicion(dt);
    this.checkEnd();
  }

  private updateSuspicion(dt: number): void {
    for (const c of this.counts) {
      if (c.mode !== 'stacked') continue;
      c.calm += dt;
      if (c.grace > 0) c.grace -= dt;
      if (c.calm > 2.5 && c.susp > 0) c.susp = Math.max(0, c.susp - this.tuning.suspDecay * dt);
    }
    for (let s = 0; s < this.wheels.length; s++) {
      const w = this.wheels[s]!;
      const c = this.counts[s]!;
      if (w.q && this.time > w.q.expires) {
        const npc = this.npcs.get(w.q.npcId);
        w.q = null;
        if (c.mode === 'stacked') {
          c.stats.wrong++;
          this.addSusp(s, 8, 'soruyu cevapsız bıraktı', c.x, c.z);
          this.emit({ k: 'answer', stack: s, ok: 0, text: 'Cevap vermedin!' });
          if (npc) this.npcSys.react(npc, 'angry', 'fail', s);
          this.log('silent', s, 3, { a: npc?.name ?? '' });
        }
        this.refreshWheel(s);
      }
    }
  }

  private checkEnd(): void {
    if (this.result) return;
    const oc = this.scene.outcome(this);
    const limit = this.scene.timeLimit * this.tuning.timeMult;
    const timeUp = this.forced || (limit > 0 && this.time >= limit);
    const allOut = this.counts.length > 0 && this.counts.every((c) => c.mode === 'failed');
    if (!oc && !timeUp && !allOut) return;
    const perStack = oc?.perStack ?? this.counts.map(() => false);
    const lines = oc?.lines ?? [];
    if (timeUp && !oc) lines.push('Süre doldu!');
    if (allOut && !oc) lines.push('Her iki Kont de rezil oldu!');
    const stacks = this.counts.map((c, i) => {
      const ok = !!perStack[i];
      const timeLeft = limit > 0 ? Math.max(0, limit - this.time) : 0;
      let score = 0;
      if (ok) score += 300 + Math.round(timeLeft * 1.5);
      score += c.score;
      score += Math.round(Math.max(0, 100 - c.peak));
      score -= c.bursts * 60;
      score = Math.max(0, Math.round(score));
      return { stack: i, score, success: ok, bursts: c.bursts, peak: Math.round(c.peak) };
    });
    this.result = {
      scene: this.opts.scene,
      title: this.scene.title,
      success: stacks.length > 0 && stacks.every((s) => s.success),
      lines,
      stacks,
    };
    this.endT = this.time;
    for (const c of this.counts) c.score = stacks[c.stack]!.score;
  }

  // ------------------------------------------------------------------ yayın

  entityDefs(): EntityDef[] {
    const out: EntityDef[] = [];
    for (const p of this.props.values()) {
      const t = p.body.translation();
      const q = p.body.rotation();
      out.push({ id: p.id, type: 'prop', kind: p.kind.kind, x: t.x, y: t.y, z: t.z, q: [q.x, q.y, q.z, q.w] });
    }
    for (const n of this.npcs.values()) out.push({ id: n.id, type: 'npc', arch: n.arch, name: n.name, x: n.x, z: n.z, yaw: n.yaw });
    for (const g of this.guards.values()) out.push({ id: g.id, type: 'guard', x: g.x, z: g.z, yaw: g.yaw });
    for (const k of this.kids.values()) {
      out.push({ id: k.id, type: 'kid', stack: k.stack, player: k.playerId, name: k.name, color: k.color, x: k.x, z: k.z, yaw: k.yaw });
    }
    for (const c of this.counts) {
      if (c.mode === 'burst') out.push({ id: ID.coatPile(c.stack), type: 'coat', stack: c.stack, x: c.pileX, z: c.pileZ, yaw: c.yaw });
    }
    return out;
  }

  /** Tüm cisimleri içeren (full) ya da yalnızca değişenleri içeren snapshot. */
  buildSnapshot(full: boolean, commit = true): Snapshot {
    const bodies: BodyState[] = [];
    const conts: ContState[] = [];
    const chars: CharState[] = [];
    for (const c of this.counts) {
      for (const h of c.hands) {
        const t = h.body.translation();
        bodies.push({ id: h.id, x: t.x, y: t.y, z: t.z, qx: 0, qy: 0, qz: 0, qw: 1 });
      }
    }
    for (const p of this.props.values()) {
      const t = p.body.translation();
      const q = p.body.rotation();
      const s = p.sent;
      const moved =
        Math.abs(t.x - s.x) > 0.004 ||
        Math.abs(t.y - s.y) > 0.004 ||
        Math.abs(t.z - s.z) > 0.004 ||
        Math.abs(q.x - s.qx) > 0.004 ||
        Math.abs(q.y - s.qy) > 0.004 ||
        Math.abs(q.z - s.qz) > 0.004 ||
        Math.abs(q.w - s.qw) > 0.004;
      if (full || moved) {
        bodies.push({ id: p.id, x: t.x, y: t.y, z: t.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w });
        if (commit) {
          s.x = t.x;
          s.y = t.y;
          s.z = t.z;
          s.qx = q.x;
          s.qy = q.y;
          s.qz = q.z;
          s.qw = q.w;
        }
      }
      if (p.kind.container) {
        const cs = p.sent;
        if (full || Math.abs(p.load - cs.load) > 0.004 || Math.abs(p.slosh.x - cs.sx) > 0.02 || Math.abs(p.slosh.z - cs.sz) > 0.02) {
          conts.push({ id: p.id, load: p.load / p.kind.container.cap, sx: p.slosh.x, sz: p.slosh.z });
          if (commit) {
            cs.load = p.load;
            cs.sx = p.slosh.x;
            cs.sz = p.slosh.z;
          }
        }
      }
    }
    const pushChar = (id: number, x: number, z: number, yaw: number, st: number, aux: number, sent: { x: number; z: number; yaw: number; st: number; aux: number }): void => {
      if (full || Math.abs(x - sent.x) > 0.004 || Math.abs(z - sent.z) > 0.004 || Math.abs(wrapPi(yaw - sent.yaw)) > 0.01 || st !== sent.st || aux !== sent.aux) {
        chars.push({ id, x, z, yaw, st, aux });
        if (commit) {
          sent.x = x;
          sent.z = z;
          sent.yaw = yaw;
          sent.st = st;
          sent.aux = aux;
        }
      }
    };
    for (const n of this.npcs.values()) pushChar(n.id, n.x, n.z, n.yaw, n.st, n.aux, n.sent);
    for (const k of this.kids.values()) pushChar(k.id, k.x, k.z, k.yaw, k.st, Math.min(255, Math.round(Math.hypot(k.vx, k.vz) * 40)), k.sent);
    for (const g of this.guards.values()) pushChar(g.id, g.x, g.z, g.yaw, CH.RUN, Math.min(255, Math.round(Math.hypot(g.vx, g.vz) * 40)), g.sent);
    const counts: CountState[] = this.counts.map((c) => {
      let flags = 0;
      if (c.mode !== 'stacked') flags |= CF.BURST;
      if (c.chew > 0) flags |= CF.CHEW;
      if (c.hands[0].input.grip) flags |= CF.GRIP_L;
      if (c.hands[1].input.grip) flags |= CF.GRIP_R;
      if (c.hands[0].slapT > 0) flags |= CF.SLAP_L;
      if (c.hands[1].slapT > 0) flags |= CF.SLAP_R;
      if (c.hands.some((h) => h.link || h.linkNpc)) flags |= CF.LINKED;
      return {
        stack: c.stack,
        x: c.x,
        z: c.z,
        yaw: c.yaw,
        headYaw: c.headYaw,
        headPitch: c.headPitch,
        mouth: c.mouth,
        bow: c.bow,
        sway: c.sway,
        susp: c.susp,
        flags,
        stain: c.stain,
      };
    });
    return { tick: this.tick, bodies, chars, counts, conts };
  }

  /** Ev sahibi sahneyi erken bitirir (süre doldu gibi). */
  forceFinish(): void {
    this.forced = true;
  }

  wheelMsg(stack: number): { t: 'wheel'; stack: number; q: string; phrases: Array<{ i: number; text: string }> } | null {
    const w = this.wheels[stack];
    if (!w) return null;
    return { t: 'wheel', stack, q: w.q ? w.q.text : '', phrases: w.offered.map((id) => ({ i: id, text: PHRASES[id]!.text })) };
  }

  /** Anahtar snapshot zamanı geldi mi. */
  needKeyframe(): boolean {
    if (this.time - this.lastKey >= KEYFRAME_EVERY_S) {
      this.lastKey = this.time;
      return true;
    }
    return false;
  }

  buildHud(): HudState {
    const limit = this.scene.timeLimit * this.tuning.timeMult;
    const stacks: StackHud[] = this.counts.map((c) => ({
      susp: Math.round(c.susp * 10) / 10,
      bursts: c.bursts,
      maxBursts: this.tuning.maxBursts,
      mode: c.mode === 'stacked' ? 'stacked' : 'burst',
      restack: Math.round(c.restack * 100) / 100,
      score: c.score,
      obj: this.scene.objectives(this, c.stack),
    }));
    return { t: 'hud', time: limit > 0 ? Math.max(0, limit - this.time) : -1, elapsed: this.time, stacks, banner: this.scene.banner(this) };
  }

  stackName(stack: number): string {
    return STACK_NAMES[stack] ?? `Yığın ${stack + 1}`;
  }
  titleOf(stack: number): string {
    return titleOf(stack);
  }

  /** Slot sahibi oyuncu isimleri (HUD/gazete için). */
  playerName(id: number): string {
    return this.players.get(id)?.name ?? `Oyuncu ${id}`;
  }

  dispose(): void {
    this.world.free();
  }
}

export { SLOT_IDS, KID };
