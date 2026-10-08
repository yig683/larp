# Trençkot Kontu — Oyun Tasarım Belgesi

> Tek cümle: **Dört arkadaş tek bir trençkotun içinde "Kont" olup dünyanın en lüks galasına sızar; herkes yalnızca kendi parçasının gördüğünü görür.**
> 8 kişiyle: **iki Kont (2 × 4 kişi)** aynı salonda, aynı gecede.

## 1. Tasarım sütunları

1. **Komedi sayıdan değil insandan çıkar.** Kör eller, her şeyi gören ama dokunamayan kafa, yalnızca ayakkabı gören bacaklar → "SOLA DEDİM!" kavgaları. Fizik biraz bozuk olsa bile komedi bozulmaz, çoğu zaman artar.
2. **Kaybetmek de komiktir.** Palto patlayınca oyun bitmez; küçük "çaylak"lara dönüşür, kovalamacayla yeniden yığılırsınız.
3. **Her gece anlatılacak bir hikâye üretir.** Olay günlüğünden otomatik "Sosyete Gazetesi" çıkar; oyun bitince konuşulacak şey zaten yazılmıştır.
4. **Kurulumsuz katılım.** Arkadaşlar yalnızca bir bağlantıya tıklar; ev sahibi tek komutla başlatır.
5. **Her şey kodla üretilir.** Harici asset yok: model, doku, ses, müzik prosedürel (low-poly, düz gölgeli, altın-kadife palet).

## 2. Seçim süreci (kısa)

Değerlendirilip **elenen** fikirler: klasik soylu partisine sızma (Hitman-lite), "içimizde sahte soylu var" (Among Us balosu), Sosyal Tırmanıcılar (PEAK'e fazla yakın), zengin sporları olimpiyatı, sahte fine-dining restoranı, "aranızda doktor var mı?", hayalet balosunda vals-ritim hırsızlığı, LARP tatil köyü, "Bernie'nin Hafta Sonu", batan lüks gemi (eğim + şapka fikri saklandı), düğün baskını / söylenti yayılması, vasiyet yarışı, Anakronizm Canavarı (düşman fikri olarak saklandı), karton Lamborghini kaçışı, "servet = ağırlık" (mutator olarak saklandı), LARP Oyun Yöneticisi.

Üç konsept: **A) Trençkot Kontu** (beden: tek soylu, çok kafadar) · **B) Kadraj Dışı** (mekân: yayında Maldivler, gerçekte garaj) · **C) Soylu Ekspres** (davranış: yolcuların gizli tahammülsüzlükleri).
**A seçildi**: kancası tek cümle, komedisi iletişim kazasından doğduğu için "ben oynayamıyorum" kısıtına dayanıklı, çekirdeği küçük, skeçleri birbirinden bağımsız. 8 kişi tam olarak iki yığın (2 × 4) etti: A için ideal sayı.

## 3. Roller ve algı

| Rol | Gördüğü | Yaptığı | Yapamadığı |
|---|---|---|---|
| **Bacaklar** | Yalnızca yer seviyesi (ayakkabılar, halı, masa ayakları) | Yürür, koşar, döner, reverans yapar | Nereye gittiğini görmez; Kafa'nın sesine güvenir |
| **Sol / Sağ El** | Göğüs hizasında dar bir kamera | Fareyle fiziksel eli sürer, tutar, tokat atar | Yüzü ve ağzı göremez |
| **Kafa** | Her şey | Etrafa bakar, ağzı açar, **söylem çarkı** ile konuşur, yüz ifadesi/ter/kızarma gösterir | Hiçbir şeye dokunamaz |

* Roller **her skeçte bir kaydırılır** (herkes her rolü dener).
* Az kişiyle roller birleşir: 3 kişi → bir oyuncu iki eli; 2 kişi → Beden (bacak+kafa) + Eller; 1 kişi → hepsi (Tab ile geçiş). 9–12 kişi → fazlası seyirci.
* Kısıt kasıtlıdır: **bilgi dağılımı oyunu yapar**. Ağız yönünü yalnızca Kafa bilir, kaşığı yalnızca Eller taşır, adımı yalnızca Bacaklar atar.

## 4. Çekirdek sistemler

