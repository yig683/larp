// Prosedürel modeller: eşyalar, NPC'ler, Kont, çaylaklar, güvenlik, palto yığını. Hepsi basit şekillerden.

import * as THREE from 'three';
import { COUNT } from '../shared/constants';
import { headPosOf, shoulderOf } from '../shared/body';
import { fwdX, fwdZ, rightX, rightZ, type V3 } from '../shared/math';
import { npcHandPoint } from '../shared/npc';
import { CF, CH, type CountState } from '../shared/protocol';
import { PAL, mat } from './textures';

const sph = (r: number, w = 10, h = 8): THREE.SphereGeometry => new THREE.SphereGeometry(r, w, h);
const cyl = (rt: number, rb: number, h: number, s = 12): THREE.CylinderGeometry => new THREE.CylinderGeometry(rt, rb, h, s);

function M(g: THREE.BufferGeometry, m: THREE.Material, cast = true): THREE.Mesh {
  const x = new THREE.Mesh(g, m);
  x.castShadow = cast;
  return x;
}

const silver = (): THREE.MeshStandardMaterial => mat(0xdadde2, { metal: 0.9, rough: 0.25, flat: false });
const goldM = (): THREE.MeshStandardMaterial => mat(PAL.gold, { metal: 0.85, rough: 0.28, flat: false });

// ---------------------------------------------------------------- eşyalar

export interface PropView {
  obj: THREE.Group;
  /** f = 0..1 doluluk; sx, sz = yüzey eğimi */
  setLiquid?(f: number, sx: number, sz: number): void;
}

export function buildProp(kind: string): PropView {
  const g = new THREE.Group();
  switch (kind) {
    case 'bowl': {
      const pts = [
        [0.0, -0.05],
        [0.09, -0.05],
        [0.17, -0.025],
        [0.215, 0.05],
        [0.2, 0.05],
        [0.165, -0.012],
        [0.085, -0.036],
        [0.0, -0.036],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      const shell = M(new THREE.LatheGeometry(pts, 20), new THREE.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 0.35, side: THREE.DoubleSide, flatShading: true }));
      g.add(shell);
      const rim = M(new THREE.TorusGeometry(0.208, 0.008, 6, 24), goldM(), false);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.05;
      g.add(rim);
      const soup = new THREE.Mesh(new THREE.CircleGeometry(0.19, 20), mat(PAL.soup, { rough: 0.2, flat: false, emissive: 0x3a1500, emissiveI: 0.6 }));
      soup.rotation.x = -Math.PI / 2;
      soup.position.y = 0.03;
      g.add(soup);
      return {
        obj: g,
        setLiquid: (f, sx, sz) => {
          soup.visible = f > 0.02;
          soup.position.y = -0.02 + 0.05 * f;
          soup.scale.setScalar(0.62 + 0.38 * f);
          soup.rotation.x = -Math.PI / 2 + sz * 0.15;
          soup.rotation.z = -sx * 0.15;
        },
      };
    }
    case 'spoon': {
      const handle = M(new THREE.BoxGeometry(0.022, 0.01, 0.2), silver());
      handle.position.z = 0.05;
      g.add(handle);
      const head = M(sph(0.04, 10, 6), silver());
      head.scale.set(1, 0.32, 1.45);
      head.position.set(0, 0.0, -0.115);
      g.add(head);
      const blob = new THREE.Mesh(sph(0.036, 8, 6), mat(PAL.soup, { rough: 0.2, flat: false, emissive: 0x3a1500, emissiveI: 0.6 }));
      blob.scale.set(1, 0.34, 1.4);
      blob.position.set(0, 0.012, -0.115);
      g.add(blob);
      return {
        obj: g,
        setLiquid: (f, sx, sz) => {
          blob.visible = f > 0.03;
          blob.scale.set(0.5 + f * 0.5, 0.2 + f * 0.25, 0.7 + f * 0.7);
          blob.position.set(sx * 0.03, 0.012 + f * 0.004, -0.115 + sz * 0.03);
        },
      };
    }
    case 'glass':
    case 'flute': {
      const tall = kind === 'flute';
      const h = tall ? 0.16 : 0.14;
      const gm = new THREE.MeshStandardMaterial({ color: 0xcfe9f5, transparent: true, opacity: 0.34, roughness: 0.05, metalness: 0.1, flatShading: false, depthWrite: false });
      const base = M(cyl(0.032, 0.032, 0.006, 12), gm, false);
      base.position.y = -h / 2 + 0.003;
      const stem = M(cyl(0.006, 0.006, h * 0.4, 6), gm, false);
      stem.position.y = -h / 2 + h * 0.2;
      const cup = M(cyl(tall ? 0.026 : 0.045, tall ? 0.012 : 0.02, h * 0.55, 14), gm, false);
      cup.position.y = h / 2 - h * 0.275;
      g.add(base, stem, cup);
      const wine = new THREE.Mesh(cyl(tall ? 0.024 : 0.041, tall ? 0.011 : 0.019, h * 0.5, 14), mat(PAL.wine, { rough: 0.15, flat: false, emissive: 0x200008, emissiveI: 0.5 }));
      wine.position.y = cup.position.y - 0.01;
      g.add(wine);
      const full = kind === 'flute' ? 0 : 1;
      wine.visible = full === 1;
      return {
        obj: g,
        setLiquid: (f, sx, sz) => {
          wine.visible = f > 0.03;
          wine.scale.set(1, Math.max(0.05, f), 1);
          wine.position.y = cup.position.y - 0.01 - (1 - f) * h * 0.25;
          wine.rotation.x = sz * 0.5;
          wine.rotation.z = -sx * 0.5;
        },
      };
    }
    case 'bread': {
      const b = M(sph(0.075, 10, 8), mat(0xc58a4a, { rough: 0.9 }));
      b.scale.set(1.35, 0.82, 1);
      g.add(b);
      for (const x of [-0.04, 0, 0.04]) {
        const cut = M(new THREE.BoxGeometry(0.012, 0.004, 0.08), mat(0x8c5a2a), false);
        cut.position.set(x, 0.058, 0);
        cut.rotation.y = 0.6;
        g.add(cut);
      }
      return { obj: g };
    }
    case 'apple': {
      const a = M(sph(0.05, 10, 8), mat(0xc4262a, { rough: 0.4 }));
      a.scale.y = 0.92;
      g.add(a);
      const st = M(cyl(0.004, 0.004, 0.03, 4), mat(0x4a2e18), false);
      st.position.y = 0.055;
      g.add(st);
      const leaf = M(sph(0.016, 6, 4), mat(0x3f8a3a), false);
      leaf.scale.set(1.8, 0.3, 1);
      leaf.position.set(0.014, 0.058, 0);
      g.add(leaf);
      return { obj: g };
    }
    case 'bottle': {
      const gm = mat(0x1f4a2c, { rough: 0.2, metal: 0.1, flat: false, opacity: 0.92 });
      const body = M(cyl(0.04, 0.04, 0.2, 12), gm);
      body.position.y = -0.06;
      const neck = M(cyl(0.017, 0.032, 0.12, 10), gm);
      neck.position.y = 0.1;
      const cork = M(cyl(0.015, 0.015, 0.03, 8), mat(0xc9a36a), false);
      cork.position.y = 0.175;
      const label = M(cyl(0.0415, 0.0415, 0.07, 12), mat(0xf2e6cc), false);
      label.position.y = -0.07;
      const band = M(cyl(0.0418, 0.0418, 0.012, 12), goldM(), false);
      band.position.y = -0.03;
      g.add(body, neck, cork, label, band);
      return { obj: g };
    }
    case 'plate': {
      const p = M(cyl(0.16, 0.12, 0.014, 20), mat(0xf6f1e6, { rough: 0.3 }));
      const rim = M(new THREE.TorusGeometry(0.155, 0.006, 5, 24), goldM(), false);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.005;
      g.add(p, rim);
      return { obj: g };
    }
    case 'swan': {
      const gm = mat(0xf2c64a, { metal: 0.92, rough: 0.2, flat: false });
      const plinth = M(new THREE.BoxGeometry(0.44, 0.1, 0.26), mat(0x3a2415));
      plinth.position.y = -0.29;
      g.add(plinth);
      const body = M(sph(0.2, 12, 9), gm);
      body.scale.set(1.15, 0.75, 0.8);
      body.position.y = -0.1;
      g.add(body);
      for (let i = 0; i < 6; i++) {
        const n = M(sph(0.07 - i * 0.004, 8, 6), gm);
        const a = i / 5;
        n.position.set(-0.17 + Math.sin(a * 2.2) * 0.1, 0.0 + a * 0.5, 0);
        g.add(n);
      }
      const head = M(sph(0.065, 8, 6), gm);
      head.position.set(-0.14, 0.53, 0);
      g.add(head);
      const beak = M(new THREE.ConeGeometry(0.03, 0.12, 6), mat(0xc2410c, { rough: 0.5 }));
      beak.rotation.z = Math.PI / 2;
      beak.position.set(-0.24, 0.52, 0);
      g.add(beak);
      const wing = M(sph(0.16, 8, 6), gm);
      wing.scale.set(1, 0.3, 0.9);
      wing.position.set(0.12, -0.03, 0.12);
      wing.rotation.z = 0.35;
      g.add(wing);
      const wing2 = wing.clone();
      wing2.position.z = -0.12;
      g.add(wing2);
      return { obj: g };
    }
    case 'chair': {
      const wood = mat(PAL.wood, { rough: 0.6 });
      const cush = mat(0x7a1f2b, { rough: 1 });
      const seat = M(new THREE.BoxGeometry(0.5, 0.06, 0.5), wood);
      seat.position.y = -0.02;
      const pad = M(new THREE.BoxGeometry(0.46, 0.06, 0.46), cush);
      pad.position.y = 0.04;
      const back = M(new THREE.BoxGeometry(0.5, 0.55, 0.05), wood);
      back.position.set(0, 0.28, 0.23);
      g.add(seat, pad, back);
      for (const [x, z] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]] as Array<[number, number]>) {
        const l = M(cyl(0.025, 0.025, 0.43, 6), wood);
        l.position.set(x, -0.255, z);
        g.add(l);
      }
      return { obj: g };
    }
    default: {
      g.add(M(sph(0.08), mat(0xff00ff)));
      return { obj: g };
    }
  }
}

