// Oturum raporu: oyun sonrası panoya kopyalanıp geliştiriciye yapıştırılan düz metin.

import { SLOT_LABEL, STACK_NAMES } from '../shared/constants';
import type { SceneResult } from '../shared/protocol';
import { tuningDiff, type Tuning } from '../shared/tuning';

export interface PlayerStat {
  name: string;
  pings: number[];
  fps: number[];
  disconnects: number;
}

export interface ReportInput {
  build: string;
  startedAt: number;
  playerCount: number;
  solo: boolean;
  players: PlayerStat[];
  results: SceneResult[];
  sceneNotes: string[];
  tuning: Tuning;
  roles: string[];
}

const avg = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (a: number[], p: number): number => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
};

export function buildReport(r: ReportInput): string {
  const mins = Math.max(1, Math.round((Date.now() - r.startedAt) / 60000));
  const L: string[] = [];
  L.push('TRENÇKOT KONTU — Oturum Raporu');
  L.push(`Sürüm: ${r.build} · Tarih: ${new Date().toLocaleString('tr-TR')} · Süre: ~${mins} dk`);
  L.push(`Oyuncu: ${r.playerCount}${r.solo ? ' (tek kişilik deneme)' : ''}`);
  L.push('');
  L.push('— Bağlantı / performans —');
  for (const p of r.players) {
    const ping = p.pings.length ? `ping ort ${Math.round(avg(p.pings))} ms, %95 ${Math.round(pct(p.pings, 0.95))} ms` : 'ping yok';
    const fps = p.fps.length ? `FPS ort ${Math.round(avg(p.fps))}, en düşük ${Math.round(Math.min(...p.fps))}` : 'FPS yok';
    L.push(`  ${p.name}: ${ping} · ${fps}${p.disconnects ? ` · ${p.disconnects} kopma` : ''}`);
  }
  L.push('');
  L.push('— Sahneler —');
  r.results.forEach((res, i) => {
    L.push(`${i + 1}. ${res.title}: ${res.success ? 'BAŞARILI' : 'BAŞARISIZ'}`);
    for (const s of res.stacks) {
      L.push(`   ${STACK_NAMES[s.stack] ?? s.stack}: ${s.success ? 'tamam' : 'olmadı'} · puan ${s.score} · patlama ${s.bursts} · tepe Şüphe %${s.peak}`);
    }
    for (const line of res.lines) L.push(`   · ${line}`);
    const note = r.sceneNotes[i];
    if (note) L.push(`   ${note}`);
  });
  if (r.roles.length) {
    L.push('');
    L.push('— Roller (sahne sırasıyla) —');
    for (const x of r.roles) L.push('  ' + x);
  }
  const diff = tuningDiff(r.tuning);
  L.push('');
  L.push('— Değiştirilen ayarlar —');
  if (diff.length === 0) L.push('  (hepsi varsayılan)');
  for (const d of diff) L.push('  ' + d);
  L.push('');
  L.push('— Geri bildirim (elle doldur) —');
  L.push('  Kör besleme komik miydi, sinir bozucu muydu?');
  L.push('  En komik an:');
  L.push('  En sinir bozucu an / hata:');
  L.push('  Ses/kamera/kontrol hissi:');
  return L.join('\n');
}

export function roleLine(sceneTitle: string, assigns: Array<{ stack: number; slots: Record<string, number> }>, nameOf: (id: number) => string): string {
  const parts = assigns.map((a) => {
    const seq = (['legs', 'handL', 'handR', 'head'] as const).map((s) => `${SLOT_LABEL[s]}=${nameOf(a.slots[s] ?? 0)}`);
    return `${STACK_NAMES[a.stack] ?? a.stack}: ${seq.join(', ')}`;
  });
  return `${sceneTitle} → ${parts.join(' | ')}`;
}
