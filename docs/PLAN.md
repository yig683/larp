# Geliştirme planı, riskler ve yol haritası

## Teknoloji seçimi (ve neden)

| Karar | Seçim | Neden |
|---|---|---|
| Platform | **Tarayıcı** (TypeScript + Three.js) | 8 arkadaşın hiçbir şey kurmadan bir bağlantıya tıklayarak girmesi; güncellemenin ev sahibinde bir kez yapılması; WebRTC/ses için doğal zemin. Godot de değerlendirildi (iki motor da sandbox'ta test edilebilirdi) ama kurulum/güncelleme sürtünmesi 8 kişi için ağır basıyor. |
| Fizik | **Rapier** (WASM), yalnızca sunucuda | Deterministik gerekmez; otoriter sunucu hile/senkron derdini ortadan kaldırır. Node'da ölçülen adım ≈0,7 ms (254 gövde). |
| Ağ | Düz **WebSocket**: 20 Hz ikili delta snapshot + JSON olaylar | Basit, her tünelle çalışır. Delta + 2 sn anahtar kare; tam snapshot 8 istemciye en kötü ~5 Mbit/sn, delta ile ölçülen ~50–70 kbit/sn/istemci. |
| Bağlantı | `cloudflared` quick tunnel | Hesapsız, port açmadan `https://…trycloudflare.com`; WebSocket destekler. Yedek: LAN adresi, Tailscale/Radmin, ngrok. |
| Ses (konuşma) | İlk sürüm: **Discord'da iki kanal** | Oyun içi ses ayrı bir risk kalemi; "palto içi / dışı" sesi sonraki adım. |
| Asset | Hepsi **prosedürel** | Lisans/indirme derdi yok; kaba low-poly zaten üslup. |
| Test | vitest + 8 gerçek WebSocket botu + başsız Chromium | "Ben oynayamıyorum" kısıtını aşmak: mantık/ağ/akış otomatik doğrulanır; **his** ise sizin testinizle ve F8/oturum raporuyla kalibre edilir. |

## Aşamalar

| Aşama | İçerik | Durum |
|---|---|---|
| **M0** İskele | Monorepo, ortak çekirdek (matematik, protokol, ayar tablosu), Salon seviyesi, yol bulma | ✅ |
| **M0** Sunucu | HTTP+WS, oda/lobi/faz makinesi, 60 Hz otoriter döngü, botlar | ✅ |
| **M0** İstemci | Three.js sahne, 4 rol kamerası, girdi (imleç kilidi), HUD, ağ + enterpolasyon, başsız ekran görüntüsü | ✅ |
| **M1** Çekirdek oynanış | Eller (PD fizik), tutma, kaşık/çorba (slosh), ağız, söylem çarkı, Şüphe | ✅ |
| **M2** Patlama | Palto patlaması, çaylak kovalamacası (A* muhafızlar), kurtarma, yeniden yığılma | ✅ |
| **M3** Skeçler ve gece | Karşılama, Akşam Yemeği, Vals; rol kaydırma; Sosyete Gazetesi; oturum raporu | ✅ |
| **M4** Ses/cila/dağıtım | Sentez sesleri + müzik + TTS; başlatıcı + tünel; dokümanlar; CI | ✅ (ilk sürüm) |
| **M5** *İlk gerçek test turu* | Sizin 8 kişilik denemeniz → his ayarları (F8) → rapor | ⏭ sıradaki |

## Doğrulama (ne otomatik, ne insan)

**Otomatik (her `npm test`, ~15 sn):**
* Ortak çekirdek: matematik, protokol kodlama, rol atama/dönüşüm, yol bulma, söylem tabloları, gövde kinematiği.
* Başsız simülasyonlar: yemek sahnesinde kaşığı alıp çorbaya daldırıp ağza götürmek (uçtan uca), nazik taşıma ↔ sert sallama dökülme farkı, masaya yürüyüp durma, palto patlaması → çaylak → yeniden yığılma, muhafız yakalaması, tokat, reverans.
* Ağ: 8 gerçek WebSocket botu ile lobi → 2×4 rol dağılımı → 20 Hz snapshot → yeniden bağlanma (aynı kimlik/rol) → üç sahne → gazete + rapor; ev sahibi olmayan ayar/başlatma yapamaz; sürüm uyuşmazlığı reddedilir.
* Tünel yardımcısı: sahte `cloudflared` ile adres ayrıştırma, hata/zaman aşımı yolları.

**Tarayıcıda (elle çalıştırılır: `npm run shots -- shots solo|full8`):** menü, lobi, brifing, her rol kamerası, patlama/çaylak ekranı gerçek istemciyle başsız Chromium'da çizilir ve konsol hataları toplanır.

**Yalnızca sizin yapabileceğiniz:** el hissi, komiklik, tempo, tünel gecikmesi, okunabilirlik. Bunlar için `F8` canlı ayar paneli ve oturum raporu var.

## Risk kaydı

| Risk | Olasılık | Etki | Önlem / durum |
|---|---|---|---|
| Kör el kontrolü sinir bozucu/kaygan hissettirir | Orta | Yüksek | Tüm sayılar canlı ayarlanır (`handKp/Kd`, `assist`, `spillThreshold`…); varsayılanlar bilerek "affedici" |
| Tünel gecikmesi / kopma (ev sahibinin internetine bağlı) | Orta | Yüksek | İstemci 110 ms enterpolasyon gecikmesi, kendi elleri 35 ms; otomatik yeniden bağlanma (aynı `sid`); LAN/Tailscale yedeği |
| Tarayıcı performansı zayıf dizüstülerde | Orta | Orta | Kalite ön ayarları (Düşük/Orta/Yüksek), malzemeye göre birleştirilmiş statik geometri; sağ üstte fps/ping göstergesi |
| Cloudflare quick tunnel kısıtı/kapanması | Düşük–Orta | Yüksek | `--no-tunnel` + LAN; README'de alternatifler |
| Tarayıcı TTS'in Türkçe ses içermemesi | Orta | Düşük | Balonlar her zaman gösterilir; ses isteğe bağlı |
| Fizik patlaması (NaN/uçan eşya) | Düşük | Orta | Hız/kuvvet kıskaçları, girdi doğrulama (NaN/aralık), sahne dışına düşen eşyanın yeniden doğması, simülasyon testleri |
| Oyun "bir gece sonra" sıkar | Orta | Orta | Skeç sayısı artırılabilir (aşağıda); roller kaydığı için aynı skeç farklı hissettirir |

## Sonraki adımlar (öncelik sırasıyla — test sonuçlarına göre değişir)

1. **Gerçek test turu sonrası ayar:** el hissi, Şüphe temposu, süreler.
2. **Oyun içi ses (WebRTC):** "palto içi" (kendi Kont) ve "palto dışı" (yakındaki herkes, mesafeye göre) ayrımı; Discord ihtiyacını ortadan kaldırır.
3. **Daha fazla skeç:** müzayede (kaşınan burun = yanlışlıkla 2 milyonluk teklif), ev sahibinin kasası, yedi çeşit yemek (çorbadan sonra balık, şarap, tatlı).
4. **Kişilik Kartları ve gizli Hırs:** her geceye rastgele bir kimlik ("vegan, karides alerjisi") ve her role gizli bir hedef (Eller: 3 karides çal) → takım hedefiyle çatışma.
5. **Kozmetik ilerleme:** gazete "prestij"i ile açılan şapka/monokl/bıyık.
6. **Gece sonu 4 bakış açılı tekrar:** Bacaklar yalnızca ayakkabı görürken Kafa paniklerken yan yana oynat.
7. **Batan gemi mutator'ı:** zeminin eğimi (saklanan fikir), "servet = ağırlık" eşya mutator'ı.