// ---------------------------------------------------------------- NPC

interface NpcStyle {
  dress: number;
  skirt?: boolean;
  hat: string;
  extra?: string;
  hair: number;
  big?: boolean;
}
const NPC_STYLE: Record<string, NpcStyle> = {
  duchess: { dress: 0x7a3d8c, skirt: true, hat: 'beehive', extra: 'pearls', hair: 0xcfcfd6 },
  colonel: { dress: 0x8f2b2b, hat: 'cap', extra: 'medals', hair: 0x5a3a22 },
  madame: { dress: 0xd9648c, skirt: true, hat: 'feather', hair: 0x2a1a12 },
  sir: { dress: 0x24272f, hat: 'tophat', extra: 'monocle', hair: 0x6e6e6e },
  critic: { dress: 0x17171c, hat: 'beret', extra: 'glasses', hair: 0x1a1a1a },
  banker: { dress: 0x59606b, hat: 'bowler', extra: 'case', hair: 0x3a3a3a },
  maestro: { dress: 0x1b1b24, hat: 'wildhair', extra: 'bowtie', hair: 0xe8e8ee },
  host: { dress: 0x5e1426, hat: 'gold', extra: 'chain', hair: 0x2a2a2a, big: true },
  lady: { dress: 0xe8a0c0, skirt: true, hat: 'tiara', hair: 0xe0b060 },
};

export class NpcView {
  readonly obj = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private phase = Math.random() * 6;
  private hatMesh: THREE.Object3D | null = null;
  private stains = new THREE.Group();
  stainN = 0;
  readonly height: number;

