// Akşam Yemeği: kör besleme, düşesin soruları ve şerefe.

import { dist3 } from '../../shared/math';
import type { Objective } from '../../shared/protocol';
import { NPC_LINES, fmt } from '../../shared/phrases';
import type { Game } from '../game';
import type { SceneLogic, SceneOutcome } from './types';

const TABLE_Y = 1.35;
const TABLE_Z = -3.2;
const SOUP_GOAL = 5;

interface StackState {
  toastActive: boolean;
  toastDone: boolean;
  toastHold: number;
  asked: number;
  soupDone: boolean;
  breadDone: boolean;
  talkDone: boolean;
}

export class DinnerScene implements SceneLogic {
  readonly id = 'dinner' as const;
  readonly title = 'Akşam Yemeği';
  readonly intro = 'Yedi çeşit yemek. İlk çeşit çorba. Kafa ağzı bulur, eller kaşığı taşır, bacaklar masadan uzak durmaz.';
  readonly hint = 'Eller kör: ağzı Kafa tarif eder. Kafa: ağzını açıp Düşes\'in sorularını söylem çarkıyla yanıtla.';
  readonly timeLimit = 330;

  private st: StackState[] = [];
  private duchess = 0;
  private nextAsk = 14;
  private askTurn = 0;
  private nextBump = 42;
  private bannerText: string | undefined;
  private bannerUntil = 0;

  private x0(stack: number, n: number): number {
    return n === 1 ? 0 : stack === 0 ? -2.4 : 2.4;
  }

  spawn(stack: number, n: number): { x: number; z: number; yaw: number } {
    return { x: this.x0(stack, n), z: -1.75, yaw: 0 };
  }

  setup(g: Game): void {
    const n = g.counts.length;
    for (const c of g.counts) {
      this.st[c.stack] = { toastActive: false, toastDone: false, toastHold: 0, asked: 0, soupDone: false, breadDone: false, talkDone: false };
      const x0 = this.x0(c.stack, n);
      g.spawnProp('bowl', x0, TABLE_Y + 0.056, TABLE_Z + 0.25);
      g.spawnProp('spoon', x0 + 0.5, TABLE_Y + 0.012, TABLE_Z + 0.35, { ry: 0.25 });
      g.spawnProp('glass', x0 - 0.55, TABLE_Y + 0.073, TABLE_Z + 0.2);
      g.spawnProp('bread', x0 + 0.12, TABLE_Y + 0.08, TABLE_Z - 0.15);
      g.spawnProp('bread', x0 - 0.2, TABLE_Y + 0.08, TABLE_Z - 0.3);
      g.spawnProp('apple', x0 + 0.35, TABLE_Y + 0.053, TABLE_Z - 0.3);
    }
    // Masa süsleri: kuğu heykeli, şişeler, tabaklar (kaos malzemesi)
    g.spawnProp('swan', 0, TABLE_Y + 0.35, TABLE_Z - 0.2);
    g.spawnProp('bottle', -1.2, TABLE_Y + 0.165, TABLE_Z - 0.1);
    g.spawnProp('bottle', 1.2, TABLE_Y + 0.165, TABLE_Z - 0.1);
    for (let i = 0; i < 4; i++) g.spawnProp('plate', -3.6 + i * 2.4, TABLE_Y + 0.016, TABLE_Z - 0.2);
    // Büfe: şampanya kadehleri ve meyve
    for (let i = 0; i < 6; i++) g.spawnProp('flute', 13.0 + (i % 2) * 0.25 - 0.1, 1.17 + 0.082, -1.2 + Math.floor(i / 2) * 0.35);
    for (let i = 0; i < 4; i++) g.spawnProp('apple', 12.8 + (i % 2) * 0.2, 1.17 + 0.052, 3.2 + Math.floor(i / 2) * 0.25);
    g.spawnProp('swan', 13.0, 1.17 + 0.35, 5.2, { ry: 1.2 });
    g.spawnProp('chair', -9.5, 0.46, 6.5);
    g.spawnProp('chair', -9.0, 0.46, 7.7);

    // NPC'ler
    const d = g.spawnNpc('duchess', 'Düşes Beatrix', 0, -4.6, Math.PI, 'duchess');
    this.duchess = d.id;
    d.data.fixedYaw = 0;
    g.spawnNpc('colonel', 'Albay Kızılcık', 6.1, TABLE_Z, Math.PI / 2);
    g.spawnNpc('banker', 'Bankacı Kasa', -6.1, TABLE_Z, -Math.PI / 2);
    g.spawnNpc('critic', 'Eleştirmen Cemile', -8.2, 3.2, 0.4);
    g.spawnNpc('lady', 'Leydi Pembe', 8.0, 4.0, -0.5);
    g.spawnNpc('sir', 'Sör Reginald', -3.5, -7.2, 0.3);
    g.spawnNpc('madame', 'Madam Fifi', 4.5, -7.0, -0.3);
    const m = g.spawnNpc('maestro', 'Maestro Lorenzo', -7.2, -7.9, 0);
    m.data.fixedYaw = 1;
    const h = g.spawnNpc('host', 'Baron von Altın', 0, -9.5, Math.PI);
    h.data.fixedYaw = 1;
    this.announce(g, 'Akşam yemeği başladı! Çorbayı ağza ulaştırın.', 6);
  }

