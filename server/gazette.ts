// Gece sonu "Sosyete Gazetesi": olay günlüğünden otomatik manşet, haberler, ödül ve ilanlar.

import { STACK_NAMES } from '../shared/constants';
import { ADS, WEATHER } from '../shared/phrases';
import type { Gazette, GazetteStory, SceneResult } from '../shared/protocol';
import type { Rng } from '../shared/rng';
import type { StoryEvent } from './game';

const LIQ: Record<string, string> = { soup: 'ÇORBA', wine: 'ŞARAP' };
const liq = (b?: string): string => LIQ[b ?? ''] ?? 'SIVI';

type Tpl = (e: StoryEvent, who: string) => { head: string; body: string };

const TPL: Record<string, Tpl[]> = {
  burst: [
    (e, who) => ({
      head: `${who.toUpperCase()} TRENÇKOTUNU PATLATTI: İÇİNDEN İNSAN ÇIKTI!`,
      body: `Sosyetenin gözü önünde ${who} dikişlerinden ayrıldı (${e.n ?? 1}. kez). Görgü tanıkları "Ses hep dört kişiydi" diyor.`,
    }),
    (e, who) => ({
      head: `PALTO PATLADI! ${who.toUpperCase()} ÇOKLUK ÇIKTI`,
      body: `Güvenlik görevlileri ellerinde bir paltoyla kalakaldı. ${who} "Ben tek kişiyim" savunmasında ısrarcı.`,
    }),
  ],
  spillNpc: [
    (e, who) => ({
      head: `${(e.a ?? 'MİSAFİR').toUpperCase()} ÜZERİNE ${liq(e.b)} DÖKÜLDÜ!`,
      body: `${who}, iddiaya göre "yanlışlıkla" ${e.a ?? 'bir misafirin'} üzerine boşalttı. Elbise Paris'ten gelmişti, ${liq(e.b).toLowerCase()} ise mutfaktan.`,
    }),
  ],
  slap: [
    (e, who) => ({
      head: `SKANDAL: ${who.toUpperCase()} ${(e.a ?? 'BİR MİSAFİR').toUpperCase()}'A TOKAT ATTI`,
      body: `Salon buz kesti. ${who} "Ellerim bana ait değildi" diyerek savunma yaptı; mahkeme Kafa'nın ifadesini bekliyor.`,
    }),
  ],
  face: [
    (e, who) => ({
      head: `${who.toUpperCase()} ELİNİ ${(e.a ?? 'BİR MİSAFİRİN').toUpperCase()}'IN YÜZÜNE GÖTÜRDÜ`,
      body: 'Görgü kuralları kitabında bu hareketin adı yok. Hukuk uzmanları şaşkın, Kafa daha da şaşkın.',
    }),
  ],
  bump: [
    (e, who) => ({
      head: `${(e.a ?? 'BİR MİSAFİR').toUpperCase()}, ${who.toUpperCase()}'YLA ÇARPIŞTI`,
      body: 'Bacaklar yola, Kafa ise sohbete odaklıydı. İkisi aynı yönü seçmedi.',
    }),
  ],
  shatter: [
    (_e, who) => ({
      head: 'KADEH KIRILDI, ŞEREFE YARIM KALDI',
      body: `Parçalar ${who} tarafında bulundu. Süpürgeci "Her gece aynı hikâye" dedi.`,
    }),
  ],
  crash: [
    (e, who) => ({
      head: `SALONDA GÜRÜLTÜ: ${(e.a ?? 'BİR ŞEY').toUpperCase()} DÜŞTÜ`,
      body: `Misafirler birbirine baktı, sonra ${who}'e baktı. Kimse bir şey demedi; bu daha kötüydü.`,
    }),
  ],
  poor: [
    (e, who) => ({
      head: `${who.toUpperCase()}: "${(e.b ?? '').replace(/[?.!]+$/, '').toUpperCase()}" DİYE SORDU, SALON DONDU`,
      body: `${e.a ?? 'Bir misafir'} "Böyle bir soylu ömrümde görmedim" dedi. Soylu mu, onu kimse bilmiyor.`,
    }),
  ],
  offtopic: [
    (e, who) => ({
      head: `${who.toUpperCase()} SORUYU YANLIŞ ANLADI`,
      body: `${e.a ?? 'Düşes'} bir şey sordu; ${who} başka bir şey cevapladı. İletişim kazası gala sonrasında da konuşulacak.`,
    }),
  ],
  silent: [
    (e, who) => ({
      head: `${who.toUpperCase()} ${(e.a ?? 'DÜŞES')}'İN SORUSUNU CEVAPSIZ BIRAKTI`,
      body: 'Sessizlik bir cevaptır dediler; salonda kimse buna inanmadı.',
    }),
  ],
  correct: [
    (e, who) => ({
      head: `${who.toUpperCase()} ${(e.a ?? 'DÜŞES')}'İ BÜYÜLEDİ`,
      body: `"${e.b ?? ''}" cümlesiyle salonu eritti. Kafa'nın bu akşamki en parlak anı.`,
    }),
  ],
  toast: [
    (_e, who) => ({
      head: `ŞEREFE! ${who.toUpperCase()} KADEHİ KALDIRDI`,
      body: 'Kadeh havadaydı; içindeki şarap çoktan yarı yarıya aşağıdaydı. Şerefe yine de içildi.',
    }),
  ],
  greetFail: [
    (e, who) => ({
      head: `${(e.a ?? 'BİR MİSAFİR').toUpperCase()} SELAMSIZ KALDI`,
      body: `${who} yanlış selamla (${e.b === 'hand' ? 'el sıkış' : e.b === 'hat' ? 'şapka' : 'reverans'}) bir misafiri kırdı. Halı bile utandı.`,
    }),
  ],
  greetOk: [
    (e, who) => ({
      head: `${who.toUpperCase()} ${(e.a ?? 'MİSAFİR')}'İ BÜYÜLEDİ`,
      body: 'Doğru selam, doğru anda, doğru elde. Bu akşam böyle şeyler pek yaşanmadı.',
    }),
  ],
  host: [
    (_e, who) => ({
      head: `${who.toUpperCase()} EV SAHİBİNE ULAŞTI`,
      body: 'Baron von Altın reverans karşısında gözlerini sildi. Bir misafir de kaçmadı; küçük zafer.',
    }),
  ],
  caught: [
    (e, who) => ({
      head: `${(e.a ?? 'BİR ÇAYLAK').toUpperCase()} GÜVENLİĞE YAKALANDI`,
      body: `${who} yığınından kopan çaylak bir güvenlik görevlisinin kollarında bulundu. Üzerinde bir çift pantolon vardı.`,
    }),
  ],
  rescued: [
    (e, who) => ({
      head: `${(e.a ?? 'ÇAYLAK').toUpperCase()} KURTARILDI: TAKIM RUHU!`,
      body: `${who} arkadaşını güvenliğin elinden aldı. Bu hikâye bir şatafatlı destana dönüşebilir.`,
    }),
  ],
  restack: [
    (_e, who) => ({
      head: `TRENÇKOT YENİDEN YIĞILDI: ${who.toUpperCase()} AYAKTA`,
      body: 'Dört kişi, tek palto, sıfır utanç. Sosyete bu manzaraya alışık değil ama alışacak.',
    }),
  ],
  failedStack: [
    (_e, who) => ({
      head: `${who.toUpperCase()} TAMAMEN REZİL OLDU`,
      body: 'Ne palto kaldı ne de itibar. Soylular bir an için sessiz kaldı, sonra yemeğe devam etti.',
    }),
  ],
  waltzDone: [
    (_e, _who) => ({
      head: 'VALS BİTTİ, PİST HÂLÂ AYAKTA',
      body: 'İki tur, iki Kont, sekiz el. Müzik kutusu "bitti" diyene kadar kimse durmadı.',
    }),
  ],
  unlink: [
    (_e, who) => ({
      head: 'ELLER AYRILDI: VALS YARIM KALDI',
      body: `${who} partnerinin elini bıraktı. Piyanist notayı kaçırdı, dansçılar dikkatle kaçındı.`,
    }),
  ],
  garble: [
    (_e, who) => ({
      head: `${who.toUpperCase()} AĞZI DOLU KONUŞTU`,
      body: 'Anlaşılan bir şey yok; ama bir şey söylendiği kesin. Düşes kaşlarını çattı.',
    }),
  ],
};

