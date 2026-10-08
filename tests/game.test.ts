import { describe, expect, it } from 'vitest';
import { dist3, type V3 } from '../shared/math';
import { CF } from '../shared/protocol';
import { COUNT } from '../shared/constants';
import { handLocalFor, handPos, makeGame, stepN, useRapier } from './helpers';
import type { Game } from '../server/game';
import type { HandRt, PropRt } from '../server/entities';

useRapier();

/** "Görsel servo": elin hedefini, istenen noktaya götürecek şekilde ayarlar (insan oyuncunun yaptığı gibi). */
function servoTip(g: Game, stack: number, side: 0 | 1, prop: PropRt, goal: V3, grip: boolean, mouth = false): void {
  const c = g.counts[stack]!;
  const h = c.hands[side];
  const cp = g.propSys.consumePoint(prop);
  const hp = handPos(h);
  const handGoal = { x: goal.x - (cp.x - hp.x), y: goal.y - (cp.y - hp.y), z: goal.z - (cp.z - hp.z) };
  const l = handLocalFor(g, c, side, handGoal);
  const owner = c.assign.slots[side === 0 ? 'handL' : 'handR'];
  g.setInput(owner, { t: 'inp', seq: 0, [side === 0 ? 'hl' : 'hr']: { x: l.x, y: l.y, f: l.f, grip, slap: false } });
  if (mouth) g.setInput(c.assign.slots.head, { t: 'inp', seq: 0, mouth: true });
}

function reachHand(g: Game, stack: number, side: 0 | 1, world: V3, grip: boolean): void {
  const c = g.counts[stack]!;
  const l = handLocalFor(g, c, side, world);
  const owner = c.assign.slots[side === 0 ? 'handL' : 'handR'];
  g.setInput(owner, { t: 'inp', seq: 0, [side === 0 ? 'hl' : 'hr']: { x: l.x, y: l.y, f: l.f, grip, slap: false } });
}

