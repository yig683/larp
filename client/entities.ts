// Varlık yöneticisi: sunucudaki nesnelerin Three.js görünümleri ve enterpolasyonla güncellenmesi.

import * as THREE from 'three';
import { COUNT, ID, STACK_NAMES, STACK_CSS } from '../shared/constants';
import { headPosOf } from '../shared/body';
import type { V3 } from '../shared/math';
import { archById } from '../shared/phrases';
import { propKind } from '../shared/props';
import { CF, type CountState, type EntityDef } from '../shared/protocol';
import type { Fx } from './fx';
import type { Labels } from './labels';
import { CountView, GuardView, KidView, NpcView, buildCoatPile, buildProp, type PropView } from './meshes';
import type { Interp } from './net';
import { S, esc } from './state';

type Rec =
  | { k: 'prop'; v: PropView; kind: string; set: boolean }
  | { k: 'npc'; v: NpcView; name: string; arch: string }
  | { k: 'guard'; v: GuardView }
  | { k: 'kid'; v: KidView; player: number; name: string; stack: number }
  | { k: 'coat'; obj: THREE.Group; stack: number };

const DELAY = 0.11;
const DELAY_OWN = 0.035;

export class Entities {
  readonly counts = new Map<number, CountView>();
  private recs = new Map<number, Rec>();
  private t = 0;

  constructor(
    private parent: THREE.Group,
    private interp: Interp,
    private fx: Fx,
    private labels: Labels,
  ) {}

  clear(): void {
    for (const r of this.recs.values()) this.removeRec(r);
    this.recs.clear();
    for (const c of this.counts.values()) this.parent.remove(c.group);
    this.counts.clear();
    this.labels.clear();
  }

  private removeRec(r: Rec): void {
    const obj = r.k === 'coat' ? r.obj : r.v.obj;
    this.parent.remove(obj);
  }

  /** Sahne yüklenirken: Kont görünümleri + sunucudaki tüm nesneler. */
  load(defs: EntityDef[], stacks: number[]): void {
    this.clear();
    for (const s of stacks) {
      const cv = new CountView(s);
      this.counts.set(s, cv);
      this.parent.add(cv.group);
    }
    for (const d of defs) this.spawn(d);
  }

  spawn(d: EntityDef): void {
    if (this.recs.has(d.id)) this.despawn(d.id);
    switch (d.type) {
      case 'prop': {
        const v = buildProp(d.kind);
        v.obj.position.set(d.x, d.y, d.z);
        v.obj.quaternion.set(d.q[0], d.q[1], d.q[2], d.q[3]);
        this.parent.add(v.obj);
        this.recs.set(d.id, { k: 'prop', v, kind: d.kind, set: false });
        break;
      }
      case 'npc': {
        const v = new NpcView(d.arch);
        v.update(d.x, d.z, d.yaw, 0, 0, 0);
        this.parent.add(v.obj);
        this.recs.set(d.id, { k: 'npc', v, name: d.name, arch: d.arch });
        this.labels.set(
          'n' + d.id,
          esc(d.name),
          'name npc',
          () => ({ x: v.obj.position.x, y: v.height + 0.25, z: v.obj.position.z }),
          7,
          12,
        );
        break;
      }
      case 'guard': {
        const v = new GuardView();
        v.update(d.x, d.z, d.yaw, 0, 0);
        this.parent.add(v.obj);
        this.recs.set(d.id, { k: 'guard', v });
        this.labels.set('g' + d.id, 'GÜVENLİK', 'name guard', () => ({ x: v.obj.position.x, y: 2.5, z: v.obj.position.z }), 14, 24);
        break;
      }
      case 'kid': {
        const v = new KidView(d.color);
        v.update(d.x, d.z, d.yaw, 0, 0, 0, 0);
        this.parent.add(v.obj);
        this.recs.set(d.id, { k: 'kid', v, player: d.player, name: d.name, stack: d.stack });
        const mine = d.player === S.me.id;
        this.labels.set('k' + d.id, esc(d.name) + (mine ? ' (sen)' : ''), 'name kid', () => ({ x: v.obj.position.x, y: 1.55, z: v.obj.position.z }), 18, 30);
        break;
      }
      case 'coat': {
        const g = buildCoatPile(d.stack);
        g.position.set(d.x, 0, d.z);
        this.parent.add(g);
        this.recs.set(d.id, { k: 'coat', obj: g, stack: d.stack });
        this.labels.set('c' + d.id, 'PALTO: buraya dönün!', 'name coat', () => ({ x: g.position.x, y: 1.2, z: g.position.z }), 30, 50);
        break;
      }
    }
  }

  despawn(id: number): void {
    const r = this.recs.get(id);
    if (!r) return;
    this.removeRec(r);
    this.recs.delete(id);
    for (const p of ['n', 'g', 'k', 'c']) this.labels.remove(p + id);
  }

  /** NPC'nin konumu (konuşma balonu / tepki için). */
  npcPos(id: number): V3 | null {
    const r = this.recs.get(id);
    if (!r || r.k !== 'npc') return null;
    return { x: r.v.obj.position.x, y: r.v.height, z: r.v.obj.position.z };
  }

  npcName(id: number): string {
    const r = this.recs.get(id);
    return r && r.k === 'npc' ? r.name : '';
  }
  npcArch(id: number): string {
    const r = this.recs.get(id);
    return r && r.k === 'npc' ? r.arch : 'duchess';
  }

