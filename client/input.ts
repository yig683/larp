// Girdi: pointer lock + klavye/fare -> role göre sunucuya giden girdi mesajı.
//
// Roller:
//  Bacaklar: WASD yürü · fare dön · Shift koş · Boşluk reverans
//  Kafa:     fare bak · sol tık ağız aç · Q basılı tut = söylem çarkı (bırakınca konuşur)
//  Eller:    fare eli oynatır · W/S ya da tekerlek = derinlik · sol tık tut · sağ tık tokat
//            (iki eli tek oyuncu yönetiyorsa Q/E el seç, R ikisi birden)
//  Çaylak:   WASD · fare · Shift koş · E basılı tut (yeniden yığıl / kurtar)
// Bacak+kafa sahibi oyuncu "Beden" olarak oynar: fare gövdeyi çevirir (yatay) ve başı eğer (dikey).
// Birden çok rol grubu olan oyuncu (Beden + Eller, tek kişilik deneme dahil) Tab ile gruplar arasında geçer.

import { COUNT, type SlotId } from '../shared/constants';
import { clamp, wrapPi } from '../shared/math';
import type { HandInput, InputMsg } from '../shared/protocol';
import { S } from './state';

export type Group = 'legs' | 'head' | 'hands' | 'body';

export interface InputCallbacks {
  onSay(index: number): void;
  onLockChange(locked: boolean): void;
  onToggle(what: 'tuning' | 'report' | 'mute' | 'hints' | 'menu'): void;
}

const HAND_K = 0.0034; // metre / piksel
const WHEEL_R = 130;

