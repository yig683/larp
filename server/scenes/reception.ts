// Karşılama: kırmızı halıda yürü; her misafir farklı bir selam bekler (el sıkış, şapka, reverans).

import { COUNT } from '../../shared/constants';
import { dist2, dist3 } from '../../shared/math';
import { hatPoint, npcHandPoint } from '../../shared/npc';
import { GREET_HINT, GREET_PROMPTS, NPC_LINES, fmt, type GreetKind } from '../../shared/phrases';
import type { Objective } from '../../shared/protocol';
import { CH } from '../../shared/protocol';
import type { Game } from '../game';
import type { SceneLogic, SceneOutcome } from './types';

const PROMPT_SECS = 8;
const TRIGGER_DIST = 3.7;
const NEED = 3;
const MAX_FAILS = 2;

interface Greeter {
  npcId: number;
  stack: number;
  kind: GreetKind;
  state: 'idle' | 'prompt' | 'ok' | 'fail';
  t: number;
}

interface StackState {
  greets: number;
  fails: number;
  hostState: 'idle' | 'prompt' | 'ok';
  hostT: number;
  hostCd: number;
  out: boolean;
}

export class ReceptionScene implements SceneLogic {
  readonly id = 'reception' as const;
  readonly title = 'Karşılama';
  readonly intro = 'Kırmızı halıda ilerleyin. Her misafir farklı bir selam bekliyor: el sıkış, şapka selamı ya da reverans.';
  readonly hint = 'Kafa istenen selamı okur ve söyler. Bacaklar: reverans (Boşluk). Eller: el sık ya da şapkanın üstüne uzan.';
  readonly timeLimit = 210;

  private greeters: Greeter[] = [];
  private st: StackState[] = [];
  private hostId = 0;
  private bannerText: string | undefined;
  private bannerUntil = 0;

  spawn(stack: number, n: number): { x: number; z: number; yaw: number } {
    return { x: n === 1 ? -3 : stack === 0 ? -3 : 3, z: 8.6, yaw: 0 };
  }

  setup(g: Game): void {
    const archs0 = ['lady', 'colonel', 'madame', 'sir', 'critic'];
    const archs1 = ['banker', 'madame', 'lady', 'critic', 'colonel'];
    const names: Record<string, string> = {
      lady: 'Leydi Pembe',
      colonel: 'Albay Kızılcık',
      madame: 'Madam Fifi',
      sir: 'Sör Reginald',
      critic: 'Eleştirmen Cemile',
      banker: 'Bankacı Kasa',
    };
    const zs = [5, 2, -1, -4, -7];
    for (const c of g.counts) {
      this.st[c.stack] = { greets: 0, fails: 0, hostState: 'idle', hostT: 0, hostCd: 0, out: false };
      const kinds: GreetKind[] = g.rng.shuffle<GreetKind>(['hand', 'hat', 'bow', g.rng.pick(['hand', 'hat', 'bow'] as const), g.rng.pick(['hand', 'hat', 'bow'] as const)]);
      const x = c.stack === 0 ? -5.3 : 5.3;
      const yaw = c.stack === 0 ? -Math.PI / 2 : Math.PI / 2;
      zs.forEach((z, i) => {
        const arch = (c.stack === 0 ? archs0 : archs1)[i]!;
        const n = g.spawnNpc(arch, names[arch]!, x, z, yaw, 'greeter');
        n.data.fixedYaw = 1;
        this.greeters.push({ npcId: n.id, stack: c.stack, kind: kinds[i]!, state: 'idle', t: 0 });
      });
    }
    const host = g.spawnNpc('host', 'Baron von Altın', 0, -9.4, Math.PI, 'host');
    host.data.fixedYaw = 1;
    this.hostId = host.id;
    const m = g.spawnNpc('maestro', 'Maestro Lorenzo', -7.2, -7.9, 0);
    m.data.fixedYaw = 1;
    g.spawnNpc('duchess', 'Düşes Beatrix', -9.5, -3, 0.9);
    g.spawnNpc('sir', 'Sör Reginald', 9.8, -6.5, -0.6);
    this.announce(g, 'Kırmızı halıda ilerleyin: her misafir bir selam bekliyor!', 6);
  }

