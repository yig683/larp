# Devam notu (yerel sohbet için) — Trençkot Kontu

> Bu dosya, bulut oturumu bittiği için işi **yerel Claude Code sohbetine** devretmek içindir.
> Önce bunu, sonra `README.md`, `docs/GDD.md`, `docs/PLAN.md` dosyalarını oku.

## 0. Kısa durum

* **Oyun çalışır ve oynanabilir durumda; her şey `claude/kind-brahmagupta-u8o3h1` dalına push'lı** (repo: `yig683/larp`). PR açılmadı, açma (kullanıcı istemedi).
* Kullanıcı Türkçe konuşur ve **"kalan hiçbir şeyi bana sorma, yaratıcılığına bırakıyorum"** dedi. Soru sorma; karar ver, yap, sonra nedenini kısaca açıkla.
* Kullanıcı oyunu bizzat oynayıp **hissi** test edecek (biz oynayamıyoruz). Otomatik testler mantığı/ağı/akışı doğrular, "eğlenceli mi?" sorusunu doğrulamaz.
* Kalan tek yarım iş: **oyun içi sesli sohbet (WebRTC)** — kodu yazıldı, bir hata var (aşağıda). Varsayılan **kapalı** (deneysel); kapalıyken oyunun geri kalanını etkilemez.

## 1. Proje özeti (2 cümle)

8 kişilik (2 yığın × 4 kişi) tarayıcıda oynanan co-op "friendslop": her yığın tek bir devasa trençkot "Kont"u (Bacaklar, Sol El, Sağ El, Kafa) yönetir; her rol dünyayı farklı görür. Gece = 3 skeç (Karşılama → Akşam Yemeği → Vals), sonunda otomatik "Sosyete Gazetesi". Şüphe %100 → palto patlar, oyuncular çaylak olup yeniden yığılır.

## 2. Yerelde başlama

```
git clone -b claude/kind-brahmagupta-u8o3h1 https://github.com/yig683/larp.git
cd larp
npm install
npm test          # 57 test: birim + başsız simülasyon + 8 gerçek WebSocket botu (~15 sn)
npm run typecheck
npm start         # derle + sunucu + cloudflared tüneli + tarayıcı (baslat.bat / baslat.sh de aynı)
```

Gerekenler: Node.js ≥ 20, Git. Oyuncular yalnızca bağlantıya tıklar (Chrome/Edge).

Faydalı araçlar (hepsi `npm run <ad>`; hepsi önce `npm run build` ister):

| Komut | Ne yapar |
|---|---|
| `npm run e2e` | 4 gerçek Chromium sayfası + 4 bot, gerçek klavye/fare; 21 kontrol (rol girdileri, sayfa yenileme, patlama→yığılma) |
| `npm run tour -- <klasör>` | Tek kişilik servo ile tüm sahneleri/ekranları gezip ekran görüntüsü alır |
| `npm run overview -- <klasör>` | İki Kont'u dışarıdan gösteren sabit kamera görüntüleri (`S.debugCam`) |
| `npm run shots -- <klasör> solo\|full8` | Menü/lobi/brifing/rol kamerası görüntüleri |
| `npm run bots -- 7` | Çalışan sunucuya 7 bot sok (tek başına deneme) |
| `npm run voice` | Ses sohbeti uçtan uca testi (sahte mikrofon) — **şu an 7/12 geçiyor, bkz. §4** |

Başsız ortamda `?debug` parametresi `window.__tk` kancasını açar (durum, girdi, dünya, ses).

## 3. Bitenler (hepsi test edilmiş ve push'lı)