  constructor(readonly arch: string) {
    const st = NPC_STYLE[arch] ?? NPC_STYLE.lady!;
    const s = st.big ? 1.12 : 1;
    this.height = 1.95 * s;
    const skin = mat(PAL.skin, { rough: 0.7 });
    const dress = mat(st.dress, { rough: 0.8 });
    const root = this.obj;
    if (st.skirt) {
      const sk = M(new THREE.ConeGeometry(0.58, 1.05, 14), dress);
      sk.position.y = 0.52;
      root.add(sk);
    } else {
      for (const x of [-0.12, 0.12]) {
        const l = M(cyl(0.09, 0.08, 0.95, 8), dress);
        l.position.set(x, 0.47, 0);
        root.add(l);
        const shoe = M(sph(0.1, 8, 6), mat(0x111111));
        shoe.scale.set(1, 0.6, 1.5);
        shoe.position.set(x, 0.05, -0.05);
        root.add(shoe);
      }
    }
    this.torso.position.y = 0.95;
    root.add(this.torso);
    const chest = M(new THREE.CapsuleGeometry(0.27 * (st.big ? 1.25 : 1), 0.45, 4, 10), dress);
    chest.position.y = 0.38;
    this.torso.add(chest);
    // kafa
    this.head.position.y = 0.95;
    this.torso.add(this.head);
    const face = M(sph(0.22, 10, 8), skin);
    this.head.add(face);
    const nose = M(new THREE.ConeGeometry(0.035, 0.09, 6), skin);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, -0.01, -0.22);
    this.head.add(nose);
    for (const x of [-0.08, 0.08]) {
      const e = M(sph(0.035, 6, 5), mat(0xffffff), false);
      e.position.set(x, 0.05, -0.19);
      this.head.add(e);
      const p = M(sph(0.016, 5, 4), mat(0x111111), false);
      p.position.set(x, 0.05, -0.222);
      this.head.add(p);
    }
    const mouth = M(sph(0.04, 6, 4), mat(0x6a1c1c), false);
    mouth.scale.set(1.2, 0.35, 0.5);
    mouth.position.set(0, -0.1, -0.2);
    this.head.add(mouth);
    // başlık / saç
    const hair = mat(st.hair, { rough: 1 });
    switch (st.hat) {
      case 'beehive': {
        for (let i = 0; i < 4; i++) {
          const b = M(sph(0.2 - i * 0.03, 8, 6), hair);
          b.position.y = 0.14 + i * 0.12;
          this.head.add(b);
        }
        break;
      }
      case 'cap': {
        const c = M(cyl(0.23, 0.25, 0.14, 12), mat(0x8f2b2b));
        c.position.y = 0.2;
        const v = M(cyl(0.2, 0.22, 0.03, 12), mat(0x111111));
        v.position.set(0, 0.11, -0.12);
        const badge = M(sph(0.03, 5, 4), goldM(), false);
        badge.position.set(0, 0.22, -0.24);
        this.head.add(c, v, badge);
        break;
      }
      case 'feather': {
        const brim = M(cyl(0.42, 0.42, 0.03, 16), mat(0xf2d0dc));
        brim.position.y = 0.22;
        const crown = M(cyl(0.2, 0.24, 0.16, 12), mat(0xf2d0dc));
        crown.position.y = 0.3;
        this.head.add(brim, crown);
        for (let i = 0; i < 3; i++) {
          const f = M(new THREE.ConeGeometry(0.05, 0.5, 5), mat([0x3fb6a8, 0xe85d8a, 0xf0c040][i]!));
          f.position.set(0.18 + i * 0.05, 0.5 + i * 0.03, 0);
          f.rotation.z = -0.6 - i * 0.2;
          this.head.add(f);
        }
        break;
      }
      case 'tophat': {
        const c = M(cyl(0.2, 0.2, 0.36, 14), mat(0x15121a));
        c.position.y = 0.38;
        const br = M(cyl(0.34, 0.34, 0.03, 16), mat(0x15121a));
        br.position.y = 0.2;
        const band = M(cyl(0.205, 0.205, 0.05, 14), goldM(), false);
        band.position.y = 0.25;
        this.head.add(c, br, band);
        break;
      }
      case 'beret': {
        const b = M(sph(0.26, 10, 6), mat(0x111122));
        b.scale.set(1, 0.4, 1);
        b.position.set(0.03, 0.2, 0);
        this.head.add(b);
        break;
      }
      case 'bowler': {
        const b = M(sph(0.23, 10, 8), mat(0x1c1c20));
        b.scale.set(1, 0.85, 1);
        b.position.y = 0.17;
        const br = M(cyl(0.3, 0.3, 0.02, 14), mat(0x1c1c20));
        br.position.y = 0.1;
        this.head.add(b, br);
        break;
      }
      case 'wildhair': {
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const c = M(new THREE.ConeGeometry(0.06, 0.38, 5), hair);
          c.position.set(Math.cos(a) * 0.2, 0.18 + (i % 3) * 0.05, Math.sin(a) * 0.2);
          c.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
          this.head.add(c);
        }
        break;
      }
      case 'gold': {
        const c = M(cyl(0.18, 0.2, 0.3, 12), goldM());
        c.position.y = 0.34;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const t = M(new THREE.ConeGeometry(0.04, 0.12, 5), goldM());
          t.position.set(Math.cos(a) * 0.17, 0.55, Math.sin(a) * 0.17);
          this.head.add(t);
        }
        this.head.add(c);
        break;
      }
      case 'tiara': {
        const base = M(new THREE.TorusGeometry(0.2, 0.015, 5, 16, Math.PI), goldM(), false);
        base.rotation.set(0, 0, 0);
        base.position.set(0, 0.12, 0);
        this.head.add(base);
        for (let i = -2; i <= 2; i++) {
          const j = M(new THREE.OctahedronGeometry(0.03), mat(0xcce8ff, { rough: 0.1, metal: 0.2, flat: true }), false);
          j.position.set(i * 0.07, 0.17 + 0.05 * (2 - Math.abs(i)) * 0.4, -0.15);
          this.head.add(j);
        }
        const b2 = M(sph(0.21, 9, 7), hair);
        b2.scale.set(1.05, 0.8, 1.05);
        b2.position.y = 0.05;
        this.head.add(b2);
        break;
      }
    }
    // ekstralar
    switch (st.extra) {
      case 'pearls': {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const p = M(sph(0.028, 6, 5), mat(0xfff8ee, { rough: 0.2, metal: 0.1 }), false);
          p.position.set(Math.cos(a) * 0.2, 0.62, Math.sin(a) * 0.2 - 0.06);
          this.torso.add(p);
        }
        break;
      }
      case 'medals': {
        for (let i = 0; i < 3; i++) {
          const m = M(cyl(0.035, 0.035, 0.01, 8), goldM(), false);
          m.rotation.x = Math.PI / 2;
          m.position.set(0.14 - i * 0.08, 0.5 - (i % 2) * 0.06, -0.27);
          this.torso.add(m);
        }
        break;
      }
      case 'monocle': {
        const r = M(new THREE.TorusGeometry(0.045, 0.006, 5, 12), goldM(), false);
        r.position.set(0.08, 0.05, -0.225);
        this.head.add(r);
        break;
      }
      case 'glasses': {
        for (const x of [-0.08, 0.08]) {
          const r = M(new THREE.TorusGeometry(0.05, 0.007, 5, 12), mat(0x111111), false);
          r.position.set(x, 0.05, -0.225);
          this.head.add(r);
        }
        break;
      }
      case 'case': {
        const c = M(new THREE.BoxGeometry(0.34, 0.24, 0.1), mat(0x4a2e18));
        c.position.set(0, -0.7, 0);
        this.armL.add(c);
        break;
      }
      case 'bowtie': {
        for (const x of [-0.06, 0.06]) {
          const b = M(new THREE.ConeGeometry(0.05, 0.1, 4), mat(0xb01c2e), false);
          b.rotation.z = x > 0 ? Math.PI / 2 : -Math.PI / 2;
          b.position.set(x, 0.58, -0.25);
          this.torso.add(b);
        }
        break;
      }
      case 'chain': {
        const ch = M(new THREE.TorusGeometry(0.25, 0.025, 6, 16), goldM());
        ch.rotation.x = Math.PI / 2.2;
        ch.position.set(0, 0.55, -0.1);
        this.torso.add(ch);
        break;
      }
    }
    // kollar
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as Array<[THREE.Group, number]>) {
      arm.position.set(side * 0.32 * (st.big ? 1.2 : 1), 0.6, 0);
      const a = M(cyl(0.065, 0.06, 0.62, 8), dress);
      a.position.y = -0.31;
      const h = M(sph(0.07, 8, 6), skin);
      h.position.y = -0.64;
      arm.add(a, h);
      this.torso.add(arm);
    }
    root.scale.setScalar(s);
    root.add(this.stains);
    this.hatMesh = null;
  }

  addStain(liquid: string, y: number): void {
    if (this.stainN > 10) return;
    this.stainN++;
    const m = M(sph(0.07, 6, 5), mat(liquid === 'wine' ? PAL.wine : PAL.soup, { rough: 0.3 }), false);
    m.scale.set(1.2 + Math.random(), 0.2, 1.2 + Math.random());
    const a = (Math.random() - 0.5) * 1.6;
    m.position.set(Math.sin(a) * 0.3, Math.max(0.7, Math.min(1.6, y)), -Math.cos(a) * 0.3);
    m.lookAt(m.position.x * 3, m.position.y, -3);
    this.stains.add(m);
  }

  update(x: number, z: number, yaw: number, st: number, aux: number, t: number): void {
    this.obj.position.set(x, 0, z);
    this.obj.rotation.y = yaw;
    const p = this.phase;
    const idle = Math.sin(t * 1.4 + p);
    let bob = idle * 0.01;
    let lean = 0;
    let headTilt = Math.sin(t * 0.8 + p) * 0.04;
    let lx = idle * 0.04;
    let rx = -idle * 0.04;
    let lz = -0.06;
    let rz = 0.06;
    let spin = 0;
    switch (st) {
      case CH.TALK:
        rx = -1.0 + Math.sin(t * 6 + p) * 0.35;
        rz = 0.3;
        lx = -0.4 + Math.sin(t * 5) * 0.2;
        headTilt = Math.sin(t * 4) * 0.08;
        break;
      case CH.HAPPY:
        lx = rx = -1.3 + Math.sin(t * 16) * 0.12;
        lz = 0.35;
        rz = -0.35;
        bob = Math.abs(Math.sin(t * 8)) * 0.05;
        break;
      case CH.ANGRY:
        lz = -0.9;
        rz = 0.9;
        lx = rx = 0.25;
        lean = 0.12;
        spin = Math.sin(t * 38) * 0.04;
        break;
      case CH.SHOCK:
        lx = rx = -2.7;
        lz = -0.25;
        rz = 0.25;
        lean = -0.28;
        headTilt = -0.25;
        break;
      case CH.GREET_HAND:
        rx = -1.5 + Math.sin(t * 5) * 0.06;
        rz = 0.1;
        break;
      case CH.GREET_HAT:
        rx = -2.9 + Math.sin(t * 5) * 0.1;
        rz = 0.25;
        break;
      case CH.GREET_BOW:
        lean = 0.75 + Math.sin(t * 3) * 0.05;
        break;
      case CH.DANCE:
        bob = Math.abs(Math.sin(t * 3 + p)) * 0.06;
        lean = Math.sin(t * 1.5 + p) * 0.08;
        rx = -1.5;
        lx = -1.55;
        lz = -0.9;
        rz = 0.3;
        spin = Math.sin(t * 1.5 + p) * 0.15;
        break;
      case CH.HIT:
        lean = -0.55;
        headTilt = 0.4;
        lx = rx = -0.8;
        spin = Math.sin(t * 30) * 0.05;
        break;
      default:
        break;
    }
    void aux;
    this.torso.position.y = 0.95 + bob;
    this.torso.rotation.set(-lean, spin, 0);
    this.head.rotation.z = headTilt;
    this.armL.rotation.set(lx, 0, lz);
    this.armR.rotation.set(rx, 0, rz);
  }
}

