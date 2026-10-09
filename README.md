# 🎩 Trençkot Kontu

**8 kişilik, tarayıcıda oynanan, kaotik bir "friendslop" co-op oyunu.**
İki ekip (4'er kişi) birer devasa trençkotun içinde üst üste biner: biriniz *Bacaklar*, biriniz *Sol El*, biriniz *Sağ El*, biriniz *Kafa*.
Hepiniz aynı Kont'u oynuyorsunuz ama herkes dünyayı başka bir pencereden görüyor. Amaç: sosyetede **zengin ve kültürlü** görünmek (LARP!). Palto patlarsa sosyete sizi dışarı atar.

Geceyi üç skeç oluşturur: **Karşılama → Akşam Yemeği → Vals**. Gece sonunda "Sosyete Gazetesi" olanları yazar.

> Oyun tamamen kodla üretilir: ses, müzik, doku, model… Harici dosya indirmezsiniz.

---

## 🚀 Ev sahibi için kurulum (bir kez, ~5 dk)

Sadece **ev sahibi** (oyunu açan kişi) kurar. Arkadaşlar yalnızca bir bağlantıya tıklar.

1. **Node.js LTS** kurun → <https://nodejs.org> ("LTS" yazan yeşil düğme). Kurulumda her şeye "İleri" demek yeter.
2. Oyunu indirin. İki yoldan biri:
   - **Git ile** (güncellemek kolay olur): <https://git-scm.com> kurun, sonra bir klasörde terminal açıp
     ```
     git clone -b claude/kind-brahmagupta-u8o3h1 https://github.com/yig683/larp.git
     cd larp
     ```
   - **ZIP ile**: GitHub'da `claude/kind-brahmagupta-u8o3h1` dalından *Code → Download ZIP*, klasöre çıkarın.
3. **Windows:** `baslat.bat` dosyasına çift tıklayın.
   **macOS / Linux:** terminalde `./baslat.sh`.

   İlk açılışta bağımlılıkları (1–2 dk) ve internet tüneli aracını (`cloudflared`, ~40 MB) kendisi indirir.
   Windows güvenlik duvarı sorarsa **"Erişime izin ver"** deyin.
4. Tarayıcınız açılır → adınızı yazıp **Salona gir**. Terminalde ve lobide gördüğünüz `https://….trycloudflare.com` adresini arkadaşlara gönderin.
5. 8 kişi toplanınca (en az 1, en çok 12 kişi; fazlası seyirci olur) **Geceyi Başlat**.

Güncelleme: `guncelle.bat` / `./guncelle.sh` (ya da elle `git pull`). Oyun istemcisi bir sonraki başlatmada otomatik yeniden derlenir.

### Arkadaşlar için
Bağlantıya tıkla → adını yaz → **Salona gir**. Chrome/Edge/Firefox yeterli. Kurulum yok. Fare + klavye gerekir (telefon desteklenmez).

### Sesli konuşma
Önerilen yol: Discord/benzeri kullanın (oyun içi ses henüz **deneysel**, giriş ekranındaki "🎤 Oyun içi sesli sohbet" kutusuyla açılır; mikrofon için `https` tünel adresi gerekir): **her Kont için ayrı sesli kanal açın** (ör. "Gustavo" ve "Paloma"). Kendi Kont'unuzun içindekilerle konuşmak oyunun kalbi; rakip Kont sizi duymayınca "palto içi" gizliliği doğar. Karşı kanala bilerek kulak misafiri olmak serbest ve eğlencelidir.

---

## 🎮 Nasıl oynanır

Her gece başında roller karışık dağıtılır; **her skeçte roller bir kaydırılır** (herkes her rolü dener). Ekranın sol altında rolünüzün tuşları yazar (`H` ile gizleyin).

| Rol | Ne görürsün | Kontroller |
|---|---|---|
| **Bacaklar** | Sadece yer seviyesi | `W A S D` yürü · `Fare` dön · `Shift` koş · `Boşluk` reverans |
| **Eller** (Sol / Sağ) | Dar bir göğüs kamerası | `Fare` eli oynat · `W/S` ya da tekerlek: eli ileri-geri · `Sol tık` basılı: **tut** · `Sağ tık`: **tokat** (dikkat!) |
| **Kafa** | Her şey, ama dokunamaz | `Fare` bak · `Sol tık` basılı: **ağzı aç** · `Q` basılı: **söylem çarkı** (fareyle seç, bırak) |

Birden çok rolü olan oyuncu (az kişiyle oynarken ya da tek başına deneme) `Tab` ile roller arasında geçer; iki eli de yöneten oyuncu `Q` / `E` / `R` ile sol / sağ / ikisi birden seçer.
Diğer tuşlar: `Esc` fareyi serbest bırakır · `M` sesi kapatır · `H` ipuçlarını gizler · `F8` canlı ayar paneli · `F9` oturum raporu.

### Üç skeç
1. **Karşılama** — Kırmızı halıda ilerleyin. Her misafir farklı bir selam ister: el sıkış, şapka selamı ya da reverans. *Kafa* selamı okur ve söyler, *Bacaklar* reverans yapar, *Eller* tokalaşır. En az 3 misafiri karşılayıp ev sahibine reverans yapın.
2. **Akşam Yemeği** — Eller kör: ağzın nerede olduğunu **Kafa** tarif eder ("biraz sola… yukarı… DUR!"). Çorbayı kaşıkla taşıyın ve **dökmeden** ağza götürün. Düşes soru sorar; *Kafa* söylem çarkından doğru cevabı seçsin. Sonunda şerefe!
3. **Vals** — İki Kont el ele tutuşup pistte iki tur döner. Dansçılara çarpmayın.

### Şüphe ve palto patlaması
Her Kont'un bir **Şüphe** barı var. Çorba dökmek, masaya ya da misafirlere çarpmak, bir misafirin yüzüne dokunmak ya da ona tokat atmak, yanlış cevap vermek ve söylem çarkındaki "kötü" cümleleri (*"Bedava mı bu?"*, *"Şunlardan poşete koyabilir miyim?"*) fakir olduğunuzu ele verir ve Şüphe'yi artırır. Ama rezilliği **görecek biri** (misafir ya da muhafız) yakında değilse artış dörtte birine düşer. Kibar davranışlar (doğru selam, uygun cevap, şerefe) Şüphe'yi azaltır.
Bar **%100** olunca **palto patlar**: herkes küçük bir **Çaylak** olur ve muhafızlar sizi kovalar. Tüm çaylaklar paltoya geri dönüp `E`'ye basılı tutarak **yeniden yığılır**. Muhafızın yakaladığı arkadaşınızı yanına gidip `E`'ye basılı tutarak kurtarın (kurtarmazsanız 10 sn sonra bırakılır, ama geç kalırsınız). Yeniden yığılmak için herkesin serbest olması gerekir. Bir skeçte 3 kez patlayan Kont "tamamen rezil olur" ve o skeçi kaybeder.

### Gece sonu
Gazete: gece boyunca olanlardan (patlamalar, dökülen çorbalar, atılan tokatlar, kırılan kadehler, çarpışmalar, doğru yapılan selamlar…) otomatik üretilen komik manşetler, puan tablosu, ilanlar ve bazı haberler için oyundan alınmış bir fotoğraf.
"Oturum raporunu kopyala" düğmesi (ya da `F9`) arkadaş grubunun hislerini sayıya çeviren bir özet verir; geliştiriciye göndermek içindir.

---

## 🛠 Sorun giderme

| Sorun | Çözüm |
|---|---|
| "Node.js bulunamadı" | <https://nodejs.org> LTS kurup `baslat.bat`'ı yeniden açın. |
| Tünel kurulamadı | Şirket/okul ağlarında engellenebilir. Aynı Wi‑Fi'dekiler terminalde yazan `http://192.168…` adresini kullanır. Uzaktakiler için Tailscale / Radmin VPN ya da `ngrok http 3000` olur. |
| Arkadaş bağlanamıyor | Bağlantının tamamını (`https://` ile) gönderdiniz mi? Tünel adresi yayılması ~30 sn sürebilir. Ev sahibinin oyunu açık kalmalı. |
| Takılıyor (FPS düşük) | ⚙ Ayarlar → **Kalite: Düşük**. Sağ üstte fps / ping / snapshot sayısı görünür. |
| "Sürüm uyuşmuyor" | Sayfayı yenileyin (`Ctrl+F5`). Ev sahibi oyunu güncellediyse herkes yenilemeli. |
| Fare kilitlenmiyor | Sahneye bir kez tıklayın. `Esc` kilidi açar. |
| Ses yok | Tarayıcılar ilk tıklamadan sonra ses verir. `M` ile açık olduğundan emin olun. |

Bant genişliği: oyuncu başına yaklaşık **50–70 kbit/sn** iner. 8 botla ölçülen, ev sahibinin 7 uzak oyuncuya yüklediği toplam **~0,35–0,5 Mbit/sn** (gerçek insanlar daha hareketli olur, 1 Mbit/sn altı beklenir). Asıl önemli olan ev sahibinin bağlantısının **kararlı** olması: mümkünse Wi‑Fi yerine kabloyla bağlanın.

---

## 💬 Geri bildirim nasıl verilir
* Oynarken **`F8`** (ev sahibi): fizik/his sayılarını canlı oynatın (el sertliği, dökülme eşiği, Şüphe çarpanı…). Değişiklikler herkese yansır ve `tuning.local.json`'a kaydolur.
* Gece sonunda **oturum raporu**ndaki sayıları ve "burası eğlenceliydi / sinir bozdu" notlarınızı paylaşın.
* Değiştirmek istediğiniz bir şey varsa nasıl hissettirdiğini yazmanız yeter ("kaşık çok kaygan", "Vals sıkıcı") — sayıyı ben ayarlarım.

---

## 👩‍💻 Geliştirici notları

```
npm start            # derle + sunucu + tünel + tarayıcı (baslat.bat/sh bunu çağırır)
npm start -- --no-tunnel --port 4000
npm run dev          # Vite (5173) — ayrı terminalde `npm run server` (3000)
npm test             # vitest: birim + tüm gece 8 gerçek WebSocket botuyla
npm run typecheck
npm run bots -- 7    # çalışan sunucuya 7 bot sok (tek başına deneme)
npm run shots -- shots solo   # başsız Chromium ile ekran görüntüleri
```

* **Mimari**: Node (otoriter sunucu, 60 Hz Rapier fiziği) ⇄ WebSocket (20 Hz ikili delta snapshot + JSON olaylar) ⇄ Three.js istemcisi (enterpolasyon). Ayrıntı: [`docs/GDD.md`](docs/GDD.md), plan ve riskler: [`docs/PLAN.md`](docs/PLAN.md).
* `shared/` hem sunucu hem istemci tarafından kullanılır (gövde kinematiği, protokol, söylem tabloları).
* Tüm görsel/ses kodla üretilir (`client/textures.ts`, `client/meshes.ts`, `client/audio.ts`).
* Hata ayıklama: sayfaya `?debug` ekleyin → `window.__tk` (durum, girdi, dünya).

Sürüm bilgisi derleme sırasında `git` hash'inden alınır; sunucu ve istemci farklıysa bağlantı reddedilir.