function findProp(g: Game, kind: string, nearX: number): PropRt {
  let best: PropRt | null = null;
  let bd = 1e9;
  for (const p of g.props.values()) {
    if (p.kind.kind !== kind) continue;
    const d = Math.abs(p.body.translation().x - nearX);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  if (!best) throw new Error('prop yok: ' + kind);
  return best;
}

describe('Akşam yemeği: temel simülasyon', () => {
  it('8 oyunculu sahne kurulur, eşyalar masada kalır, Kontlar doğduğu yerde', () => {
    const g = makeGame('dinner', 8);
    expect(g.counts).toHaveLength(2);
    stepN(g, 180);
    for (const p of g.props.values()) {
      if (p.kind.kind === 'chair') continue;
      const t = p.body.translation();
      expect(Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.z)).toBe(true);
      expect(t.y).toBeGreaterThan(0.0);
    }
    const bowl = findProp(g, 'bowl', -2.4);
    expect(bowl.body.translation().y).toBeGreaterThan(1.38); // masanın üstünde
    expect(bowl.load).toBeCloseTo(10, 5);
    expect(g.counts[0]!.x).toBeCloseTo(-2.4, 1);
    expect(g.counts[1]!.x).toBeCloseTo(2.4, 1);
    g.dispose();
  });

  it('snapshot üretilir, dar ve geçerli', () => {
    const g = makeGame('dinner', 8);
    stepN(g, 30);
    const full = g.buildSnapshot(true);
    expect(full.counts).toHaveLength(2);
    expect(full.bodies.length).toBeGreaterThan(20);
    const delta = g.buildSnapshot(false);
    expect(delta.bodies.length).toBeLessThanOrEqual(4 + 2); // yalnız eller (+ en fazla birkaç hareketli eşya)
    g.dispose();
  });

  it('Bacaklar yürür ve engele (masaya) çarpınca durur', () => {
    const g = makeGame('dinner', 4);
    const c = g.counts[0]!;
    const legs = c.assign.slots.legs;
    g.setInput(legs, { t: 'inp', seq: 1, mz: 1, mx: 0, yaw: 0 });
    stepN(g, 240);
    // masa kenarına (z=-2.4) kapsül yarıçapı kadar kala durur
    expect(c.z).toBeGreaterThan(-2.0);
    expect(c.z).toBeLessThan(-1.7);
    // geri yürü
    g.setInput(legs, { t: 'inp', seq: 2, mz: -1, mx: 0, yaw: 0 });
    stepN(g, 180);
    expect(c.z).toBeGreaterThan(-1.0);
    g.dispose();
  });

  it('Kaşık: tut → çorbadan al → ağza götür → ye (uçtan uca)', () => {
    const g = makeGame('dinner', 4);
    const c = g.counts[0]!;
    const spoon = findProp(g, 'spoon', 0);
    const bowl = findProp(g, 'bowl', 0);
    const hand: HandRt = c.hands[1];

    // 1) Kaşığa uzan ve tut
    let held = false;
    for (let i = 0; i < 360 && !held; i++) {
      const sp = spoon.body.translation();
      const near = dist3(handPos(hand), sp) < 0.5;
      reachHand(g, 0, 1, { x: sp.x, y: sp.y + 0.12, z: sp.z }, near);
      g.step();
      held = hand.held === spoon;
    }
    expect(held).toBe(true);

    // 2) Ucu çorbaya batır (önce kasenin üstüne, sonra aşağı)
    let loaded = false;
    for (let i = 0; i < 600 && !loaded; i++) {
      const bp = bowl.body.translation();
      const cp = g.propSys.consumePoint(spoon);
      const above = Math.hypot(cp.x - bp.x, cp.z - bp.z) > 0.06;
      servoTip(g, 0, 1, spoon, { x: bp.x, y: bp.y + (above ? 0.16 : 0.0), z: bp.z }, true);
      g.step();
      loaded = spoon.load >= 0.95;
    }
    expect(spoon.load).toBeGreaterThanOrEqual(0.95);
    expect(bowl.load).toBeLessThan(10);

    // 3) Kafa ağzını açar, eller kaşığı ağza taşır
    let eaten = false;
    for (let i = 0; i < 600 && !eaten; i++) {
      const mp = g.countSys.mouthPos(c);
      servoTip(g, 0, 1, spoon, mp, true, true);
      g.step();
      eaten = c.stats.soup >= 0.9;
    }
    expect(c.stats.soup).toBeGreaterThanOrEqual(0.9);
    expect(spoon.load).toBeLessThan(0.1);
    expect(g.events.some((e) => e.k === 'eat')).toBe(true);
    g.dispose();
  });

  it('Ani el sarsıntısı kaşıktaki çorbayı döker, yumuşak hareket dökmez', () => {
    const run = (jerk: boolean): number => {
      const g = makeGame('dinner', 4);
      const c = g.counts[0]!;
      const spoon = findProp(g, 'spoon', 0);
      const bowl = findProp(g, 'bowl', 0);
      const hand = c.hands[1];
      for (let i = 0; i < 360 && hand.held !== spoon; i++) {
        const sp = spoon.body.translation();
        reachHand(g, 0, 1, { x: sp.x, y: sp.y + 0.12, z: sp.z }, dist3(handPos(hand), sp) < 0.5);
        g.step();
      }
      for (let i = 0; i < 600 && spoon.load < 0.95; i++) {
        const bp = bowl.body.translation();
        const cp = g.propSys.consumePoint(spoon);
        const above = Math.hypot(cp.x - bp.x, cp.z - bp.z) > 0.06;
        servoTip(g, 0, 1, spoon, { x: bp.x, y: bp.y + (above ? 0.16 : 0.0), z: bp.z }, true);
        g.step();
      }
      expect(spoon.load).toBeGreaterThanOrEqual(0.95);
      const before = spoon.load;
      const base = handPos(hand);
      if (jerk) {
        // 0.5 m'lik ani yana atış, tekrar tekrar
        for (let k = 0; k < 6; k++) {
          reachHand(g, 0, 1, { x: base.x + (k % 2 === 0 ? 0.6 : -0.6), y: base.y + 0.25, z: base.z }, true);
          stepN(g, 10);
        }
      } else {
        // aynı mesafe, 2 saniyede yumuşakça
        for (let k = 0; k < 120; k++) {
          const t = k / 120;
          reachHand(g, 0, 1, { x: base.x + 0.6 * Math.sin(t * Math.PI), y: base.y + 0.25 * t, z: base.z }, true);
          g.step();
        }
      }
      const spilled = before - spoon.load;
      g.dispose();
      return spilled;
    };
    const gentle = run(false);
    const rough = run(true);
    expect(gentle).toBeLessThan(0.15);
    expect(rough).toBeGreaterThan(0.25);
    expect(rough).toBeGreaterThan(gentle * 4);
  });

  it('Kafa söylem çarkıyla soruya doğru yanıt verince Şüphe düşer, kötü cümle yükseltir', () => {
    const g = makeGame('dinner', 4);
    const c = g.counts[0]!;
    c.susp = 40;
    c.calm = 0;
    const duchess = Array.from(g.npcs.values()).find((n) => n.arch === 'duchess')!;
    expect(g.askQuestion(duchess.id, 0, 'şarap')).toBe(true);
    const w = g.wheels[0]!;
    expect(w.q?.tag).toBe('şarap');
    // Çarkta eşleşen cümle ve en az bir "kötü" tuzak bulunmalı
    const tags = w.offered.map((id) => g.wheels[0]!.offered.indexOf(id));
    expect(tags).toHaveLength(6);
    const phr = w.offered;
    const idxOk = phr.findIndex((id) => id >= 0 && require_phrase(id).tag === 'şarap');
    const idxBad = phr.findIndex((id) => require_phrase(id).tag === 'kötü');
    expect(idxOk).toBeGreaterThanOrEqual(0);
    expect(idxBad).toBeGreaterThanOrEqual(0);
    g.sayPhrase(0, idxOk);
    expect(c.susp).toBeLessThan(40);
    expect(c.stats.correct).toBe(1);

    c.susp = 40;
    c.calm = 0;
    g.askQuestion(duchess.id, 0, 'sanat');
    const w2 = g.wheels[0]!;
    const bad = w2.offered.findIndex((id) => require_phrase(id).tag === 'kötü');
    expect(bad).toBeGreaterThanOrEqual(0);
    const before = c.susp;
    g.sayPhrase(0, bad);
    expect(c.susp).toBeGreaterThan(before);
    expect(c.stats.wrong).toBe(1);
    g.dispose();
  });

  it('Şüphe %100 olunca palto patlar, çaylaklar çıkar, güvenlik gelir; hepsi toplanınca yeniden yığılır', () => {
    const g = makeGame('dinner', 4);
    const c = g.counts[0]!;
    g.addSusp(0, 200, 'test', c.x, c.z, true);
    expect(c.mode).toBe('burst');
    expect(g.kids.size).toBe(4);
    expect(g.guards.size).toBe(g.tuning.guardCount);
    expect(g.events.some((e) => e.k === 'burst')).toBe(true);
    const flags = g.buildSnapshot(true).counts[0]!.flags;
    expect(flags & CF.BURST).toBe(CF.BURST);

    // Çaylakları koy: hepsi yığın noktasına yakın ve E basılı
    for (const k of g.kids.values()) {
      g.setInput(k.playerId, { t: 'inp', seq: 1, mx: 0, mz: 0, yaw: 0, use: true });
    }
    // Güvenliği uzaklaştır: yakalanmamak için hepsini çok uzağa taşı
    for (const gd of g.guards.values()) {
      gd.body.setTranslation({ x: 13, y: 1, z: 9 }, true);
      gd.x = 13;
      gd.z = 9;
    }
    stepN(g, Math.ceil(60 * (g.tuning.restackSeconds + 1.5)));
    expect(c.mode).toBe('stacked');
    expect(g.kids.size).toBe(0);
    expect(c.susp).toBeLessThanOrEqual(36);
    g.dispose();
  });

  it('Güvenlik çaylağı kovalar ve yakalar; takım arkadaşı kurtarabilir', () => {
    const g = makeGame('dinner', 4);
    const c = g.counts[0]!;
    g.addSusp(0, 200, 'test', c.x, c.z, true);
    // tek çaylak dışında hepsini kaldır
    const kids = Array.from(g.kids.values());
    const target = kids[0]!;
    for (const k of kids.slice(1)) g.burstSys.removeKid(k);
    // Güvenliği yakına koy
    const gd = Array.from(g.guards.values())[0]!;
    gd.body.setTranslation({ x: target.x + 3, y: 1, z: target.z }, true);
    gd.x = target.x + 3;
    gd.z = target.z;
    stepN(g, 240);
    expect(target.caughtUntil).toBeGreaterThan(g.time - 0.01);
    expect(g.events.some((e) => e.k === 'caught')).toBe(true);
    g.dispose();
  });

  it('Tokat NPC\'ye isabet edince büyük Şüphe', () => {
    const g = makeGame('dinner', 4);
    const c = g.counts[0]!;
    const duchess = Array.from(g.npcs.values()).find((n) => n.arch === 'duchess')!;
    // Kont'u masadan uzaklaştır, Düşes'i tokat menziline koy
    c.z = -0.4;
    c.body.setTranslation({ x: c.x, y: COUNT.height / 2, z: c.z }, true);
    g.npcSys.place(duchess, 0.75, -2.15);
    stepN(g, 5);
    const owner = c.assign.slots.handR;
    g.setInput(owner, { t: 'inp', seq: 1, hr: { x: 0, y: -0.1, f: 1.2, grip: false, slap: true } });
    stepN(g, 40);
    expect(c.stats.slaps).toBeGreaterThan(0);
    expect(c.susp).toBeGreaterThan(20);
    g.dispose();
  });
});