// ---------------------------------------------------------------- Kont

class Glove {
  readonly g = new THREE.Group();
  private fingers: THREE.Mesh[] = [];
  private thumb: THREE.Mesh;
  constructor() {
    const gm = mat(PAL.glove, { rough: 0.6 });
    this.g.add(M(sph(0.135, 10, 8), gm));
    for (let i = 0; i < 3; i++) {
      const f = M(new THREE.CapsuleGeometry(0.036, 0.1, 3, 6), gm);
      f.rotation.x = Math.PI / 2;
      f.position.set((i - 1) * 0.07, 0, -0.17);
      this.fingers.push(f);
      this.g.add(f);
    }
    this.thumb = M(new THREE.CapsuleGeometry(0.036, 0.07, 3, 6), gm);
    this.thumb.position.set(0.12, 0, -0.07);
    this.thumb.rotation.z = Math.PI / 3;
    this.g.add(this.thumb);
    const cuff = M(cyl(0.11, 0.12, 0.08, 10), mat(0xe9e3d3));
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = 0.13;
    this.g.add(cuff);
  }
  set(grip: number, slap: boolean, side: number): void {
    this.fingers.forEach((f, i) => {
      f.position.z = -0.17 + grip * 0.08;
      f.position.y = grip * -0.05;
      f.position.x = (i - 1) * (0.07 - grip * 0.03) * (slap ? 1.6 : 1);
      f.rotation.x = Math.PI / 2 - grip * 0.9;
    });
    this.thumb.position.x = side * 0.12 * (1 - grip * 0.4);
    this.thumb.rotation.z = side * (Math.PI / 3 + grip * 0.5);
    this.g.scale.setScalar(slap ? 1.25 : 1);
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const NEG_Z = new THREE.Vector3(0, 0, -1);

function limb(mesh: THREE.Mesh, a: V3, b: V3): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 0.001;
  mesh.position.set(a.x + dx / 2, a.y + dy / 2, a.z + dz / 2);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, new THREE.Vector3(dx / len, dy / len, dz / len));
  mesh.scale.y = len;
}

