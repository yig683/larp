// Fiziksel eşya türleri: hem sunucu (çarpışma/kütle) hem istemci (görünüm adı) buradan okur.

export type PropShape = 'ball' | 'box' | 'cyl';
export type Liquid = 'soup' | 'wine';

export interface PropKind {
  kind: string;
  shape: PropShape;
  /** ball: [r] · box: [hx,hy,hz] (yarım boyutlar) · cyl: [yarımYükseklik, r] */
  dim: number[];
  mass: number;
  friction: number;
  restitution: number;
  grab: boolean;
  /** Tutulurken: elin ilerisi/yukarısı ve yön kipi. */
  hold: { fwd: number; up: number; mode: 'upright' | 'spoon' | 'free'; pitch?: number };
  container?: { cap: number; liquid: Liquid; reservoir?: boolean; scoop?: boolean; initial: number };
  food?: { what: 'bread' | 'apple'; value: number };
  /** Kaşık ucu (yerel). */
  tip?: [number, number, number];
  /** Eşiği aşan darbede "gürültü" sayılır. */
  fragile?: boolean;
}

export const PROP_KINDS: Record<string, PropKind> = {
  bowl: {
    kind: 'bowl',
    shape: 'cyl',
    dim: [0.05, 0.21],
    mass: 0.7,
    friction: 0.9,
    restitution: 0.05,
    grab: true,
    hold: { fwd: 0.18, up: -0.04, mode: 'upright' },
    container: { cap: 10, liquid: 'soup', reservoir: true, initial: 10 },
    fragile: true,
  },
  spoon: {
    kind: 'spoon',
    shape: 'box',
    dim: [0.014, 0.008, 0.15],
    mass: 0.06,
    friction: 0.8,
    restitution: 0.05,
    grab: true,
    hold: { fwd: 0.1, up: 0.0, mode: 'spoon', pitch: 0.22 },
    container: { cap: 1, liquid: 'soup', scoop: true, initial: 0 },
    tip: [0, 0.012, -0.13],
  },
  glass: {
    kind: 'glass',
    shape: 'cyl',
    dim: [0.07, 0.04],
    mass: 0.15,
    friction: 0.7,
    restitution: 0.05,
    grab: true,
    hold: { fwd: 0.12, up: 0.0, mode: 'upright' },
    container: { cap: 1, liquid: 'wine', initial: 1 },
    fragile: true,
  },
  flute: {
    kind: 'flute',
    shape: 'cyl',
    dim: [0.08, 0.03],
    mass: 0.1,
    friction: 0.7,
    restitution: 0.05,
    grab: true,
    hold: { fwd: 0.12, up: 0.0, mode: 'upright' },
    fragile: true,
  },
  bread: {
    kind: 'bread',
    shape: 'ball',
    dim: [0.075],
    mass: 0.12,
    friction: 0.9,
    restitution: 0.1,
    grab: true,
    hold: { fwd: 0.1, up: 0.0, mode: 'free' },
    food: { what: 'bread', value: 1 },
  },
  apple: {
    kind: 'apple',
    shape: 'ball',
    dim: [0.05],
    mass: 0.1,
    friction: 0.9,
    restitution: 0.3,
    grab: true,
    hold: { fwd: 0.1, up: 0.0, mode: 'free' },
    food: { what: 'apple', value: 1 },
  },
  bottle: {
    kind: 'bottle',
    shape: 'cyl',
    dim: [0.16, 0.04],
    mass: 0.45,
    friction: 0.7,
    restitution: 0.1,
    grab: true,
    hold: { fwd: 0.15, up: 0.0, mode: 'upright' },
    fragile: true,
  },
  plate: {
    kind: 'plate',
    shape: 'cyl',
    dim: [0.012, 0.16],
    mass: 0.25,
    friction: 0.6,
    restitution: 0.05,
    grab: true,
    hold: { fwd: 0.2, up: 0.0, mode: 'upright' },
    fragile: true,
  },
  swan: {
    kind: 'swan',
    shape: 'box',
    dim: [0.22, 0.34, 0.14],
    mass: 28,
    friction: 0.8,
    restitution: 0.02,
    grab: true,
    hold: { fwd: 0.45, up: -0.1, mode: 'free' },
  },
  chair: {
    kind: 'chair',
    shape: 'box',
    dim: [0.25, 0.45, 0.25],
    mass: 6,
    friction: 0.8,
    restitution: 0.05,
    grab: true,
    hold: { fwd: 0.5, up: -0.3, mode: 'free' },
  },
};

export const propKind = (kind: string): PropKind => PROP_KINDS[kind] ?? PROP_KINDS.plate!;

/** Cismin dünya yarıçapı (yaklaşık, tutma mesafesi için). */
export function propRadius(k: PropKind): number {
  switch (k.shape) {
    case 'ball':
      return k.dim[0]!;
    case 'cyl':
      return Math.max(k.dim[1]!, k.dim[0]!);
    case 'box':
      return Math.max(k.dim[0]!, k.dim[1]!, k.dim[2]!);
  }
}
