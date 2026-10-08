// Ses: WebAudio ile sentezlenen efektler + prosedürel "müzik kutusu" valsi + tarayıcı TTS.
// Hiçbir ses dosyası yoktur.

import { S } from './state';

type Sfx = 'splash' | 'clink' | 'eat' | 'gulp' | 'pop' | 'crash' | 'slap' | 'grab' | 'drop' | 'gasp' | 'ding' | 'womp' | 'fanfare' | 'alarm' | 'scoop' | 'bump' | 'bell' | 'link';

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private timer: number | undefined;
  private nextBar = 0;
  private bar = 0;
  tension = false;
  musicOn = false;
  muted = false;
  private voices: SpeechSynthesisVoice[] = [];

  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = S.settings.volume;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if ('speechSynthesis' in window) {
      const load = (): void => {
        this.voices = window.speechSynthesis.getVoices();
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
  }

  setVolume(v: number): void {
    S.settings.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }
  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : S.settings.volume;
    if (m && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  // ------------------------------------------------------------ yardımcılar

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number, bus: GainNode = this.sfxBus): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, f0: number, f1: number, type: BiquadFilterType, when = 0): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name: Sfx, vol = 1): void {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'splash':
        this.hiss(0.28, 0.35 * vol, 1400, 300, 'bandpass');
        this.tone(420, 0.12, 'sine', 0.12 * vol, 0, 160);
        break;
      case 'scoop':
        this.tone(300, 0.1, 'sine', 0.1 * vol, 0, 520);
        break;
      case 'clink':
        this.tone(2400, 0.5, 'sine', 0.18 * vol);
        this.tone(3600, 0.35, 'sine', 0.1 * vol, 0.01);
        this.tone(1800, 0.6, 'sine', 0.08 * vol, 0.02);
        break;
      case 'eat':
      case 'gulp':
        this.tone(200, 0.16, 'sine', 0.22 * vol, 0, 90);
        this.hiss(0.1, 0.12 * vol, 900, 250, 'lowpass');
        break;
      case 'pop':
        this.tone(140, 0.45, 'sine', 0.5 * vol, 0, 35);
        this.hiss(0.35, 0.4 * vol, 3000, 200, 'lowpass');
        for (let i = 0; i < 5; i++) this.tone(2400 + i * 300, 0.12, 'triangle', 0.08 * vol, 0.04 * i, 900);
        break;
      case 'crash':
        this.hiss(0.5, 0.42 * vol, 3500, 180, 'lowpass');
        for (let i = 0; i < 4; i++) this.tone(1500 + Math.random() * 1500, 0.1, 'square', 0.05 * vol, 0.06 * i);
        break;
      case 'slap':
        this.hiss(0.08, 0.5 * vol, 6000, 1500, 'highpass');
        this.tone(300, 0.1, 'sine', 0.3 * vol, 0, 90);
        break;
      case 'grab':
        this.tone(700, 0.05, 'triangle', 0.1 * vol, 0, 500);
        break;
      case 'drop':
        this.tone(260, 0.07, 'triangle', 0.08 * vol, 0, 150);
        break;
      case 'bump':
        this.tone(110, 0.14, 'sine', 0.3 * vol, 0, 60);
        break;
      case 'gasp':
        this.hiss(0.4, 0.25 * vol, 600, 2400, 'bandpass');
        break;
      case 'ding':
        this.tone(880, 0.35, 'sine', 0.2 * vol);
        this.tone(1320, 0.5, 'sine', 0.14 * vol, 0.08);
        break;
      case 'bell':
        this.tone(1568, 0.8, 'sine', 0.16 * vol);
        this.tone(2352, 0.6, 'sine', 0.08 * vol);
        break;
      case 'link':
        this.tone(520, 0.12, 'triangle', 0.15 * vol, 0, 780);
        break;
      case 'womp':
        this.tone(320, 0.35, 'sawtooth', 0.14 * vol, 0, 250);
        this.tone(250, 0.35, 'sawtooth', 0.14 * vol, 0.35, 190);
        this.tone(190, 0.9, 'sawtooth', 0.16 * vol, 0.7, 70);
        break;
      case 'fanfare':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.16 * vol, i * 0.12));
        this.tone(1046, 0.7, 'triangle', 0.16 * vol, 0.5);
        break;
      case 'alarm':
        for (let i = 0; i < 4; i++) this.tone(i % 2 ? 620 : 840, 0.14, 'square', 0.07 * vol, i * 0.16);
        break;
    }
  }

  // ------------------------------------------------------------ müzik

  startMusic(): void {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextBar = this.ctx.currentTime + 0.1;
    this.bar = 0;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }
  stopMusic(): void {
    this.musicOn = false;
    window.clearInterval(this.timer);
  }

  private note(freq: number, t: number, dur: number, vol: number, type: OscillatorType = 'sine'): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private schedule(): void {
    if (!this.ctx || this.muted) {
      if (this.ctx) this.nextBar = Math.max(this.nextBar, this.ctx.currentTime);
      return;
    }
    while (this.nextBar < this.ctx.currentTime + 0.4) {
      if (this.tension) this.chaseBar(this.nextBar);
      else this.waltzBar(this.nextBar);
      this.nextBar += this.tension ? (60 / 150) * 4 : (60 / 100) * 3;
      this.bar++;
    }
  }

  private waltzBar(t: number): void {
    const beat = 60 / 100;
    const hz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
    // Am | E | Am | Dm | F | C | E | Am
    const chords: Array<[number, number[]]> = [
      [45, [57, 60, 64]],
      [40, [56, 59, 64]],
      [45, [57, 60, 64]],
      [38, [57, 62, 65]],
      [41, [57, 60, 65]],
      [36, [55, 60, 64]],
      [40, [56, 59, 64]],
      [45, [57, 60, 64]],
    ];
    const [root, tri] = chords[this.bar % 8]!;
    this.note(hz(root), t, beat * 0.9, 0.16, 'triangle');
    for (const b of [1, 2]) for (const n of tri) this.note(hz(n), t + beat * b, beat * 0.45, 0.045, 'sine');
    // melodi: minör pentatonik rastgele yürüyüş (tekrarlı kalıp)
    const scale = [69, 72, 74, 76, 79, 81, 84];
    const seed = (this.bar * 7 + 3) % 5;
    const idx = [seed + 2, seed + 3, seed + 1][0]!;
    const pat = [idx, idx + 1, idx - 1];
    pat.forEach((p, i) => {
      const m = scale[Math.max(0, Math.min(scale.length - 1, p))]!;
      this.note(hz(m), t + beat * i, beat * 0.9, 0.07, 'sine');
      this.note(hz(m + 12), t + beat * i, beat * 0.5, 0.02, 'sine');
    });
  }

  private chaseBar(t: number): void {
    const beat = 60 / 150;
    const hz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
    const roots = [45, 45, 48, 43];
    const r = roots[this.bar % 4]!;
    for (let i = 0; i < 4; i++) {
      this.note(hz(r), t + beat * i, beat * 0.5, 0.18, 'sawtooth');
      this.note(hz(r + 12), t + beat * i + beat * 0.5, beat * 0.25, 0.07, 'square');
    }
    for (let i = 0; i < 8; i++) {
      if (!this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = this.ctx.createGain();
      const tt = t + (beat / 2) * i;
      g.gain.setValueAtTime(i % 2 ? 0.03 : 0.06, tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
      src.connect(f);
      f.connect(g);
      g.connect(this.musicBus);
      src.start(tt);
      src.stop(tt + 0.06);
    }
  }

  // ------------------------------------------------------------ konuşma

  speak(text: string, pitch = 1, rate = 1): void {
    if (this.muted || !S.settings.tts || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    if (synth.speaking && synth.pending) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'tr-TR';
    const v = this.voices.find((x) => x.lang.toLowerCase().startsWith('tr'));
    if (v) u.voice = v;
    u.pitch = Math.max(0.1, Math.min(2, pitch));
    u.rate = Math.max(0.6, Math.min(1.6, rate));
    u.volume = Math.min(1, S.settings.volume + 0.2);
    synth.speak(u);
  }
}