export class CountView {
  /** Dünya uzayında (dönmeyen) grup: kollar ve eldivenler burada. */
  readonly group = new THREE.Group();
  readonly root = new THREE.Group();
  private pivot = new THREE.Group();
  private headG = new THREE.Group();
  private face: THREE.Mesh;
  private faceMat: THREE.MeshStandardMaterial;
  private mouth: THREE.Mesh;
  private brows: THREE.Mesh[] = [];
  private sweat: THREE.Mesh[] = [];
  private shoes: THREE.Mesh[] = [];
  private gloves = [new Glove(), new Glove()];
  private upper: THREE.Mesh[] = [];
  private lower: THREE.Mesh[] = [];
  private stainG = new THREE.Group();
  private stainShown = 0;
  private walk = 0;
  private px = NaN;
  private pz = NaN;
  private speed = 0;
  private pendingStains: Array<{ liquid: string; y: number }> = [];
  /** Palto gövdesi parçaları: birinci şahıs kameralarda (Kafa/Eller) içinden bakıldığı için gizlenir. */
  private bodyParts: THREE.Object3D[] = [];
  hideHead = false;
  hideBody = false;

  constructor(readonly stack: number) {
    const coatCol = PAL.coat[stack] ?? PAL.coat[0];
    const coatDark = PAL.coatDark[stack] ?? PAL.coatDark[0];
    const coat = mat(coatCol, { rough: 0.85 });
    const dark = mat(coatDark, { rough: 0.9 });
    this.pivot.position.y = 0.9;
    this.root.add(this.pivot);
    // gövde (pivota göre y-0.9)
    const body = M(cyl(0.56, 0.8, 2.05, 14), coat);
    body.position.y = 0.35 + 1.025 - 0.9;
    this.pivot.add(body);
    this.bodyParts.push(body);
    const shoulders = M(sph(0.62, 12, 8), coat);
    shoulders.scale.set(1, 0.5, 0.78);
    shoulders.position.y = 2.28 - 0.9;
    this.pivot.add(shoulders);
    this.bodyParts.push(shoulders);
    const collar = M(new THREE.TorusGeometry(0.42, 0.1, 6, 14), dark);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 2.36 - 0.9;
    this.pivot.add(collar);
    this.bodyParts.push(collar);
    for (const s of [-1, 1]) {
      const lapel = M(new THREE.BoxGeometry(0.18, 0.9, 0.04), dark);
      lapel.position.set(s * 0.17, 1.95 - 0.9, -0.5);
      lapel.rotation.z = s * -0.28;
      this.pivot.add(lapel);
      this.bodyParts.push(lapel);
    }
    const belt = M(new THREE.TorusGeometry(0.66, 0.05, 6, 18), dark);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 1.5 - 0.9;
    belt.scale.set(1, 1, 0.9);
    this.pivot.add(belt);
    this.bodyParts.push(belt);
    const buckle = M(new THREE.BoxGeometry(0.16, 0.12, 0.05), mat(PAL.gold, { metal: 0.85, rough: 0.3, flat: false }));
    buckle.position.set(0, 1.5 - 0.9, -0.66);
    this.pivot.add(buckle);
    this.bodyParts.push(buckle);
    for (let i = 0; i < 3; i++) {
      const b = M(sph(0.045, 6, 5), mat(PAL.gold, { metal: 0.85, rough: 0.3, flat: false }), false);
      b.position.set(0.2, 1.95 - i * 0.28 - 0.9 + 0.2, -0.52 - i * 0.025);
      this.pivot.add(b);
      this.bodyParts.push(b);
    }
    this.pivot.add(this.stainG);

    // ayakkabılar
    for (const s of [-1, 1]) {
      const shoe = M(sph(0.2, 8, 6), mat(0x16121a, { rough: 0.4 }));
      shoe.scale.set(1, 0.55, 1.6);
      shoe.position.set(s * 0.28, 0.1, -0.2);
      this.root.add(shoe);
      this.shoes.push(shoe);
    }

    // kafa
    this.faceMat = new THREE.MeshStandardMaterial({ color: PAL.skin, roughness: 0.7, flatShading: true });
    this.face = M(sph(0.34, 12, 10), this.faceMat);
    this.headG.add(this.face);
    const nose = M(new THREE.ConeGeometry(0.06, 0.16, 6), this.faceMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, -0.02, -0.36);
    this.headG.add(nose);
    for (const x of [-0.12, 0.12]) {
      const e = M(sph(0.065, 8, 6), mat(0xffffff), false);
      e.position.set(x, 0.07, -0.29);
      this.headG.add(e);
      const p = M(sph(0.03, 6, 5), mat(0x111111), false);
      p.position.set(x, 0.07, -0.345);
      this.headG.add(p);
      const br = M(new THREE.BoxGeometry(0.16, 0.03, 0.03), mat(0x2b1c10), false);
      br.position.set(x, 0.17, -0.3);
      this.headG.add(br);
      this.brows.push(br);
      const ear = M(sph(0.07, 6, 5), this.faceMat);
      ear.position.set(x * 2.7, 0, 0);
      this.headG.add(ear);
    }
    for (const s of [-1, 1]) {
      const m = M(sph(0.1, 8, 5), mat(0x2b1c10, { rough: 1 }), false);
      m.scale.set(1.6, 0.45, 0.6);
      m.position.set(s * 0.1, -0.1, -0.33);
      m.rotation.z = s * -0.35;
      this.headG.add(m);
    }
    this.mouth = M(sph(0.1, 8, 6), mat(0x4a0f14), false);
    this.mouth.scale.set(1, 0.15, 0.4);
    this.mouth.position.set(0, -0.2, -0.3);
    this.headG.add(this.mouth);
    const mono = M(new THREE.TorusGeometry(0.075, 0.01, 6, 14), mat(PAL.gold, { metal: 0.9, rough: 0.25, flat: false }), false);
    mono.position.set(0.12, 0.07, -0.33);
    this.headG.add(mono);
    // şapka: Gustavo = silindir, Paloma = tüylü
    const hatM = mat(stack === 0 ? 0x16121a : 0x2a1633, { rough: 0.5 });
    const hatC = M(cyl(0.27, 0.29, 0.44, 14), hatM);
    hatC.position.y = 0.5;
    const hatB = M(cyl(0.5, 0.5, 0.045, 18), hatM);
    hatB.position.y = 0.3;
    const band = M(cyl(0.292, 0.292, 0.08, 14), mat(stack === 0 ? PAL.gold : 0x3fb6a8, { metal: 0.5, rough: 0.4, flat: false }), false);
    band.position.y = 0.36;
    this.headG.add(hatC, hatB, band);
    if (stack === 1) {
      for (let i = 0; i < 3; i++) {
        const f = M(new THREE.ConeGeometry(0.06, 0.65, 5), mat([0x3fb6a8, 0xe85d8a, 0xf0c040][i]!));
        f.position.set(0.3 + i * 0.05, 0.75 + i * 0.04, 0);
        f.rotation.z = -0.7 - i * 0.2;
        this.headG.add(f);
      }
    }
    // terleme damlaları
    for (const s of [-1, 1]) {
      const d = M(sph(0.045, 6, 5), mat(0x9fd8ff, { rough: 0.1, emissive: 0x335577, emissiveI: 0.6 }), false);
      d.scale.set(0.8, 1.3, 0.8);
      d.position.set(s * 0.3, 0.18, -0.2);
      d.visible = false;
      this.headG.add(d);
      this.sweat.push(d);
    }
    this.headG.rotation.order = 'YXZ';
    this.root.add(this.headG);

    // kollar (dünya uzayında)
    const sleeve = mat(coatCol, { rough: 0.85 });
    for (let i = 0; i < 2; i++) {
      const u = M(cyl(0.11, 0.1, 1, 8), sleeve);
      const l = M(cyl(0.095, 0.085, 1, 8), sleeve);
      this.upper.push(u);
      this.lower.push(l);
      this.group.add(u, l, this.gloves[i]!.g);
    }
    this.group.add(this.root);
  }