describe('Diğer skeçler ayağa kalkar', () => {
  for (const scene of ['reception', 'waltz'] as const) {
    it(`${scene}: 8 ve 1 oyunculu kurulum 10 sn sorunsuz koşar`, () => {
      for (const n of [8, 1]) {
        const g = makeGame(scene, n);
        stepN(g, 600);
        const snap = g.buildSnapshot(true);
        expect(snap.counts.length).toBe(n === 1 ? 1 : 2);
        expect(snap.chars.length).toBeGreaterThan(3);
        expect(g.buildHud().stacks.length).toBe(snap.counts.length);
        g.dispose();
      }
    });
  }
  it('Karşılama: reverans isteyen misafire reverans yapınca başarı sayılır', () => {
    const g = makeGame('reception', 4);
    const c = g.counts[0]!;
    // en yakın selamcıyı reverans ister hâle getir
    const greeter = (g.scene as unknown as { greeters: Array<{ npcId: number; kind: string; stack: number }> }).greeters.find((gr) => gr.stack === 0)!;
    greeter.kind = 'bow';
    const npc = g.npcs.get(greeter.npcId)!;
    // Kont'u selamcıya yaklaştır
    c.x = npc.x + 2.2;
    c.z = npc.z;
    c.body.setTranslation({ x: c.x, y: COUNT.height / 2, z: c.z }, true);
    stepN(g, 30);
    expect(g.events.some((e) => e.k === 'greet' && e.phase === 'prompt')).toBe(true);
    g.setInput(c.assign.slots.legs, { t: 'inp', seq: 1, bow: true, yaw: c.yaw });
    stepN(g, 40);
    expect(c.stats.greets).toBe(1);
    g.dispose();
  });
});

// phrases import (test dosyası sonunda, hoisting için)
import { PHRASES } from '../shared/phrases';
function require_phrase(id: number): { tag: string } {
  return PHRASES[id]!;
}
