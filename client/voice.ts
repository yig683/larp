// Oyun içi sesli sohbet: sunucu üzerinden sinyalleşen, tam bağlı (mesh) WebRTC.
// Mikrofon yoksa/izin verilmezse "yalnızca dinleme" modunda çalışır. Her şey isteğe bağlıdır:
// ses bozulursa oyun etkilenmez (Discord yedeği her zaman vardır).

import type { C2S, IceServerCfg, PlayerInfo, RtcSignal } from '../shared/protocol';
import { voiceMix } from '../shared/voice';

export type VoiceStatus = 'off' | 'starting' | 'on' | 'listen' | 'unsupported' | 'error';
export type PeerState = 'connecting' | 'connected' | 'failed';

export interface VoiceEnv {
  send(m: C2S): void;
  me(): number;
  players(): PlayerInfo[];
  playing(): boolean;
  /** Oyuncunun yığını (-1 = seyirci/bilinmiyor). */
  stackOf(pid: number): number;
  /** Oyuncunun (Kont ya da çaylak olarak) dünya konumu. */
  posOf(pid: number): { x: number; z: number } | null;
  onChange(): void;
}

interface Peer {
  id: number;
  vs: number;
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  state: PeerState;
  failTimer: number | undefined;
  restarts: number;
  /** Sinyaller sırayla işlenir (aday, açıklamadan önce işlenmesin). */
  queue: Promise<void>;
  // ses grafiği
  el?: HTMLAudioElement;
  src?: MediaStreamAudioSourceNode;
  filter?: BiquadFilterNode;
  gain?: GainNode;
  analyser?: AnalyserNode;
  buf?: Float32Array<ArrayBuffer>;
  level: number;
  speakUntil: number;
  curGain: number;
  curCut: number;
}

const SPEAK_RMS = 0.012;

export class Voice {
  status: VoiceStatus = 'off';
  note = '';
  muted = false;
  volume = 1;
  mode: 0 | 1 | 2 = 0;
  vs = 0;
  private ctx: AudioContext | null = null;
  private ice: RTCIceServer[] = [];
  private mic: MediaStream | null = null;
  private micTrack: MediaStreamTrack | null = null;
  private micAn: AnalyserNode | null = null;
  private micBuf: Float32Array<ArrayBuffer> | null = null;
  private micSpeakUntil = 0;
  private micAsked = false;
  private peers = new Map<number, Peer>();
  private timer: number | undefined;

  constructor(private env: VoiceEnv) {}

  static supported(): boolean {
    return typeof RTCPeerConnection !== 'undefined' && typeof AudioContext !== 'undefined';
  }