  stainNpc(id: number, liquid: string, y: number): void {
    const r = this.recs.get(id);
    if (r && r.k === 'npc') r.v.addStain(liquid, y);
  }

  /** Bir oyuncunun çaylağının (enterpolasyonlu) konumu. */
  kidOf(playerId: number): { id: number; x: number; z: number; yaw: number; st: number } | null {
    for (const [id, r] of this.recs) {
      if (r.k === 'kid' && r.player === playerId) {
        const c = this.interp.latestChar(id);
        if (c) return { id, x: r.v.obj.position.x, z: r.v.obj.position.z, yaw: c.yaw, st: c.st };
        return { id, x: r.v.obj.position.x, z: r.v.obj.position.z, yaw: 0, st: 0 };
      }
    }
    return null;
  }

  countState(stack: number, nowMs: number, own: boolean): CountState | null {
    return this.interp.count(stack, this.interp.renderTime(nowMs, own ? DELAY_OWN : DELAY));
  }

  /** Birinci şahıs kameradaki Kont'un kafasını/gövdesini gizler (kamera paltonun içinde kalıyor). */
  setFirstPerson(stack: number | null, view: 'head' | 'hands' | null): void {
    for (const [s, v] of this.counts) {
      const own = s === stack;
      v.hideHead = own && view !== null;
      v.hideBody = own && view !== null;
      v.applyFirstPerson();
    }
  }

  /** Bir Kont'un el konumları (enterpolasyonlu). */
  hand(stack: number, side: 0 | 1, nowMs: number, own: boolean): V3 | null {
    const b = this.interp.body(ID.hand(stack, side), this.interp.renderTime(nowMs, own ? DELAY_OWN : DELAY));
    return b ? { x: b.x, y: b.y, z: b.z } : null;
  }

  update(nowMs: number, dt: number, t: number, ownHands: { stack: number; sides: Array<0 | 1> } | null): void {
    this.t = t;
    const rt = this.interp.renderTime(nowMs, DELAY);
    // Kontlar
    for (const [stack, cv] of this.counts) {
      const own = !!ownHands && ownHands.stack === stack;
      const cs = this.interp.count(stack, this.interp.renderTime(nowMs, own ? DELAY_OWN : DELAY));
      if (!cs) {
        cv.group.visible = false;
        continue;
      }
      const hl = this.hand(stack, 0, nowMs, !!own && ownHands!.sides.includes(0));
      const hr = this.hand(stack, 1, nowMs, !!own && ownHands!.sides.includes(1));
      cv.update(cs, hl, hr, t, dt);
      const hp = headPosOf(cs.x, cs.z, cs.yaw, cs.bow);
      const burst = (cs.flags & CF.BURST) !== 0;
      const label = this.stackLabel(stack);
      this.labels.set(
        'count' + stack,
        label,
        'name count s' + stack,
        () => (burst ? null : { x: hp.x, y: COUNT.hatY + 0.65, z: hp.z }),
        20,
        34,
      );
    }
    // diğerleri
    for (const [id, r] of this.recs) {
      switch (r.k) {
        case 'prop': {
          const b = this.interp.body(id, rt);
          if (b) {
            r.v.obj.position.set(b.x, b.y, b.z);
            r.v.obj.quaternion.set(b.qx, b.qy, b.qz, b.qw);
            r.set = true;
          }
          const cs = this.interp.conts.get(id);
          if (cs && r.v.setLiquid) r.v.setLiquid(cs.load, cs.sx, cs.sz);
          else if (r.v.setLiquid && !cs) r.v.setLiquid(propKind(r.kind).container ? 1 : 0, 0, 0);
          break;
        }
        case 'npc': {
          const c = this.interp.char(id, rt);
          if (c) r.v.update(c.x, c.z, c.yaw, c.st, c.aux, t);
          break;
        }
        case 'guard': {
          const c = this.interp.char(id, rt);
          if (c) r.v.update(c.x, c.z, c.yaw, c.aux, dt);
          break;
        }
        case 'kid': {
          const own = r.player === S.me.id;
          const c = this.interp.char(id, own ? this.interp.renderTime(nowMs, DELAY_OWN) : rt);
          if (c) r.v.update(c.x, c.z, c.yaw, c.st, c.aux, t, dt);
          break;
        }
        case 'coat':
          break;
      }
    }
  }

  private stackLabel(stack: number): string {
    const a = S.assign.find((x) => x.stack === stack);
    const names: string[] = [];
    if (a) {
      const seen = new Set<number>();
      for (const id of [a.slots.legs, a.slots.handL, a.slots.handR, a.slots.head]) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const p = S.players.find((x) => x.id === id);
        if (p) names.push(esc(p.name));
      }
    }
    const col = STACK_CSS[stack] ?? '#fff';
    return `<b style="color:${col}">${esc(STACK_NAMES[stack] ?? '')}</b><small>${names.join(' · ')}</small>`;
  }

  /** Tüm stainler / özel durumlar için dışarıdan çağrı. */
  stainCount(stack: number, liquid: string, y: number): void {
    this.counts.get(stack)?.addStain(liquid, y);
  }

  get time(): number {
    return this.t;
  }

  fxRef(): Fx {
    return this.fx;
  }
}