export class Input {
  locked = false;
  private keys = new Set<string>();
  private mdx = 0;
  private mdy = 0;
  private wheel = 0;
  private lmb = false;
  private rmbEdge = 0;
  yaw = 0;
  headYaw = 0;
  headPitch = 0;
  kidYaw = 0;
  kidPitch = 0.28;
  hand: Array<{ x: number; y: number; f: number }> = [
    { x: -0.15, y: -0.12, f: 0.6 },
    { x: 0.15, y: -0.12, f: 0.6 },
  ];
  grip = [false, false];
  activeHand: 0 | 1 | 2 = 1;
  wheelOpen = false;
  wheelVec = { x: 0, y: 0 };
  wheelSel = -1;
  group: Group = 'legs';
  private seq = 0;
  private slapUntil = 0;
  private yawInit = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: InputCallbacks,
  ) {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.keys.clear();
        this.lmb = false;
        this.closeWheel(false);
      }
      this.cb.onLockChange(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mdx += e.movementX;
      this.mdy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.onLmb(true);
      else if (e.button === 2) this.rmbEdge++;
      e.preventDefault();
    });
    document.addEventListener('mouseup', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.onLmb(false);
    });
    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    document.addEventListener(
      'wheel',
      (e) => {
        if (!this.locked) return;
        this.wheel += e.deltaY;
        e.preventDefault();
      },
      { passive: false },
    );
    document.addEventListener('keydown', (e) => this.onKey(e, true));
    document.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.lmb = false;
    });
  }

  requestLock(): void {
    void this.canvas.requestPointerLock?.();
  }
  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private onLmb(down: boolean): void {
    const toggle = S.settings.toggleGrip || this.twoHanded();
    if (this.group === 'hands') {
      if (toggle) {
        if (down) this.setGripForActive(!this.gripOfActive());
      } else this.setGripForActive(down);
    }
    this.lmb = down;
  }

  private gripOfActive(): boolean {
    return this.activeHand === 2 ? this.grip[0]! && this.grip[1]! : this.grip[this.activeHand]!;
  }
  private setGripForActive(v: boolean): void {
    if (this.activeHand === 2) this.grip = [v, v];
    else this.grip[this.activeHand] = v;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.code;
    if (down && !e.repeat) {
      if (k === 'F8') {
        this.cb.onToggle('tuning');
        e.preventDefault();
        return;
      }
      if (k === 'F9') {
        this.cb.onToggle('report');
        e.preventDefault();
        return;
      }
      if (k === 'KeyM') this.cb.onToggle('mute');
      if (k === 'KeyH') this.cb.onToggle('hints');
    }
    if (!this.locked) return;
    if (k === 'Tab') {
      e.preventDefault();
      if (down && !e.repeat) this.cycleGroup();
      return;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyR', 'KeyQ', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    if (down) {
      this.keys.add(k);
      if (k === 'KeyQ' && (this.group === 'head' || this.group === 'body') && !e.repeat && !S.inKidMode) this.openWheel();
      if (this.group === 'hands' && !S.inKidMode && this.twoHanded()) {
        if (k === 'KeyQ') this.activeHand = 0;
        if (k === 'KeyE') this.activeHand = 1;
        if (k === 'KeyR') this.activeHand = 2;
      }
      if (S.myStack < 0 && (k === 'ArrowLeft' || k === 'ArrowRight') && S.hud) {
        const n = S.hud.stacks.length;
        S.spectateStack = (S.spectateStack + (k === 'ArrowRight' ? 1 : n - 1)) % Math.max(1, n);
      }
    } else {
      this.keys.delete(k);
      if (k === 'KeyQ' && this.wheelOpen) this.closeWheel(true);
    }
  }

  private openWheel(): void {
    this.wheelOpen = true;
    this.wheelVec = { x: 0, y: 0 };
    this.wheelSel = -1;
  }
  private closeWheel(send: boolean): void {
    if (!this.wheelOpen) return;
    this.wheelOpen = false;
    if (send && this.wheelSel >= 0) this.cb.onSay(this.wheelSel);
    this.wheelSel = -1;
  }

  twoHanded(): boolean {
    return S.mySlots.includes('handL') && S.mySlots.includes('handR');
  }

  groups(): Group[] {
    const g: Group[] = [];
    const legs = S.mySlots.includes('legs');
    const head = S.mySlots.includes('head');
    if (legs && head) g.push('body');
    else {
      if (legs) g.push('legs');
      if (head) g.push('head');
    }
    if (S.mySlots.includes('handL') || S.mySlots.includes('handR')) g.push('hands');
    return g;
  }

  cycleGroup(): void {
    const g = this.groups();
    if (g.length < 2) return;
    this.closeWheel(false);
    this.group = g[(g.indexOf(this.group) + 1) % g.length]!;
    this.syncActive();
  }

  /** Rol (sahne) değişince çağrılır. */
  resetForScene(bodyYaw: number): void {
    const g = this.groups();
    this.group = g[0] ?? 'legs';
    this.yaw = bodyYaw;
    this.headYaw = 0;
    this.headPitch = 0;
    this.hand = [
      { x: -0.15, y: -0.12, f: 0.6 },
      { x: 0.15, y: -0.12, f: 0.6 },
    ];
    this.grip = [false, false];
    this.activeHand = S.mySlots.includes('handR') ? 1 : 0;
    if (this.twoHanded()) this.activeHand = 1;
    this.closeWheel(false);
    this.yawInit = true;
    this.syncActive();
  }

  private syncActive(): void {
    if (this.group === 'legs') S.activeSlot = 'legs';
    else if (this.group === 'head' || this.group === 'body') S.activeSlot = 'head';
    else S.activeSlot = this.activeHand === 0 ? 'handL' : 'handR';
  }

  handIsActive(side: 0 | 1): boolean {
    return this.group === 'hands' && (this.activeHand === 2 || this.activeHand === side);
  }

  /** Çaylak moduna girerken bakış yönünü ayarla. */
  enterKid(yaw: number): void {
    this.kidYaw = yaw;
    this.kidPitch = 0.28;
    this.closeWheel(false);
  }

  /** Her kare çağrılır: fare/klavyeyi tüketir, gönderilecek girdiyi döner (null = gönderme). */
  update(dt: number, reach: number, kid: boolean): Omit<InputMsg, 't' | 'seq'> | null {
    const sens = 0.0024 * S.settings.sens;
    const dx = this.mdx;
    const dy = this.mdy;
    this.mdx = 0;
    this.mdy = 0;
    const wheel = this.wheel;
    this.wheel = 0;
    const key = (c: string): boolean => this.keys.has(c);
    const out: Omit<InputMsg, 't' | 'seq'> = {};
    if (kid) {
      this.kidYaw = wrapPi(this.kidYaw - dx * sens);
      this.kidPitch = clamp(this.kidPitch + dy * sens * 0.8, -0.2, 1.2);
      out.mx = (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0);
      out.mz = (key('KeyW') ? 1 : 0) - (key('KeyS') ? 1 : 0);
      out.yaw = this.kidYaw;
      out.run = key('ShiftLeft') || key('ShiftRight');
      out.use = key('KeyE');
      return out;
    }
    if (!this.yawInit) return null;
    const own = new Set<SlotId>(S.mySlots);
    // fareyi aktif gruba uygula
    const legsActive = this.group === 'legs' || this.group === 'body';
    const headActive = this.group === 'head' || this.group === 'body';
    if (headActive && this.wheelOpen) {
      this.wheelVec.x = clamp(this.wheelVec.x + dx, -WHEEL_R, WHEEL_R);
      this.wheelVec.y = clamp(this.wheelVec.y + dy, -WHEEL_R, WHEEL_R);
      const len = Math.hypot(this.wheelVec.x, this.wheelVec.y);
      if (len > WHEEL_R) {
        this.wheelVec.x *= WHEEL_R / len;
        this.wheelVec.y *= WHEEL_R / len;
      }
      if (len < 32) this.wheelSel = -1;
      else {
        const a = Math.atan2(this.wheelVec.x, -this.wheelVec.y);
        this.wheelSel = Math.floor((((a + Math.PI / 6 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * 6) % 6;
      }
    } else if (this.group === 'body') {
      this.yaw = wrapPi(this.yaw - dx * sens);
      this.headPitch = clamp(this.headPitch - dy * sens, -COUNT.headPitchMax, COUNT.headPitchMax);
      this.headYaw *= Math.max(0, 1 - dt * 6);
    } else if (this.group === 'legs') {
      this.yaw = wrapPi(this.yaw - dx * sens);
    } else if (this.group === 'head') {
      this.headYaw = clamp(this.headYaw - dx * sens, -COUNT.headYawMax, COUNT.headYawMax);
      this.headPitch = clamp(this.headPitch - dy * sens, -COUNT.headPitchMax, COUNT.headPitchMax);
    } else if (this.group === 'hands') {
      const sides: Array<0 | 1> = this.activeHand === 2 ? [0, 1] : [this.activeHand];
      const depth = (key('KeyW') ? 1 : 0) - (key('KeyS') ? 1 : 0);
      for (const s of sides) {
        const h = this.hand[s]!;
        h.x += dx * HAND_K * S.settings.sens * (this.activeHand === 2 && s === 0 ? -1 : 1);
        h.y -= dy * HAND_K * S.settings.sens;
        h.f += depth * dt * 1.1 - wheel * 0.0011;
        const len = Math.hypot(h.x, h.y, h.f);
        if (len > reach) {
          h.x *= reach / len;
          h.y *= reach / len;
          h.f *= reach / len;
        }
        h.f = Math.max(-0.35, h.f);
      }
    }
    // gönderilecek durum (sahip olunan tüm slotlar)
    if (own.has('legs')) {
      const active = legsActive;
      out.mx = active ? (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0) : 0;
      out.mz = active ? (key('KeyW') ? 1 : 0) - (key('KeyS') ? 1 : 0) : 0;
      out.yaw = this.yaw;
      out.run = active && (key('ShiftLeft') || key('ShiftRight'));
      out.bow = active && key('Space');
    }
    if (own.has('head')) {
      out.hyaw = this.headYaw;
      out.hpitch = this.headPitch;
      out.mouth = headActive && this.lmb && !this.wheelOpen;
    }
    const now = performance.now();
    if (this.rmbEdge > 0) {
      this.rmbEdge = 0;
      if (this.group === 'hands') this.slapUntil = now + 170;
    }
    const slapOn = now < this.slapUntil;
    const mk = (s: 0 | 1): HandInput => ({
      x: this.hand[s]!.x,
      y: this.hand[s]!.y,
      f: this.hand[s]!.f,
      grip: this.grip[s]!,
      slap: slapOn && this.handIsActive(s),
    });
    if (own.has('handL')) out.hl = mk(0);
    if (own.has('handR')) out.hr = mk(1);
    return out;
  }

  nextSeq(): number {
    return this.seq++;
  }
}