  private announce(g: Game, text: string, secs: number): void {
    this.bannerText = text;
    this.bannerUntil = g.time + secs;
    g.emit({ k: 'banner', text });
  }

  update(g: Game, dt: number): void {
    const n = g.counts.length;
    const duchess = g.npcs.get(this.duchess);
    for (const c of g.counts) {
      const s = this.st[c.stack]!;
      if (c.mode === 'failed') continue;
      if (!s.soupDone && c.stats.soup >= SOUP_GOAL) {
        s.soupDone = true;
        c.score += 40;
        g.emit({ k: 'obj', stack: c.stack, id: 'soup', done: 1 });
      }
      if (!s.breadDone && c.stats.bread >= 1) {
        s.breadDone = true;
        c.score += 20;
        g.emit({ k: 'obj', stack: c.stack, id: 'bread', done: 1 });
      }
      if (!s.talkDone && c.stats.correct >= 2) {
        s.talkDone = true;
        c.score += 60;
        g.emit({ k: 'obj', stack: c.stack, id: 'talk', done: 1 });
      }
      if (!s.toastActive && s.soupDone && s.breadDone && s.talkDone) {
        s.toastActive = true;
        this.announce(g, `${g.stackName(c.stack)}: şerefe zamanı! Dolu kadehi yukarı kaldır.`, 7);
        if (duchess) g.npcSys.say(duchess, `Kadehler havaya, ${g.titleOf(c.stack)}!`, c.stack);
      }
      if (s.toastActive && !s.toastDone && c.mode === 'stacked') {
        const tp = { x: this.x0(c.stack, n), y: 2.15, z: TABLE_Z + 0.1 };
        let near = false;
        for (const h of c.hands) {
          const p = h.held;
          if (!p || (p.kind.kind !== 'glass' && p.kind.kind !== 'flute')) continue;
          if (p.kind.container && p.load < 0.2) continue;
          if (dist3(p.body.translation(), tp) < 0.55) near = true;
        }
        s.toastHold = near ? s.toastHold + dt : Math.max(0, s.toastHold - dt);
        if (s.toastHold >= 0.8) {
          s.toastDone = true;
          c.stats.toasts++;
          c.score += 80;
          g.emit({ k: 'clink', x: tp.x, y: tp.y, z: tp.z, stack: c.stack });
          g.emit({ k: 'obj', stack: c.stack, id: 'toast', done: 1 });
          g.addSusp(c.stack, -20, 'şerefe!', c.x, c.z, true);
          g.log('toast', c.stack, 8);
          if (duchess) {
            const lines = NPC_LINES.toast;
            g.npcSys.react(duchess, 'happy');
            g.npcSys.say(duchess, fmt(lines[g.rng.int(lines.length)]!, c.stack), c.stack);
          }
        }
      }
    }
    // Düşes sırayla soru sorar
    if (g.time >= this.nextAsk && duchess) {
      const cand = g.counts.filter((c) => c.mode === 'stacked' && !this.st[c.stack]!.talkDone && this.st[c.stack]!.asked < 4);
      if (cand.length > 0) {
        const c = cand[this.askTurn++ % cand.length]!;
        if (g.askQuestion(duchess.id, c.stack)) this.st[c.stack]!.asked++;
      }
      this.nextAsk = g.time + 17 + g.rng.range(0, 8);
    }
    // Masa sarsıntısı: komşu bir misafir masaya dayanır
    if (g.tuning.chaos > 0 && g.time >= this.nextBump) {
      this.nextBump = g.time + (38 + g.rng.range(0, 25)) / g.tuning.chaos;
      const onTable = Array.from(g.props.values()).filter((p) => {
        const t = p.body.translation();
        return p.holders.length === 0 && t.y > 1.3 && t.y < 1.7 && Math.abs(t.z - TABLE_Z) < 1.0 && Math.abs(t.x) < 5.2;
      });
      if (onTable.length > 0) {
        const near = g.rng.chance(0.5) ? g.npcs.get(duchess?.id ?? 0) : undefined;
        if (near) g.npcSys.react(near, 'shock', 'crash');
        const picks = g.rng.shuffle(onTable).slice(0, 3);
        for (const p of picks) {
          p.body.applyImpulse({ x: g.rng.range(-0.05, 0.05) * p.kind.mass * 8, y: 0.02 * p.kind.mass * 6, z: g.rng.range(0.04, 0.14) * p.kind.mass * 8 }, true);
        }
        g.emit({ k: 'crash', x: 0, y: 1.4, z: TABLE_Z, mag: 2, kind: 'table', broke: 0 });
        this.announce(g, 'Biri masaya çarptı! Eşyalar kayıyor!', 3);
      }
    }
  }