  /** Birinci şahıs kameradaki gizleme bayraklarını hemen uygular (bir kare gecikme olmasın). */
  applyFirstPerson(): void {
    this.headG.visible = !this.hideHead;
    for (const o of this.bodyParts) o.visible = !this.hideBody;
  }

  /** Yeni sıçrama: palto üzerine leke ekler. */
  addStain(liquid: string, y: number): void {
    this.pendingStains.push({ liquid, y });
  }

  private flushStains(): void {
    while (this.pendingStains.length > 0 && this.stainShown < 18) {
      const s = this.pendingStains.shift()!;
      const m = M(sph(0.09, 6, 5), mat(s.liquid === 'wine' ? PAL.wine : PAL.soup, { rough: 0.3 }), false);
      m.scale.set(1.2 + Math.random() * 1.2, 0.18, 1.2 + Math.random());
      const a = (Math.random() - 0.5) * 2.0;
      const yy = Math.max(0.7, Math.min(2.2, s.y));
      const r = 0.8 - ((yy - 0.35) / 2) * 0.26;
      m.position.set(Math.sin(a) * r, yy - 0.9, -Math.cos(a) * r);
      m.lookAt(m.position.x * 3, m.position.y, m.position.z * 3 - 2);
      this.stainG.add(m);
      this.stainShown++;
    }
  }

