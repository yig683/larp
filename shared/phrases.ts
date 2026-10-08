// Oyunun yazılı içeriği: Kafa'nın söylem çarkı cümleleri, NPC soruları ve tepki replikleri.
// "kötü" etiketli cümleler, fakirliğin ağızdan kaçtığı anlardır: çarkta bilerek tuzak gibi bulunurlar.

export type PhraseTag = 'selam' | 'övgü' | 'şarap' | 'sanat' | 'servet' | 'aile' | 'yemek' | 'hava' | 'garip' | 'kötü';

export interface Phrase {
  id: number;
  tag: PhraseTag;
  text: string;
}

const RAW: Array<[PhraseTag, string[]]> = [
  [
    'selam',
    [
      'Memnun oldum. Boyum uzun, soyum daha uzun.',
      'Selamlar! Bölgenin en yüksek soylusu buyurun.',
      'Şeref duydum, Madam; şeref de bana yakışıyor.',
      'Ellerinizden öperim; ellerim şu an meşgul olsa da.',
      'Hoş geldiniz demeyi unutmuşum: hoş bulduk!',
      'Hizmetinizdeyiz... yani hizmetinizdeyim.',
    ],
  ],
  [
    'övgü',
    [
      'Bu salonun tavanı bütçemden bile yüksek.',
      'Avizeniz o kadar parlak ki gözlüğüm eridi. (Gözlüğüm yok.)',
      'Zevkiniz o kadar rafine ki süzgeçten geçmiş.',
      'Şapkanız, Madam... bir kuş olsa cıvıldardı.',
      'Elbiseniz öyle güzel ki gözlerim dans ediyor.',
      'Burası o kadar şık ki ayakkabılarım utandı.',
    ],
  ],
  [
    'şarap',
    [
      'Bu şarapta meşe, deri ve hafif bir pişmanlık var.',
      'Bağbozumu 1887... ya da dün, fark etmez.',
      'Kadehi üç kez çevirdim; dördüncüde içilir.',
      'Bu tam bir "terroir". Yani şarap. Yani... şarap.',
      'Şarap bekletilir; ben de bu akşam bekletildim.',
    ],
  ],
  [
    'sanat',
    [
      'Şu tablonun fırça darbeleri tam bir borsa grafiği.',
      'Rönesans mı? Hayır, Rönesans benden küçük.',
      'Bu heykelin gövdesi eksik ama fikri tam.',
      'Sanat ruhun çorbasıdır. (Çorba şu an elimde.)',
      'Picasso kuzenimdi; bir gözü bende kaldı.',
    ],
  ],
  [
    'servet',
    [
      'Param o kadar çok ki saymak yerine tartıyorum.',
      'Yatımın küçük botu bile bir yat.',
      'Altın benim için sıradan; ben platin ağlarım.',
      'Cüzdanım yok; cüzdanım bir banka.',
      'Zenginlik göreceli: ben görece çok zenginim.',
    ],
  ],
  [
    'aile',
    [
      'Büyük dedem bir şatoydu; babam ise bahçe.',
      'Soyumuz Orta Çağ\'a gider; geri dönüşü yok.',
      'Annem düşesti; babam düşüş.',
      'Ailemizde herkes uzun boyludur... üst üste.',
      'Amcam bir kontluk kurdu, ben de ona katıldım.',
    ],
  ],
  [
    'yemek',
    [
      'Çorba bu akşam oldukça... sıvı.',
      'Ekmek, mutfağın şiiridir.',
      'Hamsi hariç her şeyi yerim. (Hamsi yok, değil mi?)',
      'Peynir bir sanat; ben de peynir sanatçısıyım.',
      'Yemekten önce dua, yemekten sonra rapor.',
    ],
  ],
  [
    'hava',
    [
      'Hava bugün tam Kuzey Fransa... ama Ankara\'da.',
      'Bu akşam bulutlar bile smokin giymiş.',
      'Yarın yağmur bekliyorum; bilet aldım.',
      'Rüzgâr saçımı bozuyor; saçım yok ama bozuluyor.',
      'Ay bu gece de parlak, tıpkı benim gibi.',
    ],
  ],
  [
    'garip',
    [
      'Kediler bizi izliyor, Madam.',
      'Sol elim bu akşam başka bir yerde.',
      'Bence bir ayağım diğerini tanımıyor.',
      'Ben tek kişiyim, sadece geniş bir tek kişiyim.',
      'Sesimin üç boyutlu olduğunu fark ettiniz mi?',
      'Pantolonum bu akşam kendi kararlarını veriyor.',
    ],
  ],
  [
    'kötü',
    [
      'Abi harbi mi ya?',
      'Bedava mı bu?',
      'Hesabı kim ödüyor?',
      'Şunlardan poşete koyabilir miyim?',
      'Burada indirim var mı?',
      'Wifi şifresi ne acaba?',
      'Bunun kaç para olduğunu sorabilir miyim?',
      'Valla ben de ilk kez görüyorum bunları.',
    ],
  ],
];

