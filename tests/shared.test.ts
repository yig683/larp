import { describe, expect, it } from 'vitest';
import { angDiff, fwdX, fwdZ, localToWorld, qErrorVec, qMul, qRotate, qYaw, rightX, rightZ, wrapPi, yawTo } from '../shared/math';
import { Rng } from '../shared/rng';
import { assignStacks, rotateAssign, slotMap, stackSizes } from '../shared/roles';
import { decodeSnapshot, encodeSnapshot, type Snapshot } from '../shared/protocol';
import { newSlosh, sloshMag, spillAmount, stepSlosh } from '../shared/slosh';
import { buildSalon, sceneExtras } from '../shared/level';
import { NavGrid } from '../shared/nav';
import { PHRASES, QUESTIONS, fmt, phrasesByTag } from '../shared/phrases';
import { TUNE_DEFS, TUNING_DEFAULTS, sanitizeTuning, tuningDiff } from '../shared/tuning';

describe('matematik', () => {
  it('ileri/sağ yaw ile three.js kuralına uyar (yaw=0 -> -Z, sağ=+X)', () => {
    expect(fwdX(0)).toBeCloseTo(0);
    expect(fwdZ(0)).toBeCloseTo(-1);
    expect(rightX(0)).toBeCloseTo(1);
    expect(rightZ(0)).toBeCloseTo(0);
    // yaw=+90°: sola döner -> ileri = -X
    expect(fwdX(Math.PI / 2)).toBeCloseTo(-1);
  });
  it('yawTo hedefe bakan yaw verir', () => {
    const yaw = yawTo(0, 0, 3, -3); // kuzeydoğu
    expect(fwdX(yaw)).toBeGreaterThan(0.7);
    expect(fwdZ(yaw)).toBeLessThan(-0.7);
  });
  it('localToWorld tutarlı', () => {
    const p = localToWorld(1, 1, 0, 0.5, 2);
    expect(p.x).toBeCloseTo(1.5);
    expect(p.z).toBeCloseTo(-1);
  });
  it('angDiff en kısa farkı verir', () => {
    expect(angDiff(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2);
    expect(wrapPi(3 * Math.PI)).toBeCloseTo(Math.PI, 5);
  });
  it('kuaterniyon döndürme ve hata vektörü', () => {
    const q = qYaw(Math.PI / 2);
    const v = qRotate(q, { x: 0, y: 0, z: -1 });
    expect(v.x).toBeCloseTo(-1);
    expect(v.z).toBeCloseTo(0);
    const e = qErrorVec(qYaw(0), qMul(qYaw(0.3), qYaw(0)));
    expect(e.y).toBeCloseTo(0.3, 4);
  });
});

describe('rng', () => {
  it('aynı tohum aynı diziyi üretir', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });
  it('shuffle permütasyon verir', () => {
    const r = new Rng(7);
    const s = r.shuffle([1, 2, 3, 4, 5, 6]);
    expect(s.slice().sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('roller', () => {
  it('8 kişi iki tam yığın (4+4)', () => {
    expect(stackSizes(8)).toEqual([4, 4]);
    const a = assignStacks([1, 2, 3, 4, 5, 6, 7, 8], new Rng(1));
    expect(a).toHaveLength(2);
    for (const s of a) {
      expect(new Set(Object.values(s.slots)).size).toBe(4);
    }
    const all = a.flatMap((s) => s.members).sort();
    expect(all).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('7/6/5/4/3/2/1 kişi için boyutlar', () => {
    expect(stackSizes(7)).toEqual([4, 3]);
    expect(stackSizes(6)).toEqual([3, 3]);
    expect(stackSizes(5)).toEqual([3, 2]);
    expect(stackSizes(4)).toEqual([4]);
    expect(stackSizes(3)).toEqual([3]);
    expect(stackSizes(2)).toEqual([2]);
    expect(stackSizes(1)).toEqual([1]);
    expect(stackSizes(11)).toEqual([4, 4]); // fazlası seyirci
  });
  it('3 kişide eller tek oyuncuda, 2 kişide beden+eller', () => {
    expect(slotMap([9, 8, 7])).toEqual({ legs: 9, handL: 8, handR: 8, head: 7 });
    expect(slotMap([9, 8])).toEqual({ legs: 9, head: 9, handL: 8, handR: 8 });
    expect(slotMap([5])).toEqual({ legs: 5, head: 5, handL: 5, handR: 5 });
  });
  it('rotasyon herkesi her role götürür', () => {
    let a = assignStacks([1, 2, 3, 4])[0]!;
    const seen = new Map<number, Set<string>>();
    for (let i = 0; i < 4; i++) {
      for (const [slot, p] of Object.entries(a.slots)) {
        if (!seen.has(p)) seen.set(p, new Set());
        seen.get(p)!.add(slot);
      }
      a = rotateAssign(a);
    }
    for (const s of seen.values()) expect(s.size).toBe(4);
  });
});

describe('snapshot kodlayıcı', () => {
  it('gidiş-dönüş kayıp kabul edilebilir sınırda', () => {
    const snap: Snapshot = {
      tick: 123456,
      bodies: [
        { id: 1001, x: 3.141, y: 1.35, z: -7.77, qx: 0.1, qy: 0.7, qz: -0.2, qw: 0.67 },
        { id: 2, x: -14.9, y: 0.01, z: 10.2, qx: 0, qy: 0, qz: 0, qw: 1 },
      ],
      chars: [{ id: 102, x: -3.3, z: 4.4, yaw: -2.5, st: 6, aux: 200 }],
      counts: [
        { stack: 1, x: 5, z: -2, yaw: 1.1, headYaw: -0.8, headPitch: 0.3, mouth: 1, bow: 0.5, sway: 0.25, susp: 62.5, flags: 5, stain: 12 },
      ],
      conts: [{ id: 1003, load: 0.5, sx: 0.3, sz: -0.6 }],
    };
    const bytes = encodeSnapshot(snap);
    const back = decodeSnapshot(bytes)!;
    expect(back.tick).toBe(123456);
    expect(back.bodies).toHaveLength(2);
    expect(back.bodies[0]!.id).toBe(1001);
    expect(back.bodies[0]!.x).toBeCloseTo(3.141, 2);
    expect(back.bodies[0]!.z).toBeCloseTo(-7.77, 2);
    expect(back.bodies[0]!.qy).toBeCloseTo(0.7, 3);
    expect(back.chars[0]!.yaw).toBeCloseTo(-2.5, 3);
    expect(back.chars[0]!.st).toBe(6);
    expect(back.counts[0]!.susp).toBeCloseTo(62.5, 0);
    expect(back.counts[0]!.headYaw).toBeCloseTo(-0.8, 3);
    expect(back.counts[0]!.flags).toBe(5);
    expect(back.conts[0]!.load).toBeCloseTo(0.5, 2);
    expect(back.conts[0]!.sz).toBeCloseTo(-0.6, 1);
  });
  it('bozuk veriyi reddeder', () => {
    expect(decodeSnapshot(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it('254 cisim ~4 KB (bant genişliği bütçesi)', () => {
    const bodies = Array.from({ length: 254 }, (_, i) => ({ id: 1000 + i, x: 0, y: 1, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 }));
    const bytes = encodeSnapshot({ tick: 1, bodies, chars: [], counts: [], conts: [] });
    expect(bytes.byteLength).toBeLessThan(4200);
  });
});

describe('sıvı sallanma modeli', () => {
  const p = { omega: TUNING_DEFAULTS.sloshOmega, zeta: TUNING_DEFAULTS.sloshZeta, gain: TUNING_DEFAULTS.sloshGain };
  it('durağan hâlde eğim sıfır', () => {
    const s = newSlosh();
    for (let i = 0; i < 120; i++) stepSlosh(s, 0, 0, 1 / 60, p);
    expect(sloshMag(s)).toBeLessThan(1e-6);
  });
  it('yumuşak ivme dökmez, ani sarsıntı döker', () => {
    const gentle = newSlosh();
    let peak = 0;
    for (let i = 0; i < 180; i++) {
      stepSlosh(gentle, 2.0, 0, 1 / 60, p);
      peak = Math.max(peak, sloshMag(gentle));
    }
    expect(peak).toBeLessThan(TUNING_DEFAULTS.spillThreshold);
    const jerk = newSlosh();
    let peak2 = 0;
    for (let i = 0; i < 12; i++) {
      stepSlosh(jerk, 25, 0, 1 / 60, p);
      peak2 = Math.max(peak2, sloshMag(jerk));
    }
    for (let i = 0; i < 60; i++) {
      stepSlosh(jerk, 0, 0, 1 / 60, p);
      peak2 = Math.max(peak2, sloshMag(jerk));
    }
    expect(peak2).toBeGreaterThan(TUNING_DEFAULTS.spillThreshold);
  });
  it('dökülme yalnızca eşik üstünde', () => {
    expect(spillAmount(0.3, 0.46, 2, 0.1)).toBe(0);
    expect(spillAmount(0.8, 0.46, 2, 0.1)).toBeGreaterThan(0);
  });
});

describe('seviye ve yol bulma', () => {
  const salon = buildSalon();
  it('geometri makul ve çarpışmalı şekiller var', () => {
    expect(salon.shapes.length).toBeGreaterThan(60);
    expect(salon.shapes.filter((s) => s.solid).length).toBeGreaterThan(15);
  });
  it('yemek masası sahnesi ek şekil getirir', () => {
    expect(sceneExtras('dinner').shapes.length).toBeGreaterThan(2);
    expect(sceneExtras('waltz').shapes.length).toBe(0);
  });
  it('güvenlik yüksekliğinde masa engeldir, çaylak yüksekliğinde altından geçilir', () => {
    const shapes = [...salon.shapes, ...sceneExtras('dinner').shapes];
    const guard = NavGrid.build(salon.bounds, shapes, 0.45, 2.05);
    const kid = NavGrid.build(salon.bounds, shapes, 0.3, 1.1);
    expect(guard.isBlocked(0, -3.2)).toBe(true);
    expect(kid.isBlocked(0, -3.2)).toBe(false);
  });
  it('A* iki nokta arasında yol bulur ve sütunlardan kaçınır', () => {
    const shapes = [...salon.shapes, ...sceneExtras('dinner').shapes];
    const nav = NavGrid.build(salon.bounds, shapes, 0.45, 2.05);
    const path = nav.findPath(-8, 8, 8, -8);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
    // yol boyunca engelli hücre yok
    let ax = -8;
    let az = 8;
    for (const p of path!) {
      expect(nav.lineClear(ax, az, p.x, p.z)).toBe(true);
      ax = p.x;
      az = p.z;
    }
    // Masanın öbür tarafına geçiş: dolambaçlı olmalı
    const around = nav.findPath(0, -1.5, 0, -5)!;
    expect(around).not.toBeNull();
    const total = around.reduce((acc, p, i) => acc + Math.hypot(p.x - (i === 0 ? 0 : around[i - 1]!.x), p.z - (i === 0 ? -1.5 : around[i - 1]!.z)), 0);
    expect(total).toBeGreaterThan(8);
  });
});

describe('içerik bütünlüğü', () => {
  it('her etiketten yeterli cümle var ve kimlikler dizin', () => {
    PHRASES.forEach((p, i) => expect(p.id).toBe(i));
    for (const tag of ['selam', 'övgü', 'şarap', 'sanat', 'servet', 'aile', 'yemek', 'hava', 'garip', 'kötü'] as const) {
      expect(phrasesByTag(tag).length).toBeGreaterThanOrEqual(5);
    }
    expect(PHRASES.length).toBeGreaterThan(50);
  });
  it('her soru için eşleşen cümle var ve unvan şablonu çözülür', () => {
    for (const q of QUESTIONS) {
      expect(phrasesByTag(q.tag).length).toBeGreaterThan(0);
      expect(fmt(q.text, 0)).not.toContain('{unvan}');
    }
    expect(fmt('Merhaba {unvan}', 1)).toBe('Merhaba Kontes');
  });
  it('çark cümleleri okunabilir uzunlukta', () => {
    for (const p of PHRASES) expect(p.text.length).toBeLessThan(70);
  });
});

describe('ayarlar', () => {
  it('sanitize sınırlara kırpar', () => {
    const t = sanitizeTuning({ walkSpeed: 99, runSpeed: -5 } as never);
    const wd = TUNE_DEFS.find((d) => d.key === 'walkSpeed')!;
    expect(t.walkSpeed).toBe(wd.max);
    expect(t.runSpeed).toBe(TUNE_DEFS.find((d) => d.key === 'runSpeed')!.min);
  });
  it('varsayılan farkı boş', () => {
    expect(tuningDiff({ ...TUNING_DEFAULTS })).toEqual([]);
    expect(tuningDiff({ ...TUNING_DEFAULTS, assist: 0.9 })).toHaveLength(1);
  });
  it('tüm tuning anahtarları tanımlı', () => {
    for (const d of TUNE_DEFS) {
      expect(TUNING_DEFAULTS[d.key]).toBeGreaterThanOrEqual(d.min);
      expect(TUNING_DEFAULTS[d.key]).toBeLessThanOrEqual(d.max);
    }
  });
});