### 4.1 Eller ve fizik
Eller, Rapier'de **dinamik toplar**; fare hedefine PD (yay-sönüm) kuvvetiyle çekilir (`handKp`, `handKd`, `handMaxForce`). Böylece sürükler, takılır, masaya çarpar. Tutma yarıçapı içindeki eşya tutulur; tutulan eşya hız kontrolüyle taşınır. Tokat kısa süreli sertleşme darbesidir. Gövde (Kont) kinematik kapsüldür; reverans belden öne eğilmedir ve **kafa/omuz konumunu değiştirir** (sunucu ve istemci aynı `shared/body.ts` formülünü kullanır).

### 4.2 Kör besleme
* Kaşık çorba kasesine daldırılınca dolar (`scoopRate`).
* **Sıvı modeli** ("slosh"): kaşığın eğimi ve ivmesi sönümlü yay olarak simüle edilir; eşik aşılınca sıvı dökülür. Hızlı sallama ayrıca "fırlatma" terimiyle dökülme yaratır (düşük geçiren yay tek başına ani sarsıntıyı kaçırıyordu).
* Dökülen sıvı: palto üzerinde leke, masa, yer veya NPC üstüne düşer; her biri farklı Şüphe/puan ve gazete haberi doğurur.
* Ağız: kaşık ağız yarıçapına (`mouthRadius`) girince ve Kafa ağzı açıkken yenir; küçük bir çekim yardımı (`assist`) vardır.

### 4.3 Şüphe ve palto patlaması
Her Kont'un **Şüphe** barı (0–100). Artıranlar: dökülme, çarpma, yüze dokunma, tokat, yanlış cevap, çarktaki "kötü" cümleler (fakirlik ağızdan kaçar). Azaltanlar: doğru selam, uygun cevap, şerefe, tamamlanan hedef. Şüphe zamanla `suspDecay` ile söner. **Tanık kuralı:** bir yanlışı görecek NPC ya da muhafız `suspRange` içinde yoksa artış **×0,25**'e düşer (kimse görmediyse rezillik değildir); iyi davranışlar her zaman sayılır.
**%100** → **palto patlaması**: Kont konfeti ve paltoya dönüşür, her oyuncu küçük bir **çaylak** olur, 2 **muhafız** (A* yol bulma) çaylakları kovalar. Muhafız yakaladığı çaylağı `catchSeconds` (10 sn) boyunca tutar; yanına giden bir takım arkadaşı `E`'ye ~1,4 sn basılı tutarak onu kurtarır, kurtarılmazsa süre dolunca kendiliğinden bırakılır. **Yeniden yığılma**: tüm çaylaklar serbestken paltonun yanına gelip `E`'yi `restackSeconds` (2,6 sn) basılı tutar. Bir skeçte `maxBursts` (3) patlama → "tamamen rezil oldu": o Kont skeçi kaybeder.

### 4.4 Söylem çarkı
Kafa `Q` basılı tutar, fareyle bir cümle seçer, bırakınca konuşur (sesli: tarayıcı TTS, balon: herkes). Cümleler **etiketlidir** (selam, övgü, şarap, sanat, servet, aile, yemek, hava, garip, **kötü**). NPC bir soru sorar ve beklenen etiketleri vardır; uygun etiket = doğru cevap. "Kötü" etiketli cümleler çarkta bilerek tuzak gibi durur ("Bedava mı bu?", "Hesabı kim ödüyor?").

### 4.5 NPC'ler
Arketipler (Leydi, Albay, Madam, Sör, Eleştirmen, Bankacı, Düşes, Maestro, Baron…) basit durum makineleriyle tepki verir (şok, mutlu, kızgın, konuşma balonu). Tokat/çarpma/dökülme tepkileri ve gazete haberleri buradan gelir.

### 4.6 Puan ve Sosyete Gazetesi
Her hedef puan verir (ör. selam +25/+35, ev sahibi +80, çorba +40, vals +160). Gece sonunda **olay günlüğü** (patlama, dökülme, tokat, çarpışma, kırılma, selam…) ağırlıklı seçilip şablonlarla **manşet + haberler + ilanlar + hava durumu** üretir; uygun haberlere oyundan fotoğraf eklenir. **Oturum raporu** (F9 / "kopyala") skeç sonuçlarını, rolleri, patlama/dökülme sayılarını ve o geceki ayar değerlerini metne döker: his geri bildirimini sayıya bağlar.

