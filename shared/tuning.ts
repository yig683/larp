// Canlı ayarlanabilir oyun sayıları. Ev sahibi F8 panelinden değiştirir; değerler herkese yayılır
// ve oturum raporuna yazılır, böylece "his" geri bildirimi sayıya dönüşebilir.

export interface Tuning {
  // Hareket
  walkSpeed: number;
  runSpeed: number;
  accel: number;
  turnRate: number;
  // Eller
  handKp: number;
  handKd: number;
  handMaxForce: number;
  handReach: number;
  slapForce: number;
  // Tutma
  grabRadius: number;
  holdSpeed: number;
  // Besleme
  mouthRadius: number;
  assist: number;
  scoopRate: number;
  // Sıvı
  sloshOmega: number;
  sloshZeta: number;
  sloshGain: number;
  spillThreshold: number;
  spillRate: number;
  swayAccel: number;
  // Şüphe
  suspMult: number;
  suspDecay: number;
  suspRange: number;
  // Patlama / kovalamaca
  kidSpeed: number;
  kidRunSpeed: number;
  guardSpeed: number;
  guardCount: number;
  catchSeconds: number;
  restackSeconds: number;
  maxBursts: number;
  // Genel
  timeMult: number;
  chaos: number;
}

export const TUNING_DEFAULTS: Tuning = {
  walkSpeed: 2.2,
  runSpeed: 3.7,
  accel: 6.5,
  turnRate: 3.4,
  handKp: 520,
  handKd: 54,
  handMaxForce: 380,
  handReach: 1.75,
  slapForce: 9,
  grabRadius: 0.4,
  holdSpeed: 7,
  mouthRadius: 0.27,
  assist: 0.4,
  scoopRate: 2.4,
  sloshOmega: 5.4,
  sloshZeta: 0.14,
  sloshGain: 0.085,
  spillThreshold: 0.46,
  spillRate: 2.2,
  swayAccel: 3.2,
  suspMult: 1,
  suspDecay: 0.8,
  suspRange: 11,
  kidSpeed: 3.9,
  kidRunSpeed: 5.0,
  guardSpeed: 3.35,
  guardCount: 2,
  catchSeconds: 10,
  restackSeconds: 2.6,
  maxBursts: 3,
  timeMult: 1,
  chaos: 1,
};

export interface TuneDef {
  key: keyof Tuning;
  label: string;
  group: string;
  min: number;
  max: number;
  step: number;
}