  update(s: CountState, handL: V3 | null, handR: V3 | null, t: number, dt: number): void {
    this.flushStains();
    const burst = (s.flags & CF.BURST) !== 0;
    this.group.visible = !burst;
    if (burst) return;
    this.root.position.set(s.x, 0, s.z);
    this.root.rotation.y = s.yaw;
    // yürüyüş hızı
    if (!Number.isNaN(this.px)) this.speed += (Math.hypot(s.x - this.px, s.z - this.pz) / Math.max(dt, 1e-3) - this.speed) * Math.min(1, dt * 8);
    this.px = s.x;
    this.pz = s.z;
    this.walk += this.speed * dt * 2.6;
    const sp = Math.min(1, this.speed / 2.5);
    this.shoes.forEach((sh, i) => {
      const ph = this.walk + i * Math.PI;
      sh.position.z = -0.2 + Math.sin(ph) * 0.3 * sp;
      sh.position.y = 0.1 + Math.max(0, Math.cos(ph)) * 0.1 * sp;
    });
    // gövde: sallanma + reverans
    this.pivot.rotation.x = -0.8 * s.bow;
    this.pivot.rotation.z = Math.sin(this.walk) * 0.03 * sp + Math.sin(t * 9) * 0.02 * s.sway;
    this.pivot.position.y = 0.9 + Math.abs(Math.cos(this.walk)) * 0.03 * sp;
    // kafa
    const hp = headPosOf(0, 0, 0, s.bow);
    this.headG.position.set(hp.x, hp.y + Math.abs(Math.cos(this.walk)) * 0.03 * sp, hp.z);
    this.headG.rotation.set(s.headPitch, s.headYaw, 0);
    this.applyFirstPerson();
    // yüz: Şüphe ile kızarır ve terler
    const k = Math.min(1, s.susp / 100);
    this.faceMat.color.setHex(PAL.skin).lerp(new THREE.Color(0xe0553f), Math.max(0, k - 0.3) * 1.2);
    for (const d of this.sweat) {
      d.visible = k > 0.55;
      d.position.y = 0.18 - ((t * 0.7 + (d === this.sweat[0] ? 0 : 0.5)) % 1) * 0.3;
    }
    for (const b of this.brows) b.rotation.z = (b.position.x > 0 ? -1 : 1) * k * 0.45;
    if (k > 0.85) this.headG.position.x += Math.sin(t * 60) * 0.01;
    // ağız
    const chew = (s.flags & CF.CHEW) !== 0;
    this.mouth.scale.y = 0.15 + s.mouth * 1.1;
    this.mouth.scale.x = 1 - s.mouth * 0.25;
    if (chew) this.mouth.scale.y = 0.2 + Math.abs(Math.sin(t * 17)) * 0.5;
    // kollar
    const sh0 = shoulderOf(s.x, s.z, s.yaw, s.bow, 0);
    const sh1 = shoulderOf(s.x, s.z, s.yaw, s.bow, 1);
    const hands = [handL, handR];
    const shoulders = [sh0, sh1];
    for (let i = 0; i < 2; i++) {
      const h = hands[i];
      const S = shoulders[i]!;
      if (!h) continue;
      const dx = h.x - S.x;
      const dy = h.y - S.y;
      const dz = h.z - S.z;
      const d = Math.min(Math.hypot(dx, dy, dz), 1.78);
      const L = d || 0.001;
      const ux = dx / L;
      const uy = dy / L;
      const uz = dz / L;
      const side = i === 0 ? -1 : 1;
      // dirsek: dışarı-aşağı kutup
      let px = rightX(s.yaw) * side * 0.9;
      let py = -0.7;
      let pz = fwdZ(s.yaw) * 0.0 - fwdZ(s.yaw) * 0.0;
      const dot = px * ux + py * uy + pz * uz;
      px -= ux * dot;
      py -= uy * dot;
      pz -= uz * dot;
      const pl = Math.hypot(px, py, pz) || 1;
      const half = d / 2;
      const hgt = Math.sqrt(Math.max(0.0, 0.9 * 0.9 - half * half));
      const E: V3 = { x: S.x + ux * half + (px / pl) * hgt, y: S.y + uy * half + (py / pl) * hgt, z: S.z + uz * half + (pz / pl) * hgt };
      limb(this.upper[i]!, S, E);
      limb(this.lower[i]!, E, h);
      const g = this.gloves[i]!;
      g.g.position.set(h.x, h.y, h.z);
      const fd = new THREE.Vector3(h.x - E.x, h.y - E.y, h.z - E.z).normalize();
      g.g.quaternion.setFromUnitVectors(NEG_Z, fd);
      const grip = (s.flags & (i === 0 ? CF.GRIP_L : CF.GRIP_R)) !== 0 ? 1 : 0;
      const slap = (s.flags & (i === 0 ? CF.SLAP_L : CF.SLAP_R)) !== 0;
      g.set(grip, slap, side);
    }
    void fwdX;
  }
}

// ---------------------------------------------------------------- çaylak, güvenlik, palto yığını