export const PHRASES: Phrase[] = [];
for (const [tag, list] of RAW) for (const text of list) PHRASES.push({ id: PHRASES.length, tag, text });

export const phraseById = (id: number): Phrase | undefined => PHRASES[id];
export const phrasesByTag = (tag: PhraseTag): Phrase[] => PHRASES.filter((p) => p.tag === tag);

export interface Question {
  tag: PhraseTag;
  /** {unvan} -> Kont / Kontes */
  text: string;
}

export const QUESTIONS: Question[] = [
  { tag: 'şarap', text: 'Şarap konusunda ne düşünürsünüz, {unvan}?' },
  { tag: 'sanat', text: 'Sanatla aranız nasıldır, {unvan}?' },
  { tag: 'aile', text: 'Soyunuz nereye dayanır, {unvan}?' },
  { tag: 'servet', text: 'Bunca serveti nasıl biriktirdiniz?' },
  { tag: 'yemek', text: 'Bu akşamki yemeği nasıl buldunuz?' },
  { tag: 'hava', text: 'Bu havaya ne dersiniz, {unvan}?' },
  { tag: 'övgü', text: 'Salonumuz hoşunuza gitti mi?' },
  { tag: 'övgü', text: 'Şu şapkama ne dersiniz, {unvan}?' },
  { tag: 'selam', text: 'Tanışmış mıydık? Adınız neydi?' },
  { tag: 'garip', text: 'Boyunuz bugün... biraz değişken, {unvan}?' },
  { tag: 'garip', text: 'Sesiniz neden dört kişi gibi çıkıyor?' },
];

export const titleOf = (stack: number): string => (stack === 0 ? 'Kont' : 'Kontes');
export const fmt = (text: string, stack: number): string => text.replace(/\{unvan\}/g, titleOf(stack));

export type LineKind = 'spill' | 'bump' | 'burst' | 'good' | 'bad' | 'suspicious' | 'thanks' | 'fail' | 'slap' | 'toast' | 'hello' | 'crash';

export const NPC_LINES: Record<LineKind, string[]> = {
  spill: ['Aman Tanrım! Bu elbise Paris\'ten!', 'Bu... çorba mıydı?!', 'Sıcak! Hem de pahalıydı!', 'Üzerime bir şey aktı!'],
  bump: ['Pardon?!', 'Dikkat edin, {unvan}!', 'Bir yerlerde bir masa eksik...', 'Ayağıma bastınız!'],
  burst: ['PALTO... PARÇALANDI!', 'İçinden insan çıktı!', 'Ben bunu hep biliyordum!', 'Güvenlik! GÜVENLİK!'],
  good: ['Ne zarif!', 'Muhteşem!', 'Bravo!', 'Tam bir centilmen!'],
  bad: ['Anlamadım?', 'Tuhaf bir cevap...', 'Ne demek şimdi bu?', 'Hmm. Pek zarif değil.'],
  suspicious: ['Boyunuz biraz değişken, {unvan}...', 'Sesiniz dört kişi gibi.', 'Bu ses nereden geliyor?', 'Siz... gerçekten siz misiniz?'],
  thanks: ['Ne büyük nezaket!', 'Zarafetin kendisi!', 'Bravo, {unvan}!', 'Harikasınız!'],
  fail: ['Hımm. Nezaket nerede?', 'Tuhaf bir {unvan}...', 'Bu pek olmadı.', 'Ayıp!'],
  slap: ['TOKAT MI ATTINIZ?!', 'Bu bir skandal!', 'Edepsiz!', 'Ben bunu unutmam!'],
  toast: ['Şerefe!', 'Şerefinize!', 'Kadehler havaya!', 'Bu gece unutulmayacak!'],
  hello: ['Hoş geldiniz!', 'Ne güzel bir akşam, değil mi?', 'Buyurun, buyurun!'],
  crash: ['Bu ses de neydi?!', 'Bir şey düştü!', 'Kimse bir şey duymadı...'],
};

