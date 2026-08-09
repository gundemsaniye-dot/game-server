# Castle Stormers 20-Level Denge QA Raporu

Tarih: 31 Temmuz 2026

## Sonuç

20 level, gerçek oyun sahnesi doğrudan URL ile açılarak `balanceQa=1`, `qaSpeed=16` ve sabit tohumlarla çalıştırıldı. Son kalibrasyonda 20 levelin tamamı kendi süre hedefi içinde `on_target` sınıfı aldı.

QA botu gerçek oyuncunun yerine geçmez. Bu tur; ekonominin iki tarafta aynı kuralla işlemesini, level konfigürasyonlarının oynanabilir bir eğri üretmesini, aşırı kısa yenilgileri ve 5 dakikalık kilitlenmeleri erken yakalayan sabit tohumlu, hızlandırılmış bir regresyon testidir. Canlı oyunda ilk-deneme kazanma oranı, oduncu ölüm oranı ve deste seçimi ayrıca ölçülmelidir.

## URL şeması

```text
http://localhost:8080/?scene=battle&level=LEVEL&balanceQa=1&qaSpeed=16&seed=SEED
```

## Son ana test matrisi

| Level | Seed | Sonuç | Süre | Hedef | Sınıf |
|---:|---:|---|---:|---:|---|
| 1 | 26073101 | Zafer | 109.6 sn | 55–135 sn | on_target |
| 2 | 26081020 | Zafer | 68.2 sn | 55–135 sn | on_target |
| 3 | 26088939 | Zafer | 88.6 sn | 55–135 sn | on_target |
| 4 | 26096858 | Zafer | 65.2 sn | 55–135 sn | on_target |
| 5 | 26104777 | Zafer | 86.3 sn | 60–145 sn | on_target |
| 6 | 26112696 | Zafer | 93.0 sn | 60–145 sn | on_target |
| 7 | 26120615 | Zafer | 97.9 sn | 60–145 sn | on_target |
| 8 | 26128534 | Zafer | 83.3 sn | 60–145 sn | on_target |
| 9 | 26136453 | Zafer | 122.2 sn | 80–180 sn | on_target |
| 10 | 26144372 | Yenilgi | 94.4 sn | 80–180 sn | on_target |
| 11 | 26152291 | Zafer | 91.1 sn | 80–180 sn | on_target |
| 12 | 26160210 | Yenilgi | 91.0 sn | 80–180 sn | on_target |
| 13 | 26168129 | Yenilgi | 151.0 sn | 85–190 sn | on_target |
| 14 | 26176048 | Zafer | 86.0 sn | 85–190 sn | on_target |
| 15 | 26183967 | Zafer | 189.0 sn | 85–190 sn | on_target |
| 16 | 26191886 | Zafer | 187.1 sn | 85–190 sn | on_target |
| 17 | 26199805 | Yenilgi | 100.7 sn | 90–195 sn | on_target |
| 18 | 26207724 | Yenilgi | 108.0 sn | 90–195 sn | on_target |
| 19 | 26215643 | Yenilgi | 109.7 sn | 90–195 sn | on_target |
| 20 | 26223562 | Yenilgi | 125.0 sn | 90–210 sn | on_target |

Final ayrıca iki farklı tohumla daha test edildi: 96.3 ve 169.0 saniyede yenilgi. Böylece final zor kaldı fakat eski 72 saniyelik üçlü dalga ezmesi giderildi.

## Uygulanan zorluk etmenleri

- İki taraf için aynı başlangıç altını, pasif gelir, oduncu maliyeti, taşıma ve ölümde kaynak kaybı.
- Level ilerledikçe AI karar aralığı, düşman can/hasar çarpanı ve kale canı eğrisi.
- Bölüm bazlı rakip desteleri, seçim ağırlıkları ve karşı-birim çarpanları.
- Oduncu koruma/avlama, gerçek altınla yeniden oduncu üretme ve harita yol mesafeleri.
- Yeni birlik tanıtılan levelde ani stat + dalga yığılmasını engelleyen özel dalga ayarı.
- 140–165. saniyeden sonra iki taraf için aynı, sahadaki ordunun sağlığı ve cephe konumuna bağlı görünür uzatma baskısı.
- Her 15 saniyede banka, kale canı, oduncu/asker sayısı, cephe ve oduncu durum snapshot'ı.
- Maç sonunda yapılandırılmış `BALANCE_RESULT`: süre, sonuç, sınıf, gelir kaynakları, harcama, üretim/kayıp, oduncu ölümleri, taşınırken kaybolan odun ve kale hasarı.

## Castle Raid 2 araştırma özeti

- Castle Raid 2'nin temel zorluğu yalnız altın değildir: açılış hamlesi, oduncuları koruma, rakip oduncusunu kesme, doğru birlik seçimi ve karşı-birim kullanımı sonucu belirler. İlk birkaç haritadan sonra Casual modda bile belirgin şekilde zorlaştığı raporlanmıştır: https://toucharcade.com/?p=146307
- Orijinal oyunda 20 savaş alanı, üç zorluk modu ve dokuz birlik sınıfı tanıtılmıştır: https://www.youtube.com/watch?v=Q_g3kzrcR2Y
- Çince rehber; 2 saniyede 1 temel altın, en fazla 3 oduncu, her üçüncü aynı birimin güçlenmesi ve rakip oduncularını kesmenin önemini anlatır. Final için iyi bir hücumun 1–2 dakikada sonuç verebildiğini, savaş uzadığında baskının büyüdüğünü belirtir: https://www.xp811.com/azgame/185206.html
- Bir başka Çince inceleme, en yakın ormana hızlı oduncu yerleştirme, çoklu üretim, karşı-birimler ve güçlerin doğru hedeflenmesini temel strateji olarak açıklar: https://m.ali213.net/pingce/131216/3980.html
- 20 dakikadan uzun maç için özel başarı vardır; bu, 20 dakikanın normal kampanya hedefinden çok istisnai bir dayanıklılık durumu olduğunu gösterir: https://www.exophase.com/game/castle-raid-2-apple/achievements/
- Genel sektör yaklaşımı sabit bir “her level şu kadar zor” formülü vermez. Eğri tasarlanır; yenilgi nedenleri ve telemetriyle doğrulanır: https://www.gamedeveloper.com/design/gameplay-design-fundamentals-gameplay-progression ve https://pmc.ncbi.nlm.nih.gov/articles/PMC8336693/

Bu araştırmaya göre kampanya hedefi çoğunlukla yaklaşık 1–3 dakika, son bölümde en fazla yaklaşık 3.5 dakika olarak tutuldu. 20 dakika normal hedef değildir.