export class KidView {
  readonly obj = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Mesh();
  private legR = new THREE.Mesh();
  private body = new THREE.Group();
  private phase = 0;
  constructor(color: number) {
    const shirt = mat(PAL.player[color % 8]!, { rough: 0.8 });
    const skin = mat(PAL.skin);
    const pants = mat(0x2d3a55);
    this.body.position.y = 0.55;
    this.obj.add(this.body);
    this.body.add(M(new THREE.CapsuleGeometry(0.2, 0.3, 4, 8), shirt));
    const head = M(sph(0.22, 10, 8), skin);
    head.position.y = 0.55;
    this.body.add(head);
    const hair = M(sph(0.23, 8, 6), mat(0x3a2a1e, { rough: 1 }));
    hair.scale.set(1, 0.6, 1);
    hair.position.set(0, 0.68, 0.03);
    this.body.add(hair);
    for (const x of [-0.08, 0.08]) {
      const e = M(sph(0.045, 6, 5), mat(0xffffff), false);
      e.position.set(x, 0.58, -0.19);
      const p = M(sph(0.02, 5, 4), mat(0x111111), false);
      p.position.set(x, 0.58, -0.225);
      this.body.add(e, p);
    }
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as Array<[THREE.Group, number]>) {
      arm.position.set(side * 0.26, 0.2, 0);
      const a = M(cyl(0.05, 0.045, 0.4, 6), shirt);
      a.position.y = -0.2;
      const h = M(sph(0.055, 6, 5), skin);
      h.position.y = -0.42;
      arm.add(a, h);
      this.body.add(arm);
    }
    this.legL = M(cyl(0.07, 0.065, 0.45, 6), pants);
    this.legR = M(cyl(0.07, 0.065, 0.45, 6), pants);
    this.legL.position.set(-0.1, 0.23, 0);
    this.legR.position.set(0.1, 0.23, 0);
    this.obj.add(this.legL, this.legR);
  }
  update(x: number, z: number, yaw: number, st: number, aux: number, t: number, dt: number): void {
    this.obj.position.set(x, 0, z);
    this.obj.rotation.y = yaw;
    const sp = aux / 40;
    this.phase += sp * dt * 2.8;
    const swing = Math.sin(this.phase) * Math.min(1, sp / 2) * 0.9;
    if (st === CH.CAUGHT) {
      this.armL.rotation.set(-2.8, 0, -0.2);
      this.armR.rotation.set(-2.8, 0, 0.2);
      this.body.position.y = 0.55 + Math.sin(t * 20) * 0.01;
      this.legL.rotation.x = this.legR.rotation.x = 0;
    } else {
      this.armL.rotation.set(swing, 0, -0.1);
      this.armR.rotation.set(-swing, 0, 0.1);
      this.legL.rotation.x = -swing * 0.8;
      this.legR.rotation.x = swing * 0.8;
      this.body.position.y = 0.55 + Math.abs(Math.cos(this.phase)) * 0.04 * Math.min(1, sp / 2);
    }
  }
}

export class GuardView {
  readonly obj = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private phase = 0;
  constructor() {
    const suit = mat(0x121216, { rough: 0.7 });
    const skin = mat(0xd6a47c);
    this.obj.add(M(new THREE.CapsuleGeometry(0.3, 0.6, 4, 10), suit));
    this.obj.children[0]!.position.y = 1.2;
    const shirt = M(new THREE.ConeGeometry(0.12, 0.45, 4), mat(0xf4f4f4), false);
    shirt.rotation.x = Math.PI;
    shirt.position.set(0, 1.42, -0.27);
    this.obj.add(shirt);
    const tie = M(new THREE.ConeGeometry(0.05, 0.5, 4), mat(0xb01c2e), false);
    tie.rotation.x = Math.PI;
    tie.position.set(0, 1.28, -0.29);
    this.obj.add(tie);
    const head = M(sph(0.24, 10, 8), skin);
    head.position.y = 1.88;
    this.obj.add(head);
    const glasses = M(new THREE.BoxGeometry(0.4, 0.09, 0.05), mat(0x050505, { rough: 0.1, metal: 0.5, flat: false }), false);
    glasses.position.set(0, 1.92, -0.22);
    this.obj.add(glasses);
    const ear = M(sph(0.03, 5, 4), mat(0x35e0ff, { emissive: 0x1090aa, emissiveI: 1.5 }), false);
    ear.position.set(0.24, 1.88, 0);
    this.obj.add(ear);
    const hair = M(sph(0.25, 8, 6), mat(0x0a0a0a, { rough: 1 }));
    hair.scale.set(1, 0.5, 1);
    hair.position.set(0, 2.03, 0.02);
    this.obj.add(hair);
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as Array<[THREE.Group, number]>) {
      arm.position.set(side * 0.38, 1.6, 0);
      const a = M(cyl(0.085, 0.075, 0.75, 8), suit);
      a.position.y = -0.37;
      const h = M(sph(0.08, 6, 5), skin);
      h.position.y = -0.78;
      arm.add(a, h);
      this.obj.add(arm);
    }
    this.legL = M(cyl(0.11, 0.1, 0.9, 8), suit);
    this.legR = M(cyl(0.11, 0.1, 0.9, 8), suit);
    this.legL.position.set(-0.14, 0.45, 0);
    this.legR.position.set(0.14, 0.45, 0);
    this.obj.add(this.legL, this.legR);
  }
  update(x: number, z: number, yaw: number, aux: number, dt: number): void {
    this.obj.position.set(x, 0, z);
    this.obj.rotation.y = yaw;
    const sp = aux / 40;
    this.phase += sp * dt * 2.4;
    const sw = Math.sin(this.phase) * Math.min(1, sp / 2) * 0.8;
    this.armL.rotation.x = sw;
    this.armR.rotation.x = -sw;
    this.legL.rotation.x = -sw;
    this.legR.rotation.x = sw;
  }
}

export function buildCoatPile(stack: number): THREE.Group {
  const g = new THREE.Group();
  const coatCol = PAL.coat[stack] ?? PAL.coat[0];
  const cm = mat(coatCol, { rough: 0.9 });
  const heap = M(new THREE.ConeGeometry(0.95, 0.5, 9), cm);
  heap.position.y = 0.22;
  heap.scale.set(1.15, 1, 0.95);
  g.add(heap);
  for (let i = 0; i < 4; i++) {
    const fold = M(sph(0.3, 6, 5), mat(PAL.coatDark[stack] ?? PAL.coatDark[0], { rough: 0.9 }));
    const a = (i / 4) * Math.PI * 2 + 0.5;
    fold.position.set(Math.cos(a) * 0.55, 0.12, Math.sin(a) * 0.55);
    fold.scale.set(1.2, 0.5, 1);
    g.add(fold);
  }
  const hat = M(cyl(0.27, 0.29, 0.44, 12), mat(stack === 0 ? 0x16121a : 0x2a1633));
  hat.position.set(0.7, 0.22, 0.5);
  hat.rotation.z = 1.2;
  g.add(hat);
  for (let i = 0; i < 5; i++) {
    const b = M(sph(0.045, 6, 5), mat(PAL.gold, { metal: 0.85, rough: 0.3, flat: false }), false);
    b.position.set((Math.random() - 0.5) * 2.4, 0.04, (Math.random() - 0.5) * 2.4);
    g.add(b);
  }
  return g;
}

export { npcHandPoint, COUNT };