* Sunucu: otoriter 60 Hz Rapier fiziği, 20 Hz ikili delta snapshot, lobi/faz makinesi, yeniden bağlanma (`sid`), canlı ayar paneli (F8) + `tuning.local.json`, oturum raporu, gazete üretici.
* Oynanış: kör besleme (kaşık/çorba/slosh), söylem çarkı, Şüphe (tanık kuralı), palto patlaması → çaylak → muhafız (A*) → kurtarma → yeniden yığılma, 3 skeç, rol kaydırma.
* İstemci: Three.js prosedürel low-poly sahne, 4 rol kamerası, imleç kilidi girdisi, HUD, brifing/sonuç/gazete, WebAudio sentez + müzik + TTS, fotoğraf yakalama.
* Dağıtım: `baslat.bat/.sh`, `tools/start.ts` (+ `tools/tunnel.ts`: cloudflared otomatik indirme, quick tunnel), `guncelle.*`, GitHub Actions CI (typecheck + test + build).
* Ölçümler: 8 botla gece boyu ~0,35–0,5 Mbit/sn toplam yükleme; 14 dk gerçek zamanlı soak testinde tick ort. ~1 ms, bellek kararlı, hata yok.
* Bu oturumda düzeltilen hatalar: ad kutusuna yazarken M/H/V kısayollarının tetiklenmesi, gazete ekranının üstünün kesilmesi, Eller kamerasında palto/şapka görünmesi, vals eşinden Şüphe cezası, tokatın düşük fps'te kaçması.

## 4. YARIM KALAN İŞ: oyun içi sesli sohbet (WebRTC)

**Neden:** Bu türde (Lethal Company, R.E.P.O.) yakınlık sesi çok önemli; Discord'a bağımlılığı azaltır. İsteğe bağlıdır, bozulursa oyun etkilenmez.

