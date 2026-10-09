// Sesli sohbet kuralları: kim kimi ne kadar duyar? (saf fonksiyon, testlenebilir)
//
//  - Oyun dışında (lobi, brifing, sonuç, gazete) herkes herkesi tam duyar.
//  - Oyun sırasında AYNI yığındakiler "palto içinde"dir: her zaman tam ve net.
//  - Farklı yığınlar yalnızca YAKINLIKLA duyulur: 3 m'ye kadar net, 14 m'de sessiz; uzaklaştıkça
//    ses boğuklaşır (alçak geçiren filtre), paltonun öbür tarafından geliyormuş gibi.
//  - Seyirciler oyunculara konuşamaz; oyuncuları kısık duyarlar.

export const VOICE_NEAR = 3;
export const VOICE_FAR = 14;
export const VOICE_CLEAR_HZ = 16000;
export const VOICE_MUFFLED_HZ = 600;

export interface VoiceCase {
  /** Oyun fazında mı (playing)? */
  playing: boolean;
  /** Dinleyenin yığını (-1 = seyirci). */
  meStack: number;
  /** Konuşanın yığını (-1 = seyirci). */
  peerStack: number;
  /** İki yığın arası mesafe (m); bilinmiyorsa null. */
  dist: number | null;
}

export interface VoiceMix {
  gain: number;
  cutoff: number;
}

export function voiceMix(c: VoiceCase): VoiceMix {
  const clear: VoiceMix = { gain: 1, cutoff: VOICE_CLEAR_HZ };
  if (!c.playing) return clear;
  if (c.meStack >= 0 && c.peerStack >= 0 && c.meStack === c.peerStack) return clear;
  if (c.meStack >= 0 && c.peerStack < 0) return { gain: 0, cutoff: VOICE_CLEAR_HZ };
  if (c.meStack < 0) return { gain: 0.55, cutoff: VOICE_CLEAR_HZ };
  if (c.dist === null || !Number.isFinite(c.dist)) return { gain: 0.2, cutoff: 1200 };
  if (c.dist <= VOICE_NEAR) return { gain: 1, cutoff: 14000 };
  if (c.dist >= VOICE_FAR) return { gain: 0, cutoff: VOICE_MUFFLED_HZ };
  const t = (c.dist - VOICE_NEAR) / (VOICE_FAR - VOICE_NEAR);
  return { gain: Math.pow(1 - t, 1.5), cutoff: 14000 * Math.pow(VOICE_MUFFLED_HZ / 14000, t) };
}