const PHOTO_KINDS = new Set(['burst', 'spillNpc', 'slap', 'shatter', 'toast', 'caught', 'face', 'bump', 'crash', 'rescued', 'restack', 'waltzDone']);

export function makeGazette(story: StoryEvent[], results: SceneResult[], rng: Rng, issue: number, stackCount: number): Gazette {
  const name = (s: number): string => STACK_NAMES[s] ?? `Yığın ${s + 1}`;
  // En ağır hikâyeler, tür çeşitliliğiyle
  const sorted = story.filter((e) => TPL[e.kind]).sort((a, b) => b.w - a.w || a.t - b.t);
  const picked: StoryEvent[] = [];
  const perKind = new Map<string, number>();
  for (const e of sorted) {
    const n = perKind.get(e.kind) ?? 0;
    if (n >= 1) continue;
    perKind.set(e.kind, n + 1);
    picked.push(e);
    if (picked.length >= 6) break;
  }
  const stories: GazetteStory[] = picked.map((e) => {
    const tpls = TPL[e.kind]!;
    const t = tpls[rng.int(tpls.length)]!(e, name(Math.max(0, e.stack)));
    return { head: t.head, body: t.body, kind: e.kind, stack: e.stack, photo: PHOTO_KINDS.has(e.kind) ? e.kind : undefined };
  });
  const headline: GazetteStory =
    stories.shift() ??
    ({ head: 'SESSİZ BİR GECE: HİÇBİR ŞEY OLMADI (ŞÜPHELİ)', body: 'Sosyete bu kadar sakin bir gecenin altında bir şey olduğunu düşünüyor.', kind: 'quiet', stack: 0 } as GazetteStory);

  // Skorlar
  const totals = new Map<number, { score: number; bursts: number; peak: number }>();
  for (let s = 0; s < stackCount; s++) totals.set(s, { score: 0, bursts: 0, peak: 0 });
  for (const r of results) {
    for (const st of r.stacks) {
      const t = totals.get(st.stack) ?? { score: 0, bursts: 0, peak: 0 };
      t.score += st.score;
      t.bursts += st.bursts;
      t.peak = Math.max(t.peak, st.peak);
      totals.set(st.stack, t);
    }
  }
  const scores = Array.from(totals.entries()).map(([stack, t]) => ({ stack, name: name(stack), score: t.score, bursts: t.bursts, peak: t.peak }));
  const winner = scores.length ? scores.slice().sort((a, b) => b.score - a.score)[0]!.stack : 0;
  const worst = scores.slice().sort((a, b) => b.bursts - a.bursts || b.peak - a.peak)[0];
  const award =
    scores.length > 1 && worst
      ? { title: 'GECENİN REZİLİ', text: `${worst.name}: ${worst.bursts} patlama, tepe Şüphe %${worst.peak}. Kupa kendisinindir (kupa de çatlak).` }
      : { title: 'GECENİN SOYLUSU', text: `${scores[0]?.name ?? 'Kont'}: ${scores[0]?.bursts ?? 0} patlama, tepe Şüphe %${scores[0]?.peak ?? 0}. Kendi kendine şerefe içti.` };

  const adPool = rng.shuffle(ADS).slice(0, 3);
  const date = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    issue,
    date,
    headline,
    stories: stories.slice(0, 4),
    award,
    weather: WEATHER[rng.int(WEATHER.length)]!,
    ads: adPool,
    scores,
    winner,
  };
}