  private announce(g: Game, text: string, secs: number): void {
    this.bannerText = text;
    this.bannerUntil = g.time + secs;
    g.emit({ k: 'banner', text });
  }

  update(g: Game, dt: number): void {
    for (const gr of this.greeters) {
      const c = g.counts[gr.stack];
      const n = g.npcs.get(gr.npcId);
      if (!c || !n || c.mode !== 'stacked') continue;
      const st = this.st[gr.stack]!;
      if (st.out) continue;
      if (gr.state === 'idle') {
        if (dist2(c.x, c.z, n.x, n.z) < TRIGGER_DIST) {
          gr.state = 'prompt';
          gr.t = PROMPT_SECS;
          n.st = gr.kind === 'hand' ? CH.GREET_HAND : gr.kind === 'hat' ? CH.GREET_HAT : CH.GREET_BOW;
          n.stT = PROMPT_SECS + 0.2;
          const text = fmt(GREET_PROMPTS[gr.kind], c.stack);
          g.emit({ k: 'greet', npc: n.id, stack: c.stack, kind: gr.kind, phase: 'prompt', hint: GREET_HINT[gr.kind], secs: PROMPT_SECS });
          g.npcSys.say(n, text, c.stack);
        }
      } else if (gr.state === 'prompt') {
        gr.t -= dt;
        if (this.performed(g, c.stack, gr.kind, n.x, n.z, n.yaw)) this.succeed(g, gr, st);
        else if (gr.t <= 0) this.fail(g, gr, st);
      }
    }
    // Ev sahibi
    const host = g.npcs.get(this.hostId);
    if (host) {
      for (const c of g.counts) {
        const st = this.st[c.stack]!;
        if (c.mode !== 'stacked' || st.out || st.hostState === 'ok') continue;
        st.hostCd -= dt;
        const near = dist2(c.x, c.z, host.x, host.z) < 4.2;
        if (st.hostState === 'idle' && near) {
          if (st.greets >= NEED) {
            st.hostState = 'prompt';
            st.hostT = PROMPT_SECS;
            host.st = CH.GREET_BOW;
            host.stT = PROMPT_SECS + 0.2;
            g.emit({ k: 'greet', npc: host.id, stack: c.stack, kind: 'bow', phase: 'prompt', hint: 'REVERANS', secs: PROMPT_SECS });
            g.npcSys.say(host, `Hoş geldiniz! Reverans, ${g.titleOf(c.stack)}, reverans!`, c.stack);
          } else if (st.hostCd <= 0) {
            st.hostCd = 9;
            g.npcSys.say(host, `Önce misafirleri karşılayın, ${g.titleOf(c.stack)}! (${st.greets}/${NEED})`, c.stack);
          }
        } else if (st.hostState === 'prompt') {
          st.hostT -= dt;
          if (c.bow > 0.85) {
            st.hostState = 'ok';
            c.score += 80;
            g.addSusp(c.stack, -15, 'ev sahibini selamladı', c.x, c.z, true);
            g.npcSys.react(host, 'happy', 'thanks', c.stack);
            g.emit({ k: 'greet', npc: host.id, stack: c.stack, kind: 'bow', phase: 'ok' });
            g.emit({ k: 'obj', stack: c.stack, id: 'host', done: 1 });
            g.log('host', c.stack, 5);
          } else if (st.hostT <= 0) {
            st.hostState = 'idle';
            g.addSusp(c.stack, 10, 'ev sahibini selamlayamadı', c.x, c.z);
            g.npcSys.react(host, 'angry', 'fail', c.stack);
          }
        }
      }
    }
  }