**Yazılanlar (hepsi bu dalda):**
* `shared/protocol.ts`: `PlayerInfo.voice (0|1|2)` + `vs`, `RtcSignal`, C2S `voice`/`rtc`, S2C `rtc`, `welcome.ice`. `PROTOCOL_VERSION` = **2**.
* `server/room.ts`: `voice` durumu, `relayRtc` (yalnızca hedefe, temizlenmiş zarf, hız sınırı); `server/index.ts`: `iceFromEnv()` (varsayılan herkese açık STUN; TURN için `TURN_URL/TURN_USER/TURN_PASS` ya da `TK_ICE` JSON).
* `shared/voice.ts`: `voiceMix()` kuralları — oyun dışında herkes herkesi tam duyar; oyunda **aynı yığın her zaman tam**, rakip yığın **mesafeyle** (≤3 m net, 14 m'de sessiz, uzaklaştıkça boğuk); seyirci oyunculara konuşamaz.
* `client/voice.ts`: mesh WebRTC, "perfect negotiation", WebAudio grafiği (kazanç + alçak geçiren filtre), konuşuyor algısı, `V` ile sustur. UI: menü onay kutusu, lobi ses kutusu, HUD çubuğu, oyuncu adı yanında 🎤/🔊/🎧/⚠ simgeleri.
* Testler: `tests/net-voice.test.ts` (sinyal aktarımı; geçiyor), `tools/voice-e2e.ts` (gerçek tarayıcı).

**Son `npm run voice` sonucu (7/12):** mikrofon açıldı ✔, WebRTC bağlantıları kuruldu ama **bir çift eksik** (Ev=2, Ali=1, Veli=1 bağlı; yani Ali↔Veli kurulamadı), ses seviyesi bazı sayfalarda ölçüldü (0,15 ve 0,41) ama Ev sayfasında ~0,001, oyun içi kazanç kuralları ✔ (rakip yığın @6 m → 0,62), V ile susturma ✔. Başarısız: tam bağlantı, "bip duyuluyor" (Ev), "susturma kalkınca ses geri", "sayfa yenilenince yeniden bağlanma" (büyük olasılıkla aynı kök neden).

**Teşhis varsayımları (sırayla kontrol et):**
1. *Offer çıkmazı:* İki taraf farklı anlarda PC açıyor; "nazik olmayan" (düşük id) taraf, henüz hazır olmayan eşe giden ilk offer'ı kaybedip sonra gelen karşı offer'ı **yok sayıyorsa** (`ignoreOffer`) iki taraf da takılır. Çözüm fikri: eşin `voice>0` + `vs` bilgisi sunucudan doğrulanmadan PC açma (zaten böyle) ama ayrıca *her iki taraf da yalnızca düşük id olan offer atsın* (yüksek id sadece cevaplasın; `onnegotiationneeded`'ı yüksek id tarafında bastır) — glare tamamen ortadan kalkar.
2. `onSignal` içindeki `peer.vs !== d.vs` koşulu PC'yi gereksiz kapatıp yeniden açıyor olabilir (log ekle).
3. Ev sayfasındaki düşük seviye: `AudioContext` durumu (`T.voice` içindeki `ctx.state`), analizörün `ontrack`'ten önce/sonra bağlanması, sahte mikrofonun bip aralığı (örnekleme kaçırıyor olabilir; bip sürekli değil).
4. Ayıklama için `Voice.debug()` çıktısına `pc.signalingState / iceConnectionState / connectionState / polite / vs` alanlarını ekle (yarım kalan düzenleme buydu) ve `npm run voice` çıktısında takılan çiftin durumuna bak.

**Gerçek ağda ayrıca doğrulanacak (sandbox'ta yapılamaz):** farklı evlerdeki NAT'lar. Bazı çiftler TURN olmadan bağlanamayabilir → arayüz zaten `⚠` gösterip Discord'a yönlendiriyor. Gerekirse TURN ekle (`TURN_URL` vb., README'ye yaz). Mikrofon yalnızca `https` (tünel) veya `localhost`'ta çalışır; LAN `http://192.168…` ile çalışmaz (UI bunu söylüyor).

**Karar:** Hata düzelene kadar `S.settings.voice` varsayılanı **false** (menüde "deneysel" onay kutusu). Düzelip gerçek ağda denendikten sonra `client/state.ts` içindeki varsayılanı `true` yap ve README'deki "Sesli konuşma" bölümünü güncelle.

## 5. Sıradaki adımlar (öncelik sırasıyla)

1. §4'teki hatayı düzelt → `npm run voice` 12/12 olsun → `npm test` + `npm run e2e` yeşil kalsın.
2. README + `docs/GDD.md` + `docs/PLAN.md` içinde oyun içi sesi anlat (şu an README yalnızca "Discord'da iki kanal" diyor; deneysel seçeneği de yaz).
3. Kullanıcıya **final raporu** yaz (Türkçe, bu formatta): `[Aşama adı] / Yapılanlar / Nasıl çalıştırılır / Nasıl test edilir: neyi denemeliyim, ne hissetmeliyim / Bana sorular: karar için geri bildirim istediğim noktalar / Aklıma gelenler`. "Bana sorular" bölümünü **engelleyici soru değil, test sırasında gözlenecek geri bildirim noktaları** olarak yaz. İçine mutlaka: kurulum (Node.js LTS + Git), ilk denenecekler (kör kaşık besleme hissi; 8 arkadaşla tünel bağlantısı), yükleme hızı notu (~0,5 Mbit/sn ölçüldü; ev sahibi kabloluysa daha iyi), F8 canlı ayar ve oturum raporu (F9/gazete ekranı) ile geri bildirim yolu.
4. Gerçek oyun testinden gelecek his ayarları (F8 değerleri): `handKp/Kd`, `assist`, `spillThreshold`, `suspMult`, `guardCount/guardSpeed`, `timeMult`.
5. Backlog fikirleri (`docs/PLAN.md` sonunda): müzayede skeci, daha çok yemek çeşidi, Kişilik Kartları + gizli Hırs, kozmetik ilerleme, 4 bakış açılı gece sonu tekrarı, eğimli zemin/ "servet = ağırlık" mutator'ları.

## 6. Çalışma kuralları (devam ederken)

* Dal: `claude/kind-brahmagupta-u8o3h1`. Push: `git push -u origin claude/kind-brahmagupta-u8o3h1`. **PR açma** (istenmedi).
* Commit mesajı sonuna şu satırlar: `Co-Authored-By: Claude <noreply@anthropic.com>` ve (bulut oturumundaysan) `Claude-Session: …`. Repoya/commit'e **model adı/sürümü yazma**.
* Koordinatlar: Y yukarı, model ileri = −Z; `fwd(yaw) = (−sin yaw, −cos yaw)`; `yawTo = atan2(−dx, −dz)`. Gövde kinematiği `shared/body.ts` (sunucu+istemci ortak).
* Her değişiklikten önce/sonra: `npm run typecheck && npm test`. Görsel/girdi değişiklikleri için `npm run build && npm run e2e` (ve gerekirse `tour`/`overview` ekran görüntüleri).
* Başsız SwiftShader ortamı yavaştır; testlerde sabit `sleep` yerine yoklama (`until`) kullan.
* Dosya haritası: `shared/` (ortak çekirdek), `server/` (oyun + oda + sahneler `server/scenes/`), `client/` (Three.js istemci), `tools/` (başlatıcı, botlar, ekran görüntüsü/e2e araçları), `tests/`, `docs/`.
