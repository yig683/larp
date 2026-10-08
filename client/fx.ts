// Görsel efektler: sıçrayan sıvı, zemin/masa lekeleri, patlama konfetisi, kadeh kıvılcımı, ekran sarsıntısı.

import * as THREE from 'three';
import { PAL, mat } from './textures';

interface Part {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  grav: number;
  spin: number;
  ground: number;
}

const SPHERE = new THREE.SphereGeometry(1, 6, 5);
const BOX = new THREE.BoxGeometry(1, 1, 1);

export class Fx {
  readonly group = new THREE.Group();
  shake = 0;
  private parts: Part[] = [];
  private pool: THREE.Mesh[] = [];
  private decals: THREE.Mesh[] = [];
  private decalI = 0;
  private decalMat = new Map<string, THREE.MeshBasicMaterial>();

  private mesh(geo: THREE.BufferGeometry, color: number, emissive = false): THREE.Mesh {
    let m = this.pool.pop();
    if (!m) {
      m = new THREE.Mesh(geo, mat(color));
      this.group.add(m);
    }
    m.geometry = geo;
    m.material = emissive ? mat(color, { emissive: color, emissiveI: 1.6, rough: 0.4 }) : mat(color, { rough: 0.6 });
    m.visible = true;
    m.castShadow = false;
    return m;
  }

  private add(p: Omit<Part, 'mesh'> & { mesh: THREE.Mesh }): void {
    if (this.parts.length > 420) {
      const old = this.parts.shift()!;
      old.mesh.visible = false;
      this.pool.push(old.mesh);
    }
    this.parts.push(p);
  }

  splash(x: number, y: number, z: number, liquid: string, amt: number, onto: string): void {
    const color = liquid === 'wine' ? PAL.wine : PAL.soup;
    const n = Math.min(26, 5 + Math.round(amt * 22));
    for (let i = 0; i < n; i++) {
      const m = this.mesh(SPHERE, color);
      const s = 0.012 + Math.random() * 0.025;
      m.scale.setScalar(s);
      m.position.set(x, y, z);
      this.add({
        mesh: m,
        vx: (Math.random() - 0.5) * 1.6,
        vy: 0.8 + Math.random() * 1.8,
        vz: (Math.random() - 0.5) * 1.6,
        life: 0.7 + Math.random() * 0.5,
        max: 1.2,
        grav: 9,
        spin: 0,
        ground: onto === 'floor' ? 0.01 : Math.max(0.01, y - 0.35),
      });
    }
    if (onto === 'floor' || onto === 'table') this.decal(x, y + 0.012, z, color, 0.12 + Math.min(0.5, amt * 0.5));
  }

  decal(x: number, y: number, z: number, color: number, r: number): void {
    const key = String(color);
    let m = this.decalMat.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      this.decalMat.set(key, m);
    }
    let d = this.decals[this.decalI % 80];
    if (!d) {
      d = new THREE.Mesh(new THREE.CircleGeometry(1, 12), m);
      d.rotation.x = -Math.PI / 2;
      this.decals[this.decalI % 80] = d;
      this.group.add(d);
    }
    this.decalI++;
    d.material = m;
    d.position.set(x, y, z);
    d.scale.set(r * (0.8 + Math.random() * 0.6), r * (0.8 + Math.random() * 0.6), 1);
    d.rotation.z = Math.random() * 6;
    d.visible = true;
  }

  /** Trençkot patlaması: düğmeler, kumaş parçaları, tüyler. */
  burst(x: number, z: number): void {
    for (let i = 0; i < 70; i++) {
      const gold = i % 3 === 0;
      const m = this.mesh(gold ? SPHERE : BOX, gold ? PAL.gold : [0x9c8452, 0x73407a, 0xe8e0c8][i % 3]!, gold);
      const s = gold ? 0.04 : 0.05 + Math.random() * 0.1;
      m.scale.set(s, gold ? s : s * 0.2, gold ? s : s * 1.4);
      m.position.set(x, 1.4 + Math.random() * 1.2, z);
      this.add({
        mesh: m,
        vx: (Math.random() - 0.5) * 7,
        vy: 2 + Math.random() * 5,
        vz: (Math.random() - 0.5) * 7,
        life: 1.4 + Math.random() * 0.9,
        max: 2.3,
        grav: 8,
        spin: (Math.random() - 0.5) * 14,
        ground: 0.03,
      });
    }
    this.shake = Math.max(this.shake, 0.6);
  }

  clink(x: number, y: number, z: number): void {
    for (let i = 0; i < 26; i++) {
      const m = this.mesh(SPHERE, i % 2 ? 0xffe9a0 : 0xffffff, true);
      m.scale.setScalar(0.02 + Math.random() * 0.02);
      m.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.2;
      this.add({ mesh: m, vx: Math.cos(a) * sp, vy: Math.random() * 2.4, vz: Math.sin(a) * sp, life: 0.8, max: 0.8, grav: 3, spin: 0, ground: -5 });
    }
  }

  confetti(x: number, y: number, z: number): void {
    const cols = [0xe6554d, 0x4aa3df, 0x58b86a, 0xf0b53a, 0xa66cd9, 0xe8789f];
    for (let i = 0; i < 90; i++) {
      const m = this.mesh(BOX, cols[i % cols.length]!);
      m.scale.set(0.06, 0.01, 0.09);
      m.position.set(x + (Math.random() - 0.5) * 3, y, z + (Math.random() - 0.5) * 3);
      this.add({ mesh: m, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 2, life: 2.5 + Math.random(), max: 3.5, grav: 2.2, spin: 6, ground: 0.02 });
    }
  }

  crash(x: number, y: number, z: number, broke: boolean): void {
    this.shake = Math.max(this.shake, broke ? 0.3 : 0.15);
    if (!broke) return;
    for (let i = 0; i < 14; i++) {
      const m = this.mesh(BOX, 0xcfe9f5);
      m.scale.set(0.02, 0.005, 0.03);
      m.position.set(x, y, z);
      this.add({ mesh: m, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2.5, vz: (Math.random() - 0.5) * 3, life: 1.6, max: 1.6, grav: 9, spin: 10, ground: 0.02 });
    }
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 1.4);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.pool.push(p.mesh);
        this.parts.splice(i, 1);
        continue;
      }
      p.vy -= p.grav * dt;
      const m = p.mesh;
      m.position.x += p.vx * dt;
      m.position.y += p.vy * dt;
      m.position.z += p.vz * dt;
      if (m.position.y < p.ground) {
        m.position.y = p.ground;
        p.vy = 0;
        p.vx *= 0.7;
        p.vz *= 0.7;
        p.spin = 0;
      }
      m.rotation.x += p.spin * dt;
      m.rotation.z += p.spin * dt * 0.6;
      if (p.life < 0.25) m.scale.multiplyScalar(0.9);
    }
  }
}
