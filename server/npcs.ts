// NPC sistemi: bakış, tepkiler, konuşma ve tokat. Sahne mantığı NPC'leri ayrıca yönlendirebilir.

import { NPC_DIM } from '../shared/constants';
import { angDiff, clamp, dist2, wrapPi, yawTo } from '../shared/math';
import { NPC_LINES, fmt, type LineKind } from '../shared/phrases';
import { CH } from '../shared/protocol';
import type { CountRt, HandRt, NpcRt } from './entities';
import type { Game } from './game';

export type Mood = 'happy' | 'angry' | 'shock' | 'confused';

export class NpcSystem {
  constructor(private g: Game) {}

  update(dt: number): void {
    for (const n of this.g.npcs.values()) {
      if (n.lineCd > 0) n.lineCd -= dt;
      if (n.bumpCd > 0) n.bumpCd -= dt;
      if (n.stT > 0) {
        n.stT -= dt;
        if (n.stT <= 0) n.st = n.baseSt;
      }
      // Yakındaki en yakın Kont'a dön
      if (!n.data.fixedYaw) {
        let target: number | null = null;
        let bd = 10;
        for (const c of this.g.counts) {
          if (c.mode !== 'stacked') continue;
          const d = dist2(c.x, c.z, n.x, n.z);
          if (d < bd) {
            bd = d;
            target = yawTo(n.x, n.z, c.x, c.z);
          }
        }
        const want = target ?? n.homeYaw;
        const d = angDiff(want, n.yaw);
        n.yaw = wrapPi(n.yaw + clamp(d, -2.4 * dt, 2.4 * dt));
      }
    }
  }

  /** Bir NPC'yi anında yerleştir (kinematik gövdeyi de günceller). */
  place(n: NpcRt, x: number, z: number, yaw?: number): void {
    n.x = x;
    n.z = z;
    if (yaw !== undefined) n.yaw = yaw;
    n.body.setNextKinematicTranslation({ x, y: NPC_DIM.height / 2, z });
  }

  say(n: NpcRt, text: string, stack = -1): void {
    this.g.emit({ k: 'say', stack, who: 'npc', npc: n.id, name: n.name, text });
  }

  react(n: NpcRt, mood: Mood, line?: LineKind, stack = -1): void {
    n.st = mood === 'happy' ? CH.HAPPY : mood === 'angry' ? CH.ANGRY : mood === 'shock' ? CH.SHOCK : CH.TALK;
    n.stT = 2.4;
    this.g.emit({ k: 'react', npc: n.id, mood });
    if (line && n.lineCd <= 0) {
      n.lineCd = 2.2;
      const pool = NPC_LINES[line];
      this.say(n, fmt(pool[this.g.rng.int(pool.length)]!, Math.max(0, stack)), stack);
    }
  }

  /** Eller tokat attı. */
  hit(n: NpcRt, c: CountRt, h: HandRt): void {
    n.st = CH.HIT;
    n.stT = 1.8;
    this.g.emit({ k: 'hit', npc: n.id, stack: c.stack, hand: h.side });
    this.g.addSusp(c.stack, 35, `${n.name} tokatlandı`, n.x, n.z, true);
    n.lineCd = 0;
    this.say(n, fmt(NPC_LINES.slap[this.g.rng.int(NPC_LINES.slap.length)]!, c.stack), c.stack);
    this.g.log('slap', c.stack, 10, { a: n.name });
  }
}