  /** İstenen selam yapıldı mı. */
  private performed(g: Game, stack: number, kind: GreetKind, nx: number, nz: number, nyaw: number): boolean {
    const c = g.counts[stack]!;
    if (dist2(c.x, c.z, nx, nz) > 4.4) return false;
    if (kind === 'bow') return c.bow > 0.85;
    if (kind === 'hand') {
      const hp = npcHandPoint(nx, nz, nyaw);
      return c.hands.some((h) => h.input.grip && dist3(h.body.translation(), hp) < 0.36);
    }
    const hat = hatPoint(c.x, c.z, c.yaw, c.bow);
    return c.hands.some((h) => h.input.grip && dist3(h.body.translation(), hat) < 0.55) && COUNT.hatY > 0;
  }

  private succeed(g: Game, gr: Greeter, st: StackState): void {
    const c = g.counts[gr.stack]!;
    const n = g.npcs.get(gr.npcId)!;
    gr.state = 'ok';
    st.greets++;
    c.stats.greets++;
    c.score += 25;
    const polite = g.wheels[gr.stack] && this.recentSelam(g, gr.stack);
    if (polite) c.score += 10;
    g.addSusp(gr.stack, polite ? -12 : -8, 'doğru selam', c.x, c.z, true);
    n.st = CH.HAPPY;
    n.stT = 2.5;
    g.emit({ k: 'greet', npc: n.id, stack: gr.stack, kind: gr.kind, phase: 'ok', bonus: polite ? 1 : 0 });
    g.npcSys.say(n, fmt(NPC_LINES.thanks[g.rng.int(NPC_LINES.thanks.length)]!, gr.stack), gr.stack);
    g.log('greetOk', gr.stack, 3, { a: n.name, b: gr.kind });
    if (st.greets === NEED) g.emit({ k: 'obj', stack: gr.stack, id: 'greets', done: 1 });
  }

  private recentSelam(g: Game, stack: number): boolean {
    const ls = g.lastSay[stack];
    return !!ls && ls.tag === 'selam' && g.time - ls.t < 9;
  }

  private fail(g: Game, gr: Greeter, st: StackState): void {
    const c = g.counts[gr.stack]!;
    const n = g.npcs.get(gr.npcId)!;
    gr.state = 'fail';
    st.fails++;
    g.addSusp(gr.stack, 14, 'selamı yapamadı', c.x, c.z);
    g.npcSys.react(n, 'angry', 'fail', gr.stack);
    g.emit({ k: 'greet', npc: n.id, stack: gr.stack, kind: gr.kind, phase: 'fail' });
    g.log('greetFail', gr.stack, 4, { a: n.name, b: gr.kind });
    if (st.fails > MAX_FAILS) {
      st.out = true;
      g.emit({ k: 'banner', text: `${g.stackName(gr.stack)} çok fazla misafiri kırdı!`, stack: gr.stack });
    }
  }

  objectives(g: Game, stack: number): Objective[] {
    const s = this.st[stack]!;
    void g;
    return [
      { id: 'greets', text: `Misafirleri karşıla (en az ${NEED}/5)`, done: s.greets >= NEED, prog: `${s.greets}/5` },
      { id: 'host', text: 'Ev sahibine ulaş ve reverans yap', done: s.hostState === 'ok' },
    ];
  }

  banner(g: Game): string | undefined {
    return g.time < this.bannerUntil ? this.bannerText : undefined;
  }

  outcome(g: Game): SceneOutcome | null {
    const per = g.counts.map((c) => this.st[c.stack]!.hostState === 'ok');
    const finished = g.counts.every((c) => c.mode === 'failed' || this.st[c.stack]!.out || this.st[c.stack]!.hostState === 'ok');
    if (!finished) return null;
    const lines = g.counts.map((c, i) =>
      per[i] ? `${g.stackName(i)}: ev sahibine ulaştı (${this.st[i]!.greets}/5 misafir karşılandı).` : `${g.stackName(i)}: halıda tökezledi.`,
    );
    return { perStack: per, lines };
  }
}