export type GreetKind = 'hand' | 'hat' | 'bow';
export const GREET_PROMPTS: Record<GreetKind, string> = {
  hand: 'Elinizi sıkabilir miyim, {unvan}?',
  hat: 'Şapkanızı çıkarıp selam verin, {unvan}!',
  bow: 'Reverans, {unvan}, reverans!',
};
export const GREET_HINT: Record<GreetKind, string> = {
  hand: 'EL SIK',
  hat: 'ŞAPKA',
  bow: 'REVERANS',
};

export interface NpcArch {
  id: string;
  name: string;
  /** Hangi etiketleri sever (ödül ağırlığı); şimdilik tepki tonunu belirler. */
  likes: PhraseTag[];
  pitch: number;
  rate: number;
}

export const NPC_ARCHS: NpcArch[] = [
  { id: 'duchess', name: 'Düşes Beatrix', likes: ['sanat', 'övgü'], pitch: 1.5, rate: 0.9 },
  { id: 'colonel', name: 'Albay Kızılcık', likes: ['servet', 'hava'], pitch: 0.5, rate: 0.95 },
  { id: 'madame', name: 'Madam Fifi', likes: ['şarap', 'aile'], pitch: 1.8, rate: 1.05 },
  { id: 'sir', name: 'Sör Reginald', likes: ['yemek', 'şarap'], pitch: 0.8, rate: 0.85 },
  { id: 'critic', name: 'Eleştirmen Cemile', likes: ['sanat', 'garip'], pitch: 1.2, rate: 1.1 },
  { id: 'banker', name: 'Bankacı Kasa', likes: ['servet', 'aile'], pitch: 0.7, rate: 1.0 },
  { id: 'maestro', name: 'Maestro Lorenzo', likes: ['sanat', 'övgü'], pitch: 1.0, rate: 1.0 },
  { id: 'host', name: 'Baron von Altın', likes: ['servet', 'övgü'], pitch: 0.4, rate: 0.8 },
  { id: 'lady', name: 'Leydi Pembe', likes: ['övgü', 'selam'], pitch: 1.6, rate: 1.0 },
];
export const archById = (id: string): NpcArch => NPC_ARCHS.find((a) => a.id === id) ?? NPC_ARCHS[0]!;

export const ADS: string[] = [
  'SATILIK: Kullanılmış trençkot, 4 kişilik, hafif yırtık.',
  'ARANIYOR: Uzun boylu soylu. Boyu kendinden büyük olması şart değil.',
  'KAYIP: Sol el. Son görülme yeri: çorba kasesi. Bulana ekmek.',
  'KİRALIK: Monokl (tek göz için). Pazarlık payı vardır, göz payı yoktur.',
  'DERS: "Çatal, bıçak, huzur." Ücret: peşin, bahşiş: soylu.',
  'DUYURU: Büfedeki kuğu heykeli artık yerinde değil. Soruşturma sürüyor.',
  'İŞ İLANI: Garson aranıyor. Kont dökmesin diye araya girebilecek, çevik.',
  'KAYIP KEDİ: "Madam Fifi" adına cevap verir; soyu Kont\'tan eskidir.',
  'ÖZEL DERS: Şapka selamı, bir saatte hem de iki elle. Ücret: şapka.',
  'ACİL: Pantolon, ayakları üstünde duran bir sahibini arıyor.',
  'BAKIM: Vals öncesi ayak parmağı sigortası yaptırılır.',
  'DEVREN: Kasa dairesi. İçinde elmas yok, ama kasa var, kasa.',
];

export const WEATHER: string[] = [
  'Balo salonunda hafif sağanak çorba, akşama doğru dağınık kahkaha.',
  'Kont\'un omuzlarında yoğun sis; avizeler parçalı bulutlu.',
  'Şüphe basıncı yükseliyor. Palto cephesinde fırtına uyarısı.',
  'Bacaklar bölgesinde ayak ayağa gerilim, ellerde dağınık dolu.',
  'Güneşli bir akşam bekleniyor. (Salonda güneş yok; tahminimiz buydu.)',
];
