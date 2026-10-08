// Seviye geometrisi: tek bir "Büyük Salon". Sunucu aynı veriden çarpışma kurar, istemci mesh üretir.
// Sahneye özel statik şekiller (yemek masası, halat direkleri) `sceneExtras` ile gelir.

import type { SceneId } from './protocol';

export type Mat =
  | 'marble'
  | 'ceiling'
  | 'wall'
  | 'wood'
  | 'darkwood'
  | 'gold'
  | 'carpet'
  | 'curtain'
  | 'column'
  | 'door'
  | 'piano'
  | 'cloth'
  | 'dance'
  | 'glass'
  | 'cream';

export interface BoxShape {
  k: 'box';
  p: [number, number, number];
  /** Tam boyutlar (x,y,z). */
  s: [number, number, number];
  ry?: number;
  mat: Mat;
  solid: boolean;
  vis?: boolean;
  shadow?: boolean;
}
export interface CylShape {
  k: 'cyl';
  p: [number, number, number];
  r: number;
  h: number;
  mat: Mat;
  solid: boolean;
  vis?: boolean;
  shadow?: boolean;
}
export type Shape = BoxShape | CylShape;

export interface LightDef {
  p: [number, number, number];
  color: number;
  intensity: number;
  dist: number;
}

export interface Decor {
  kind: 'chandelier' | 'painting' | 'window' | 'candelabra' | 'pianoLid' | 'rope' | 'banner' | 'stool' | 'plant';
  p: [number, number, number];
  ry?: number;
  arg?: string;
  size?: [number, number];
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface LevelDef {
  id: string;
  bounds: Bounds;
  ceiling: number;
  shapes: Shape[];
  lights: LightDef[];
  decor: Decor[];
}

export interface SceneExtras {
  shapes: Shape[];
  decor: Decor[];
}

export function buildSalon(): LevelDef {
  const shapes: Shape[] = [];
  const decor: Decor[] = [];
  const lights: LightDef[] = [];
  const W = 30;
  const D = 22;
  const H = 7;
  const box = (p: [number, number, number], s: [number, number, number], mat: Mat, solid = true, extra: Partial<BoxShape> = {}): void => {
    shapes.push({ k: 'box', p, s, mat, solid, ...extra });
  };
  const cyl = (p: [number, number, number], r: number, h: number, mat: Mat, solid = true, extra: Partial<CylShape> = {}): void => {
    shapes.push({ k: 'cyl', p, r, h, mat, solid, ...extra });
  };

  // Zemin, tavan, duvarlar
  box([0, -0.25, 0], [W, 0.5, D], 'marble');
  box([0, H + 0.25, 0], [W + 0.6, 0.5, D + 0.6], 'ceiling');
  box([0, H / 2, -D / 2 - 0.25], [W + 0.6, H, 0.5], 'wall');
  box([-W / 2 - 0.25, H / 2, 0], [0.5, H, D + 0.6], 'wall');
  box([W / 2 + 0.25, H / 2, 0], [0.5, H, D + 0.6], 'wall');
  // Güney duvarı: ortada çift kanatlı büyük kapı
  box([-8.75, H / 2, D / 2 + 0.25], [12.5, H, 0.5], 'wall');
  box([8.75, H / 2, D / 2 + 0.25], [12.5, H, 0.5], 'wall');
  box([0, 5.75, D / 2 + 0.25], [5, 2.5, 0.5], 'wall');
  box([-1.25, 2.25, D / 2 + 0.1], [2.4, 4.5, 0.2], 'door');
  box([1.25, 2.25, D / 2 + 0.1], [2.4, 4.5, 0.2], 'door');
  // kapı kolları
  cyl([-0.15, 2.2, D / 2 - 0.08], 0.07, 0.5, 'gold', false);
  cyl([0.15, 2.2, D / 2 - 0.08], 0.07, 0.5, 'gold', false);

  // Lambri ve altın şeritler
  box([0, 0.6, -D / 2 + 0.04], [W, 1.2, 0.08], 'darkwood', false);
  box([-W / 2 + 0.04, 0.6, 0], [0.08, 1.2, D], 'darkwood', false);
  box([W / 2 - 0.04, 0.6, 0], [0.08, 1.2, D], 'darkwood', false);
  box([-8.75, 0.6, D / 2 - 0.04], [12.5, 1.2, 0.08], 'darkwood', false);
  box([8.75, 0.6, D / 2 - 0.04], [12.5, 1.2, 0.08], 'darkwood', false);
  for (const y of [1.25, 6.6]) {
    box([0, y, -D / 2 + 0.05], [W, 0.1, 0.1], 'gold', false);
    box([-W / 2 + 0.05, y, 0], [0.1, 0.1, D], 'gold', false);
    box([W / 2 - 0.05, y, 0], [0.1, 0.1, D], 'gold', false);
  }

  // Sütunlar
  for (const x of [-11, 11]) {
    for (const z of [-6, 0, 6]) {
      cyl([x, 3.5, z], 0.55, H, 'column', true);
      cyl([x, 0.2, z], 0.78, 0.4, 'gold', false);
      cyl([x, 6.8, z], 0.82, 0.4, 'gold', false);
    }
  }

  // Halı ve dans pisti
  box([0, 0.006, 0], [4.6, 0.012, D - 0.4], 'carpet', false);
  box([-2.4, 0.008, 0], [0.18, 0.012, D - 0.4], 'gold', false);
  box([2.4, 0.008, 0], [0.18, 0.012, D - 0.4], 'gold', false);
  cyl([0, 0.014, 0], 5.4, 0.016, 'dance', false);
  cyl([0, 0.016, 0], 5.55, 0.01, 'gold', false);

  // Podyum (görsel), piyano, perdeler
  box([0, 0.06, -9.5], [10, 0.12, 2.6], 'darkwood', false);
  box([-7.2, 0.5, -9.1], [2.2, 0.9, 1.6], 'piano', true);
  decor.push({ kind: 'pianoLid', p: [-7.2, 0.98, -9.1] });
  decor.push({ kind: 'stool', p: [-7.2, 0, -7.9] });
  box([-5.8, 3.4, -10.78], [3.0, 6.2, 0.3], 'curtain', false);
  box([5.8, 3.4, -10.78], [3.0, 6.2, 0.3], 'curtain', false);

  // Büfe (doğu duvarı)
  box([13.0, 0.55, 1.5], [1.6, 1.1, 9], 'cloth', true);
  box([13.0, 1.13, 1.5], [1.74, 0.07, 9.14], 'darkwood', false);

  // Pencereler (batı/doğu), perdeler
  for (const side of [-1, 1]) {
    for (const z of [-8, -3, 3, 8]) {
      decor.push({ kind: 'window', p: [side * (W / 2 - 0.02), 3.6, z], ry: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
      box([side * (W / 2 - 0.2), 3.6, z - 1.15], [0.3, 5.2, 0.6], 'curtain', false);
      box([side * (W / 2 - 0.2), 3.6, z + 1.15], [0.3, 5.2, 0.6], 'curtain', false);
    }
  }
  // Tablolar (kuzey duvarı)
  decor.push({ kind: 'painting', p: [0, 4.3, -D / 2 + 0.06], arg: 'aldo', size: [3.4, 4.2] });
  decor.push({ kind: 'painting', p: [-9.5, 3.8, -D / 2 + 0.06], arg: 'storm', size: [3.0, 2.2] });
  decor.push({ kind: 'painting', p: [9.5, 3.8, -D / 2 + 0.06], arg: 'cat', size: [3.0, 2.2] });
  // Güney duvarı tabloları
  decor.push({ kind: 'painting', p: [-9, 3.8, D / 2 - 0.06], arg: 'fruit', size: [3.0, 2.2], ry: Math.PI });
  decor.push({ kind: 'painting', p: [9, 3.8, D / 2 - 0.06], arg: 'ship', size: [3.0, 2.2], ry: Math.PI });
  // Bitkiler
  for (const [x, z] of [
    [-13.6, -9.6],
    [13.6, -9.6],
    [-13.6, 9.6],
    [13.6, 9.6],
  ] as Array<[number, number]>) {
    decor.push({ kind: 'plant', p: [x, 0, z] });
  }

  // Avizeler ve ışıklar
  for (const z of [-5, 1, 7]) {
    decor.push({ kind: 'chandelier', p: [0, 5.9, z] });
    lights.push({ p: [0, 5.4, z], color: 0xffd9a8, intensity: 34, dist: 18 });
  }
  lights.push({ p: [-7.2, 3.2, -9], color: 0xffc27a, intensity: 10, dist: 9 });

  return {
    id: 'salon',
    bounds: { minX: -14.6, maxX: 14.6, minZ: -10.6, maxZ: 10.6 },
    ceiling: H,
    shapes,
    lights,
    decor,
  };
}

/** Sahne başına eklenen statik şekiller. */
export function sceneExtras(id: SceneId): SceneExtras {
  const shapes: Shape[] = [];
  const decor: Decor[] = [];
  if (id === 'dinner') {
    // Uzun, yüksek ayakta yemek masası
    shapes.push({ k: 'box', p: [0, 1.29, -3.2], s: [10, 0.12, 1.6], mat: 'wood', solid: true });
    shapes.push({ k: 'box', p: [0, 1.36, -3.2], s: [10.04, 0.02, 0.8], mat: 'cloth', solid: false });
    for (const x of [-3.7, 3.7]) shapes.push({ k: 'box', p: [x, 0.64, -3.2], s: [0.7, 1.28, 1.0], mat: 'darkwood', solid: true });
    decor.push({ kind: 'candelabra', p: [0, 1.37, -3.2] });
    decor.push({ kind: 'candelabra', p: [-4.2, 1.37, -3.2] });
    decor.push({ kind: 'candelabra', p: [4.2, 1.37, -3.2] });
  } else if (id === 'reception') {
    // Orta şerit: halat direkleri; iki yığına iki ayrı koridor
    for (let z = 9; z >= -6; z -= 3) {
      shapes.push({ k: 'cyl', p: [0, 0.55, z], r: 0.1, h: 1.1, mat: 'gold', solid: true });
      shapes.push({ k: 'cyl', p: [0, 0.03, z], r: 0.28, h: 0.06, mat: 'gold', solid: false });
      if (z > -6) decor.push({ kind: 'rope', p: [0, 0.9, z - 1.5], arg: '3' });
    }
  }
  return { shapes, decor };
}

/** Düz dikdörtgen bir şeklin zemindeki izi bir "engel" mi (yükseklik aralığına göre). */
export function shapeBlocksAt(s: Shape, minY: number, maxY: number): boolean {
  if (!s.solid) return false;
  let lo: number;
  let hi: number;
  if (s.k === 'box') {
    lo = s.p[1] - s.s[1] / 2;
    hi = s.p[1] + s.s[1] / 2;
  } else {
    lo = s.p[1] - s.h / 2;
    hi = s.p[1] + s.h / 2;
  }
  // zemin ve tavan engel değildir
  if (hi < 0.2) return false;
  if (lo > maxY) return false;
  return hi > minY;
}