export const TUNE_DEFS: TuneDef[] = [
  { key: 'walkSpeed', label: 'Yürüme hızı (m/s)', group: 'Hareket', min: 1, max: 4, step: 0.1 },
  { key: 'runSpeed', label: 'Koşu hızı (m/s)', group: 'Hareket', min: 2, max: 6, step: 0.1 },
  { key: 'accel', label: 'İvmelenme', group: 'Hareket', min: 2, max: 14, step: 0.5 },
  { key: 'turnRate', label: 'Dönüş hızı (rad/s)', group: 'Hareket', min: 1, max: 8, step: 0.2 },
  { key: 'handKp', label: 'El sertliği', group: 'Eller', min: 120, max: 1200, step: 10 },
  { key: 'handKd', label: 'El sönümü', group: 'Eller', min: 15, max: 140, step: 1 },
  { key: 'handMaxForce', label: 'El azami kuvvet', group: 'Eller', min: 80, max: 900, step: 10 },
  { key: 'handReach', label: 'Kol uzunluğu (m)', group: 'Eller', min: 1.2, max: 2.2, step: 0.05 },
  { key: 'slapForce', label: 'Tokat şiddeti', group: 'Eller', min: 2, max: 20, step: 0.5 },
  { key: 'grabRadius', label: 'Tutma yarıçapı (m)', group: 'Tutma', min: 0.2, max: 0.9, step: 0.05 },
  { key: 'holdSpeed', label: 'Tutulan eşya hızı', group: 'Tutma', min: 2, max: 14, step: 0.5 },
  { key: 'mouthRadius', label: 'Ağız yarıçapı (m)', group: 'Besleme', min: 0.15, max: 0.6, step: 0.01 },
  { key: 'assist', label: 'Ağıza çekim yardımı', group: 'Besleme', min: 0, max: 1, step: 0.05 },
  { key: 'scoopRate', label: 'Kaşık dolma hızı', group: 'Besleme', min: 0.8, max: 6, step: 0.1 },
  { key: 'sloshOmega', label: 'Sıvı titreşimi', group: 'Sıvı', min: 2, max: 10, step: 0.2 },
  { key: 'sloshZeta', label: 'Sıvı sönümü', group: 'Sıvı', min: 0.02, max: 0.6, step: 0.02 },
  { key: 'sloshGain', label: 'Sıvı duyarlılığı', group: 'Sıvı', min: 0.02, max: 0.3, step: 0.005 },
  { key: 'spillThreshold', label: 'Dökülme eşiği (rad)', group: 'Sıvı', min: 0.15, max: 1.2, step: 0.02 },
  { key: 'spillRate', label: 'Dökülme hızı', group: 'Sıvı', min: 0.5, max: 8, step: 0.1 },
  { key: 'swayAccel', label: 'Gövde sallanması', group: 'Sıvı', min: 0, max: 8, step: 0.2 },
  { key: 'suspMult', label: 'Şüphe çarpanı', group: 'Şüphe', min: 0.2, max: 3, step: 0.05 },
  { key: 'suspDecay', label: 'Şüphe azalma (/sn)', group: 'Şüphe', min: 0, max: 4, step: 0.1 },
  { key: 'suspRange', label: 'NPC görüş menzili (m)', group: 'Şüphe', min: 4, max: 20, step: 0.5 },
  { key: 'kidSpeed', label: 'Çaylak hızı', group: 'Kovalamaca', min: 2, max: 7, step: 0.1 },
  { key: 'kidRunSpeed', label: 'Çaylak koşusu', group: 'Kovalamaca', min: 3, max: 9, step: 0.1 },
  { key: 'guardSpeed', label: 'Güvenlik hızı', group: 'Kovalamaca', min: 1.5, max: 6, step: 0.1 },
  { key: 'guardCount', label: 'Güvenlik sayısı', group: 'Kovalamaca', min: 1, max: 6, step: 1 },
  { key: 'catchSeconds', label: 'Gözaltı süresi (sn)', group: 'Kovalamaca', min: 3, max: 30, step: 1 },
  { key: 'restackSeconds', label: 'Yeniden yığılma (sn)', group: 'Kovalamaca', min: 1, max: 8, step: 0.2 },
  { key: 'maxBursts', label: 'Patlama hakkı', group: 'Kovalamaca', min: 1, max: 8, step: 1 },
  { key: 'timeMult', label: 'Süre çarpanı', group: 'Genel', min: 0.5, max: 3, step: 0.1 },
  { key: 'chaos', label: 'Kaos (rastgele olay) çarpanı', group: 'Genel', min: 0, max: 3, step: 0.1 },
];

export function sanitizeTuning(input: Partial<Tuning> | undefined): Tuning {
  const out: Tuning = { ...TUNING_DEFAULTS };
  if (!input) return out;
  for (const d of TUNE_DEFS) {
    const v = input[d.key];
    if (typeof v === 'number' && Number.isFinite(v)) out[d.key] = Math.min(d.max, Math.max(d.min, v));
  }
  return out;
}

/** Varsayılandan farklı olanları "anahtar=değer" listesi olarak döner (rapor için). */
export function tuningDiff(t: Tuning): string[] {
  const out: string[] = [];
  for (const d of TUNE_DEFS) {
    if (Math.abs(t[d.key] - TUNING_DEFAULTS[d.key]) > 1e-9) out.push(`${d.key}=${t[d.key]} (varsayılan ${TUNING_DEFAULTS[d.key]})`);
  }
  return out;
}