  objectives(g: Game, stack: number): Objective[] {
    const c = g.counts[stack]!;
    const s = this.st[stack]!;
    return [
      { id: 'soup', text: 'Çorbadan 5 kaşık iç', done: s.soupDone, prog: `${Math.min(SOUP_GOAL, Math.floor(c.stats.soup))}/${SOUP_GOAL}` },
      { id: 'bread', text: 'Bir ekmek ısır', done: s.breadDone },
      { id: 'talk', text: "Düşes'e 2 doğru cevap ver", done: s.talkDone, prog: `${Math.min(2, c.stats.correct)}/2` },
      { id: 'toast', text: 'Şerefe: dolu kadehi yukarı kaldır', done: s.toastDone, prog: s.toastActive ? undefined : 'kilitli' },
    ];
  }

  banner(g: Game): string | undefined {
    return g.time < this.bannerUntil ? this.bannerText : undefined;
  }

  outcome(g: Game): SceneOutcome | null {
    const per = g.counts.map((c) => this.st[c.stack]!.toastDone);
    const finished = g.counts.every((c) => c.mode === 'failed' || this.st[c.stack]!.toastDone);
    if (!finished) return null;
    const lines: string[] = [];
    g.counts.forEach((c, i) => {
      if (per[i]) lines.push(`${g.stackName(i)}: yemeği tamamladı (${Math.floor(c.stats.soup)} kaşık çorba, ${c.stats.correct} doğru cevap).`);
      else lines.push(`${g.stackName(i)}: masadan rezil olarak kalktı.`);
    });
    return { perStack: per, lines };
  }
}
