// Oyun sabitleri. Ölçüler metre cinsindendir.

export const PROTOCOL_VERSION = 1;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** Her kaç fizik adımında bir snapshot yayınlanır (60/3 = 20 Hz). */
export const SNAP_EVERY = 3;
/** Her kaç saniyede bir tüm cisimleri içeren "anahtar" snapshot gider. */
export const KEYFRAME_EVERY_S = 2;

export const MAX_STACKS = 2;
export const MAX_PLAYERS = 12; // 8 oyuncu + 4 seyirci
export const SLOT_IDS = ['legs', 'handL', 'handR', 'head'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export const SLOT_LABEL: Record<SlotId, string> = {
  legs: 'Bacaklar',
  handL: 'Sol El',
  handR: 'Sağ El',
  head: 'Kafa',
};

export const STACK_NAMES = ['Kont Gustavo', 'Kontes Paloma'] as const;
export const STACK_COLORS = [0xc9a24d, 0xa24d8f] as const; // altın, erik
export const STACK_CSS = ['#d9b55a', '#c46bb0'] as const;

/** Kont gövdesi ve uzuvları. */
export const COUNT = {
  radius: 0.55,
  /** Kapsülün toplam yüksekliği. */
  height: 2.7,
  shoulderY: 1.75,
  shoulderX: 0.5,
  headY: 2.45,
  hatY: 2.95,
  /** Ağız noktası: baş merkezinden ileri/aşağı. */
  mouthForward: 0.36,
  mouthDown: 0.1,
  /** Eller omuzdan en fazla bu kadar uzanır. */
  armReach: 1.75,
  /** Gövde kapsülü kenarlarından başlayarak el rahat çalışma menzili. */
  headYawMax: 1.45,
  headPitchMax: 1.0,
} as const;

export const HAND = { radius: 0.15, mass: 1.2 } as const;
export const KID = { radius: 0.3, height: 1.1, eye: 0.95 } as const;
export const NPC_DIM = { radius: 0.38, height: 1.85 } as const;
export const GUARD_DIM = { radius: 0.45, height: 2.05 } as const;

// Çarpışma grupları (Rapier: üst 16 bit = üyelik, alt 16 bit = filtre)
export const G = {
  STATIC: 1 << 0,
  PROP: 1 << 1,
  HAND0: 1 << 2,
  HAND1: 1 << 3,
  COUNT0: 1 << 4,
  COUNT1: 1 << 5,
  NPC: 1 << 6,
  KID: 1 << 7,
  GUARD: 1 << 8,
  HELD0: 1 << 9,
  HELD1: 1 << 10,
} as const;
export const G_ALL = 0xffff;
export const groups = (member: number, filter: number): number => ((member & 0xffff) << 16) | (filter & 0xffff);

// Varlık kimlikleri: 1..4 eller, 10..19 sayaç alanı (sahne nesneleri), 100+ NPC/çaylak/güvenlik, 1000+ eşyalar
export const ID = {
  hand: (stack: number, side: 0 | 1): number => 1 + stack * 2 + side,
  coatPile: (stack: number): number => 5 + stack,
  npcBase: 100,
  kidBase: 300,
  guardBase: 400,
  propBase: 1000,
};
