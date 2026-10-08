// Sunucu tarafı çalışma zamanı varlıkları. Davranış sistemlerde (counts.ts, props.ts, ...) yaşar.

import type { SlotId } from '../shared/constants';
import { COUNT, ID } from '../shared/constants';
import type { V3 } from '../shared/math';
import type { PropKind } from '../shared/props';
import type { StackAssign } from '../shared/roles';
import { newSlosh, type Slosh } from '../shared/slosh';
import type { RBody, RCollider, RController } from './rapier';

export interface HandIn {
  x: number;
  y: number;
  f: number;
  grip: boolean;
  slap: boolean;
}

export class HandRt {
  readonly id: number;
  body!: RBody;
  collider!: RCollider;
  input: HandIn;
  prevGrip = false;
  held: PropRt | null = null;
  slapT = 0;
  slapCd = 0;
  slapHit = false;
  vel: V3 = { x: 0, y: 0, z: 0 };
  /** Vals: bu elle kenetlenmiş diğer el / NPC. */
  link: HandRt | null = null;
  linkNpc: NpcRt | null = null;
  faceCd = 0;
  constructor(
    readonly stack: number,
    readonly side: 0 | 1,
  ) {
    this.id = ID.hand(stack, side);
    this.input = HandRt.rest(side);
  }
  static rest(side: 0 | 1): HandIn {
    return { x: side === 0 ? -0.15 : 0.15, y: -0.12, f: 0.6, grip: false, slap: false };
  }
}

export interface CountInput {
  mx: number;
  mz: number;
  yaw: number | null;
  run: boolean;
  bow: boolean;
  hyaw: number;
  hpitch: number;
  mouth: boolean;
}

export type CountMode = 'stacked' | 'burst' | 'failed';

export class CountRt {
  mode: CountMode = 'stacked';
  body!: RBody;
  collider!: RCollider;
  cc!: RController;
  filterGroups = 0;
  x = 0;
  z = 0;
  yaw = 0;
  vx = 0;
  vz = 0;
  ax = 0;
  az = 0;
  headYaw = 0;
  headPitch = 0;
  mouth = 0;
  bow = 0;
  bowT = -1;
  sway = 0;
  phase = 0;
  chew = 0;
  stain = 0;
  input: CountInput = { mx: 0, mz: 0, yaw: null, run: false, bow: false, hyaw: 0, hpitch: 0, mouth: false };
  prevBowKey = false;
  hands: [HandRt, HandRt];
  // Şüphe
  susp = 0;
  peak = 0;
  calm = 0;
  grace = 0;
  bursts = 0;
  // Patlama
  restack = 0;
  pileX = 0;
  pileZ = 0;
  // Skor / sayaçlar
  score = 0;
  stats = {
    soup: 0,
    bread: 0,
    apple: 0,
    wine: 0,
    spilledOnNpc: 0,
    spills: 0,
    crashes: 0,
    slaps: 0,
    bumps: 0,
    correct: 0,
    wrong: 0,
    greets: 0,
    toasts: 0,
    caught: 0,
  };
  constructor(
    readonly stack: number,
    public assign: StackAssign,
  ) {
    this.hands = [new HandRt(stack, 0), new HandRt(stack, 1)];
  }
  get headPos(): V3 {
    return { x: this.x, y: COUNT.headY, z: this.z };
  }
  owner(slot: SlotId): number {
    return this.assign.slots[slot];
  }
}

export class PropRt {
  body!: RBody;
  collider!: RCollider;
  holders: HandRt[] = [];
  load: number;
  slosh: Slosh = newSlosh();
  pvx = 0;
  pvz = 0;
  asx = 0;
  asz = 0;
  spillAcc = 0;
  speedPrev = 0;
  consumed = false;
  /** Son gönderilen durum (delta için). */
  sent = { x: 1e9, y: 1e9, z: 1e9, qx: 0, qy: 0, qz: 0, qw: 1, load: -1, sx: 0, sz: 0 };
  readonly spawn: { x: number; y: number; z: number };
  noiseCd = 0;
  /** Son tutan yığın (sorumluluk için). */
  lastStack = -1;
  lastTouch = -99;
  constructor(
    readonly id: number,
    readonly kind: PropKind,
    x: number,
    y: number,
    z: number,
  ) {
    this.load = kind.container?.initial ?? 0;
    this.spawn = { x, y, z };
  }
}

export class NpcRt {
  body!: RBody;
  collider!: RCollider;
  st: number;
  stT = 0;
  aux = 0;
  homeX: number;
  homeZ: number;
  homeYaw: number;
  sent = { x: 1e9, z: 1e9, yaw: 1e9, st: -1, aux: -1 };
  lineCd = 0;
  bumpCd = 0;
  baseSt = 0;
  /** Sahne mantığı bu NPC'ye bir iş verdiğinde kullanılır. */
  tag = '';
  data: Record<string, number> = {};
  constructor(
    readonly id: number,
    readonly arch: string,
    readonly name: string,
    public x: number,
    public z: number,
    public yaw: number,
  ) {
    this.st = 0;
    this.homeX = x;
    this.homeZ = z;
    this.homeYaw = yaw;
  }
}

export class KidRt {
  body!: RBody;
  collider!: RCollider;
  cc!: RController;
  filterGroups = 0;
  x: number;
  z: number;
  yaw: number;
  vx = 0;
  vz = 0;
  mx = 0;
  mz = 0;
  wantYaw: number | null = null;
  run = false;
  use = false;
  caughtUntil = 0;
  rescue = 0;
  st = 0;
  sent = { x: 1e9, z: 1e9, yaw: 1e9, st: -1, aux: -1 };
  constructor(
    readonly id: number,
    readonly playerId: number,
    readonly stack: number,
    readonly name: string,
    readonly color: number,
    x: number,
    z: number,
    yaw: number,
  ) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
  }
}

export class GuardRt {
  body!: RBody;
  collider!: RCollider;
  cc!: RController;
  filterGroups = 0;
  x: number;
  z: number;
  yaw = 0;
  vx = 0;
  vz = 0;
  targetKid = -1;
  path: Array<{ x: number; z: number }> = [];
  repath = 0;
  leaving = 0;
  stuck = 0;
  sent = { x: 1e9, z: 1e9, yaw: 1e9, st: -1, aux: -1 };
  constructor(
    readonly id: number,
    x: number,
    z: number,
  ) {
    this.x = x;
    this.z = z;
  }
}
