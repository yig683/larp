// Three.js dünyası: renderer, ışıklar, Salon geometrisi ve dekor.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Decor, LevelDef, Mat, SceneExtras, Shape } from '../shared/level';
import {
  PAL,
  carpetTexture,
  ceilingTexture,
  checkerTexture,
  clothTexture,
  danceTexture,
  mat,
  nightSkyTexture,
  paintingTexture,
  wallTexture,
  woodTexture,
} from './textures';

export interface Quality {
  shadows: boolean;
  shadowSize: number;
  pixelRatio: number;
}

export const QUALITY: Record<'low' | 'mid' | 'high', Quality> = {
  low: { shadows: false, shadowSize: 1024, pixelRatio: 1 },
  mid: { shadows: true, shadowSize: 1024, pixelRatio: 1.25 },
  high: { shadows: true, shadowSize: 2048, pixelRatio: 1.75 },
};

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 120);
  readonly dynamic = new THREE.Group();
  private staticGroup = new THREE.Group();
  private sun!: THREE.DirectionalLight;
  private texCache: Record<string, THREE.Texture> = {};
  private matCache = new Map<Mat, THREE.MeshStandardMaterial>();
  quality: Quality;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(0x140b16);
    this.scene.fog = new THREE.Fog(0x140b16, 22, 52);
    this.scene.add(this.staticGroup, this.dynamic);
    this.buildLights();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    this.sun.shadow.map?.dispose();
    (this.sun.shadow as THREE.LightShadow).map = null;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xffe4c4, 0x3a2430, 0.62));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 1.45);
    this.sun.position.set(5, 14, 9);
    this.sun.castShadow = this.quality.shadows;
    this.sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    const sc = this.sun.shadow.camera;
    sc.left = -17;
    sc.right = 17;
    sc.top = 14;
    sc.bottom = -14;
    sc.near = 2;
    sc.far = 40;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
  }

  // ------------------------------------------------------------ seviye

  private tex(name: string, make: () => THREE.Texture): THREE.Texture {
    return (this.texCache[name] ??= make());
  }

  private levelMat(m: Mat): THREE.MeshStandardMaterial {
    const hit = this.matCache.get(m);
    if (hit) return hit;
    let r: THREE.MeshStandardMaterial;
    switch (m) {
      case 'marble':
        r = mat(0xffffff, { map: this.tex('checker', checkerTexture), rough: 0.28, metal: 0.05, flat: false });
        break;
      case 'ceiling':
        r = mat(0xffffff, { map: this.tex('ceiling', ceilingTexture), rough: 0.95 });
        break;
      case 'wall':
        r = mat(0xffffff, { map: this.tex('wall', wallTexture), rough: 0.9, flat: false });
        break;
      case 'wood':
        r = mat(0xffffff, { map: this.tex('wood', () => woodTexture(false)), rough: 0.55 });
        break;
      case 'darkwood':
      case 'door':
        r = mat(0xffffff, { map: this.tex('dwood', () => woodTexture(true)), rough: 0.5 });
        break;
      case 'gold':
        r = mat(PAL.gold, { metal: 0.85, rough: 0.28, flat: false });
        break;
      case 'carpet':
        r = mat(0xffffff, { map: this.tex('carpet', carpetTexture), rough: 1 });
        break;
      case 'curtain':
        r = mat(0x6d1220, { rough: 1 });
        break;
      case 'column':
        r = mat(0xebe1ca, { rough: 0.4, flat: false });
        break;
      case 'piano':
        r = mat(0x0e0b12, { rough: 0.18, metal: 0.2, flat: false });
        break;
      case 'cloth':
        r = mat(0xffffff, { map: this.tex('cloth', clothTexture), rough: 1 });
        break;
      case 'dance':
        r = mat(0xffffff, { map: this.tex('dance', danceTexture), rough: 0.22, metal: 0.1, flat: false });
        break;
      case 'glass':
        r = mat(0x9fd0e8, { opacity: 0.35, rough: 0.1 });
        break;
      default:
        r = mat(0xefe3c8, { rough: 0.8 });
    }
    this.matCache.set(m, r);
    return r;
  }

  private tileFor(m: Mat): number {
    switch (m) {
      case 'marble':
        return 4;
      case 'wall':
      case 'ceiling':
        return 2.5;
      case 'carpet':
        return 3;
      case 'dance':
        return 11;
      default:
        return 1.5;
    }
  }

  private boxGeo(s: [number, number, number], tile: number): THREE.BoxGeometry {
    const g = new THREE.BoxGeometry(s[0], s[1], s[2]);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const dims: Array<[number, number]> = [
      [s[2], s[1]], // +x
      [s[2], s[1]], // -x
      [s[0], s[2]], // +y
      [s[0], s[2]], // -y
      [s[0], s[1]], // +z
      [s[0], s[1]], // -z
    ];
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, (uv.getX(i) * dims[f]![0]) / tile, (uv.getY(i) * dims[f]![1]) / tile);
      }
    }
    uv.needsUpdate = true;
    return g;
  }

  /** Statik şekilleri malzemeye göre birleştirip ekler. */
  private addShapes(shapes: Shape[], group: THREE.Group): void {
    const byMat = new Map<Mat, THREE.BufferGeometry[]>();
    for (const s of shapes) {
      if (s.vis === false) continue;
      let g: THREE.BufferGeometry;
      if (s.k === 'box') {
        g = this.boxGeo(s.s, this.tileFor(s.mat));
        if (s.ry) g.rotateY(s.ry);
      } else {
        g = new THREE.CylinderGeometry(s.r, s.r, s.h, s.r > 2 ? 48 : 20);
        if (s.mat === 'dance') {
          // dairesel doku: kapaklar zaten 0..1 yarıçaplı UV kullanır
        }
      }
      g.translate(s.p[0], s.p[1], s.p[2]);
      const arr = byMat.get(s.mat) ?? [];
      arr.push(g);
      byMat.set(s.mat, arr);
    }
    for (const [m, list] of byMat) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, this.levelMat(m));
      mesh.castShadow = m !== 'marble' && m !== 'ceiling' && m !== 'carpet' && m !== 'dance';
      mesh.receiveShadow = m !== 'ceiling';
      group.add(mesh);
      for (const g of list) g.dispose();
    }
  }

  loadLevel(level: LevelDef, extras: SceneExtras): void {
    this.scene.remove(this.staticGroup);
    this.disposeGroup(this.staticGroup);
    this.staticGroup = new THREE.Group();
    this.scene.add(this.staticGroup);
    this.addShapes([...level.shapes, ...extras.shapes], this.staticGroup);
    for (const d of [...level.decor, ...extras.decor]) {
      const o = this.buildDecor(d);
      if (o) this.staticGroup.add(o);
    }
    for (const l of level.lights) {
      const pl = new THREE.PointLight(l.color, l.intensity, l.dist, 2);
      pl.position.set(...l.p);
      this.staticGroup.add(pl);
    }
  }

  private disposeGroup(g: THREE.Object3D): void {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }

  // ------------------------------------------------------------ dekor

  private buildDecor(d: Decor): THREE.Object3D | null {
    const g = new THREE.Group();
    g.position.set(...d.p);
    if (d.ry) g.rotation.y = d.ry;
    const gold = mat(PAL.gold, { metal: 0.85, rough: 0.28, flat: false });
    switch (d.kind) {
      case 'chandelier': {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), gold);
        rod.position.y = 0.7;
        g.add(rod);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 8, 28), gold);
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 20), gold);
        ring2.rotation.x = Math.PI / 2;
        ring2.position.y = -0.35;
        g.add(ring2);
        const flameMat = mat(0xffe3a0, { emissive: 0xffc860, emissiveI: 2.2 });
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), mat(0xfaf3df));
          c.position.set(Math.cos(a) * 0.95, 0.14, Math.sin(a) * 0.95);
          g.add(c);
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), flameMat);
          f.position.set(Math.cos(a) * 0.95, 0.31, Math.sin(a) * 0.95);
          f.scale.y = 1.5;
          g.add(f);
        }
        const crys = mat(0xdff3ff, { rough: 0.05, metal: 0.1, opacity: 0.8 });
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.09 + (i % 3) * 0.02), crys);
          c.position.set(Math.cos(a) * 0.95, -0.2 - (i % 3) * 0.1, Math.sin(a) * 0.95);
          c.scale.y = 1.8;
          g.add(c);
        }
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), crys);
        bulb.position.y = -0.55;
        g.add(bulb);
        return g;
      }
      case 'painting': {
        const [w, h] = d.size ?? [3, 2.2];
        const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, h + 0.35, 0.12), gold);
        frame.castShadow = true;
        g.add(frame);
        const art = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshStandardMaterial({ map: this.tex('paint_' + d.arg, () => paintingTexture(d.arg ?? 'x', 360, Math.round((360 * h) / w))), roughness: 0.8 }),
        );
        art.position.z = 0.07;
        g.add(art);
        return g;
      }
      case 'window': {
        // Grup yerel +Z odaya bakar (ry ile döndürüldü); çerçeve genişlik X, yükseklik Y, derinlik Z
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 4.0, 0.2), gold);
        g.add(frame);
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.7), new THREE.MeshBasicMaterial({ map: this.tex('sky', nightSkyTexture) }));
        pane.position.z = 0.11;
        g.add(pane);
        return g;
      }
      case 'candelabra': {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.05, 12), gold);
        g.add(base);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), gold);
        stem.position.y = 0.3;
        g.add(stem);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.03), gold);
        arm.position.y = 0.52;
        g.add(arm);
        const flameMat = mat(0xffe3a0, { emissive: 0xffc860, emissiveI: 2.2 });
        for (const x of [-0.3, 0, 0.3]) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), mat(0xfaf3df));
          c.position.set(x, 0.62, 0);
          g.add(c);
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), flameMat);
          f.position.set(x, 0.74, 0);
          f.scale.y = 1.5;
          g.add(f);
        }
        return g;
      }
      case 'pianoLid': {
        const lid = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.6), mat(0x0e0b12, { rough: 0.18, metal: 0.2, flat: false }));
        lid.rotation.z = 0.5;
        lid.position.set(0.5, 0.35, 0);
        g.add(lid);
        const keys = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.35), mat(0xf4efe4));
        keys.position.set(0, -0.45, 0.85);
        g.add(keys);
        return g;
      }
      case 'stool': {
        const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 14), mat(0x6d1220));
        seat.position.y = 0.55;
        g.add(seat);
        for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as Array<[number, number]>) {
          const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), mat(PAL.wood));
          l.position.set(x, 0.27, z);
          g.add(l);
        }
        return g;
      }
      case 'rope': {
        const len = Number(d.arg ?? '3');
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 8), mat(0x8f1d2c));
        rope.rotation.x = Math.PI / 2;
        rope.position.z = len / 2; // z+ yönünde uzanır
        g.add(rope);
        return g;
      }
      case 'plant': {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.7, 12), mat(0x7a3a24));
        pot.position.y = 0.35;
        g.add(pot);
        const leaf = mat(0x2f6d3c);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const l = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.5 + (i % 3) * 0.35, 5), leaf);
          l.position.set(Math.cos(a) * 0.22, 1.35, Math.sin(a) * 0.22);
          l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
          g.add(l);
        }
        return g;
      }
      default:
        return null;
    }
  }
}

export { THREE };