## 5. Gece: üç skeç

| # | Skeç | Süre | Hedef (her Kont için) | Kilit ilişki |
|---|---|---|---|---|
| 1 | **Karşılama** | 3:30 | Kırmızı halıda 5 misafirden ≥3'ünü doğru selamla (el sıkış / şapka / reverans); ev sahibine reverans | Kafa selamı okur ve söyler; Eller yapar; Bacaklar eğilir |
| 2 | **Akşam Yemeği** | 5:30 | Çorbadan 5 kaşık, bir ekmek, Düşes'e 2 doğru cevap, "Şerefe" (dolu kadeh yukarı) | Kör besleme; Kafa ağzı tarif eder; Düşes sorar |
| 3 | **Vals** | 4:10 | Eller kenetlenir (iki Kont ya da Düşes), pistte 2 tur dönün | Bacaklar adım atar, eller kenetli; dansçılara çarpmayın |

Her skeç: kısa **brifing** (rol kartı + hedefler) → oyun → **sonuç** → bir sonraki skeçte roller kayar. Gece sonunda gazete. Süreler `timeMult` ile canlı ölçeklenir.

## 6. Salon (sahne)
30 × 22 × 7 m'lik balo salonu: damalı mermer, kırmızı halı ve kordon direkleri, altın dans pisti, sütunlar, avizeler, kadife perdeli pencereler, yağlıboya "eski usta" tabloları (komik içerikli), yemek masası ve kuğu heykeli. Karşılama için halı + kordon, Yemek için uzun masa, Vals için pist öne çıkar.

## 7. Görsel ve ses yönü
* **Sanat**: kaba low-poly, düz gölgeli, canvas ile üretilmiş dokular; altın/kadife/bordo palet; Gustavo = bordo/altın silindir şapka, Paloma = mor/turkuaz tüylü şapka.
* **Ses**: Web Audio ile sentezlenen efektler (kaşık, kırılma, patlama, çan), prosedürel vals ve kovalamaca müziği, NPC/oyuncu konuşmaları için tarayıcı TTS (Türkçe ses varsa).
* **HUD**: sol üst skeç ve hedefler, sağ üst iki Kont'un Şüphe barları, sol alt rolünüzün tuşları, sağ alt "Yığınım" (kim hangi rolde), söylem çarkı fare ile seçilir.

## 8. Teknik özet
* **Sunucu**: Node.js + `ws`; otoriter, **60 Hz** sabit adımlı Rapier (WASM) fiziği; **20 Hz** ikili delta snapshot (2 sn'de bir anahtar kare) + JSON olaylar.
* **İstemci**: TypeScript + Three.js; snapshot enterpolasyonu (0,11 sn gecikme; kendi elleriniz 0,035 sn), DOM tabanlı HUD/etiketler.
* **Bağlantı**: ev sahibi `npm start` → yerel sunucu + `cloudflared` quick tunnel (hesapsız `https://….trycloudflare.com`). Yeniden bağlanma `sid` ile; rol korunur.
* **Doğrulama (ben oynayamadığım için)**: vitest (birim + başsız simülasyonlar + 8 gerçek WebSocket botuyla tam gece), başsız Chromium ile ekran görüntüleri, canlı ayar paneli ve oturum raporu.

## 9. Bilinen riskler / "his" soruları (test edilmesi gerekenler)
1. **Kör el hissi**: kaşığı ağza götürmek eğlenceli-zor mu, sinir bozucu-zor mu? (`handKp`, `handKd`, `assist`, `spillThreshold` ayarlarıyla oynanır.)
2. **Kafa'nın yön tarifi**: yön söylemek kolay mı? Ağız yarıçapı/çekim yardımı yeterli mi?
3. **Tünel gecikmesi**: 8 kişi, farklı evlerden: kayma/enterpolasyon hissi.
4. **Şüphe temposu**: patlamalar çok erken/geç mi? (`suspMult`)
5. **Skeç süreleri**: sıkıcı ya da aceleci mi? (`timeMult`)
6. **Sesli iletişim**: Discord iki kanal + isteğe bağlı çapraz dinleme, oyun içi ses olmadan yeterli mi?