  /** Kullanıcı etkileşimi içinde çağır: ses bağlamını hazırlar. */
  prepare(): void {
    if (!Voice.supported()) return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      const resume = (): void => {
        if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
      };
      document.addEventListener('pointerdown', resume);
      document.addEventListener('keydown', resume);
    }
    void this.ctx.resume().catch(() => undefined);
  }

  /** Sesli sohbeti başlat (yeni oturum). Mikrofon izni yalnızca ilk seferde istenir. */
  async start(ice: IceServerCfg[] | undefined, wantMic = true): Promise<void> {
    if (!Voice.supported()) {
      this.set('unsupported', 'Bu tarayıcı sesli sohbeti desteklemiyor.');
      return;
    }
    this.prepare();
    this.stopPeers();
    this.ice = (ice ?? []).map((s) => ({ urls: s.urls, username: s.username, credential: s.credential }));
    this.vs = 1 + Math.floor(Math.random() * 1_000_000_000);
    this.set('starting', '');
    if (wantMic && !this.mic && (!this.micAsked || !this.micTrack)) await this.openMic();
    this.mode = this.micTrack ? 2 : 1;
    this.applyMute();
    this.set(this.micTrack ? 'on' : 'listen', this.micTrack ? '' : this.note || 'Mikrofon yok: yalnızca dinliyorsun.');
    this.env.send({ t: 'voice', mode: this.mode, vs: this.vs });
    if (this.timer === undefined) this.timer = window.setInterval(() => this.update(performance.now()), 100);
    this.sync();
  }

  stop(): void {
    this.stopPeers();
    this.mode = 0;
    this.env.send({ t: 'voice', mode: 0, vs: 0 });
    this.set('off', '');
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.mic = null;
    this.micTrack = null;
    this.micAn = null;
    this.micAsked = false;
  }

  private async openMic(): Promise<void> {
    this.micAsked = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.note = window.isSecureContext ? 'Mikrofon API yok: yalnızca dinliyorsun.' : 'Mikrofon için güvenli bağlantı (https) gerekir: yalnızca dinliyorsun.';
      return;
    }
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        video: false,
      });
      this.micTrack = this.mic.getAudioTracks()[0] ?? null;
      if (this.ctx && this.micTrack) {
        const src = this.ctx.createMediaStreamSource(new MediaStream([this.micTrack]));
        this.micAn = this.ctx.createAnalyser();
        this.micAn.fftSize = 512;
        this.micBuf = new Float32Array(this.micAn.fftSize);
        src.connect(this.micAn); // hoparlöre bağlanmaz: kendi sesini duymazsın
      }
      this.note = '';
    } catch (e) {
      const name = (e as DOMException).name;
      this.note = name === 'NotAllowedError' ? 'Mikrofon izni verilmedi: yalnızca dinliyorsun.' : 'Mikrofon bulunamadı: yalnızca dinliyorsun.';
      this.mic = null;
      this.micTrack = null;
    }
  }

  private set(s: VoiceStatus, note: string): void {
    this.status = s;
    this.note = note;
    this.env.onChange();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.applyMute();
    this.env.onChange();
  }
  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMute();
    this.env.onChange();
  }
  private applyMute(): void {
    if (this.micTrack) this.micTrack.enabled = !this.muted;
  }

  // ---------------------------------------------------------------- bağlantı yönetimi

  /** Oyuncu listesi değişti: istenen eşleri bağla, gerekmeyenleri kapat. */
  sync(): void {
    if (this.mode === 0) return;
    const me = this.env.me();
    const want = new Map<number, PlayerInfo>();
    for (const p of this.env.players()) {
      if (p.id === me || !p.connected || p.voice === 0) continue;
      if (this.mode === 1 && p.voice === 1) continue; // ikisi de yalnızca dinliyor
      want.set(p.id, p);
    }
    for (const [id, peer] of Array.from(this.peers)) {
      const p = want.get(id);
      if (!p || p.vs !== peer.vs) this.closePeer(id);
    }
    for (const [id, p] of want) if (!this.peers.has(id)) this.openPeer(id, p.vs);
    this.env.onChange();
  }

  private openPeer(id: number, remoteVs: number): Peer | null {
    if (!this.ctx) return null;
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const peer: Peer = {
      id,
      vs: remoteVs,
      pc,
      polite: this.env.me() > id,
      makingOffer: false,
      ignoreOffer: false,
      state: 'connecting',
      failTimer: undefined,
      restarts: 0,
      queue: Promise.resolve(),
      level: 0,
      speakUntil: 0,
      curGain: 0,
      curCut: 16000,
    };
    this.peers.set(id, peer);
    if (this.micTrack && this.mic) pc.addTrack(this.micTrack, this.mic);
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.onicecandidate = (e) => {
      const c = e.candidate?.toJSON();
      this.signal(id, { vs: this.vs, cand: c && c.candidate !== undefined ? { candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null, usernameFragment: c.usernameFragment ?? null } : null });
    };
    pc.onnegotiationneeded = () => {
      void (async () => {
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          if (pc.localDescription) this.signal(id, { vs: this.vs, desc: { type: pc.localDescription.type as 'offer', sdp: pc.localDescription.sdp } });
        } catch {
          /* yoksay: sonraki müzakerede düzelir */
        } finally {
          peer.makingOffer = false;
        }
      })();
    };
    pc.ontrack = (e) => this.attach(peer, e.streams[0] ?? new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      window.clearTimeout(peer.failTimer);
      if (st === 'connected') peer.state = 'connected';
      else if (st === 'failed') {
        peer.state = 'failed';
        if (peer.restarts < 2) {
          peer.restarts++;
          try {
            pc.restartIce();
          } catch {
            /* yoksay */
          }
        }
      } else if (st === 'disconnected') {
        // kısa kopuşlar kendiliğinden düzelir; uzarsa ICE'ı yeniden başlat
        peer.failTimer = window.setTimeout(() => {
          if (pc.connectionState === 'disconnected' && peer.restarts < 2) {
            peer.restarts++;
            try {
              pc.restartIce();
            } catch {
              /* yoksay */
            }
          }
        }, 4000);
      } else peer.state = 'connecting';
      this.env.onChange();
    };
    return peer;
  }

  private closePeer(id: number): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    window.clearTimeout(peer.failTimer);
    peer.pc.onicecandidate = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    try {
      peer.pc.close();
    } catch {
      /* yoksay */
    }
    try {
      peer.src?.disconnect();
      peer.filter?.disconnect();
      peer.gain?.disconnect();
    } catch {
      /* yoksay */
    }
    if (peer.el) {
      peer.el.srcObject = null;
      peer.el.remove();
    }
  }

  private stopPeers(): void {
    for (const id of Array.from(this.peers.keys())) this.closePeer(id);
  }

  private attach(peer: Peer, stream: MediaStream): void {
    const ctx = this.ctx;
    if (!ctx || peer.src) return;
    // Chrome: uzak WebRTC akışı, bir ortam öğesine bağlanmadıkça WebAudio'ya ses vermeyebilir.
    const el = document.createElement('audio');
    el.srcObject = stream;
    el.muted = true;
    el.autoplay = true;
    void el.play().catch(() => undefined);
    peer.el = el;
    const src = ctx.createMediaStreamSource(stream);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 16000;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.connect(an); // konuşuyor mu? (mesafeden bağımsız)
    peer.src = src;
    peer.filter = filter;
    peer.gain = gain;
    peer.analyser = an;
    peer.buf = new Float32Array(an.fftSize);
    this.env.onChange();
  }

  // ---------------------------------------------------------------- sinyalleşme

  private signal(to: number, d: RtcSignal): void {
    this.env.send({ t: 'rtc', to, d });
  }

  /** Sunucudan gelen WebRTC sinyali. */
  onSignal(from: number, d: RtcSignal): void {
    if (this.mode === 0) return;
    let peer = this.peers.get(from);
    const info = this.env.players().find((p) => p.id === from);
    if (!peer || (d.vs && peer.vs !== d.vs)) {
      // bilinmeyen/yenilenmiş oturum: yalnızca sunucunun doğruladığı (voice>0) eşlere izin ver
      if (!info || info.voice === 0 || info.vs !== d.vs) return;
      if (peer) this.closePeer(from);
      peer = this.openPeer(from, info.vs) ?? undefined;
    }
    if (!peer) return;
    const p = peer;
    p.queue = p.queue.then(() => this.handle(p, d));
  }

  private async handle(peer: Peer, d: RtcSignal): Promise<void> {
    const pc = peer.pc;
    try {
      if (d.desc) {
        const desc = { type: d.desc.type, sdp: d.desc.sdp } as RTCSessionDescriptionInit;
        const collision = desc.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(desc);
        if (desc.type === 'offer') {
          await pc.setLocalDescription();
          if (pc.localDescription) this.signal(peer.id, { vs: this.vs, desc: { type: pc.localDescription.type as 'answer', sdp: pc.localDescription.sdp } });
        }
      } else if (d.cand !== undefined) {
        try {
          await pc.addIceCandidate(d.cand ?? undefined);
        } catch (e) {
          if (!peer.ignoreOffer) throw e;
        }
      }
    } catch {
      /* bozuk/eski sinyal: yoksay */
    }
  }

  // ---------------------------------------------------------------- karıştırma

  /** ~10 Hz: kimi ne kadar duyduğumuzu hesapla, konuşanları algıla. */
  update(nowMs: number): void {
    if (this.mode === 0 || !this.ctx) return;
    const ctx = this.ctx;
    const playing = this.env.playing();
    const me = this.env.me();
    const meStack = this.env.stackOf(me);
    const mePos = this.env.posOf(me);
    for (const peer of this.peers.values()) {
      if (peer.analyser && peer.buf) {
        peer.analyser.getFloatTimeDomainData(peer.buf);
        let s = 0;
        for (let i = 0; i < peer.buf.length; i++) s += peer.buf[i]! * peer.buf[i]!;
        peer.level = Math.sqrt(s / peer.buf.length);
        if (peer.level > SPEAK_RMS) peer.speakUntil = nowMs + 350;
      }
      if (!peer.gain || !peer.filter) continue;
      const peerStack = this.env.stackOf(peer.id);
      const pp = this.env.posOf(peer.id);
      const dist = mePos && pp ? Math.hypot(mePos.x - pp.x, mePos.z - pp.z) : null;
      const mix = voiceMix({ playing, meStack, peerStack, dist });
      peer.curGain = mix.gain;
      peer.curCut = mix.cutoff;
      peer.gain.gain.setTargetAtTime(mix.gain * this.volume, ctx.currentTime, 0.06);
      peer.filter.frequency.setTargetAtTime(mix.cutoff, ctx.currentTime, 0.1);
    }
    if (this.micAn && this.micBuf) {
      this.micAn.getFloatTimeDomainData(this.micBuf);
      let s = 0;
      for (let i = 0; i < this.micBuf.length; i++) s += this.micBuf[i]! * this.micBuf[i]!;
      if (Math.sqrt(s / this.micBuf.length) > SPEAK_RMS && !this.muted) this.micSpeakUntil = nowMs + 350;
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1.5, v));
  }

  // ---------------------------------------------------------------- arayüz için

  isSpeaking(pid: number, nowMs = performance.now()): boolean {
    if (pid === this.env.me()) return this.mode === 2 && !this.muted && nowMs < this.micSpeakUntil;
    const p = this.peers.get(pid);
    return !!p && nowMs < p.speakUntil;
  }

  peerState(pid: number): PeerState | null {
    return this.peers.get(pid)?.state ?? null;
  }

  /** Bağlı (ses akan) eş sayısı. */
  connectedCount(): number {
    let n = 0;
    for (const p of this.peers.values()) if (p.state === 'connected') n++;
    return n;
  }
  failedCount(): number {
    let n = 0;
    for (const p of this.peers.values()) if (p.state === 'failed') n++;
    return n;
  }

  /** Test/ayıklama: eşlerin durumu. */
  debug(): Array<{ id: number; state: PeerState; gain: number; cutoff: number; level: number; hasAudio: boolean; sig: string; ice: string; conn: string; polite: boolean; vs: number }> {
    return Array.from(this.peers.values()).map((p) => ({
      id: p.id,
      state: p.state,
      gain: p.curGain,
      cutoff: p.curCut,
      level: p.level,
      hasAudio: !!p.analyser,
      sig: p.pc.signalingState,
      ice: p.pc.iceConnectionState,
      conn: p.pc.connectionState,
      polite: p.polite,
      vs: p.vs,
    }));
  }
}
