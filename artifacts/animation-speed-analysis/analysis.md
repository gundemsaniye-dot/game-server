# Animasyon hız analizi

## Kayıt yöntemi

- Özel atlas QA sayfası Chromium DevTools screencast ile 1280×720 olarak kaydedildi.
- Kayıt akışı yaklaşık 60 ekran karesi/sn verdi; atlanan animasyon pozu olmadı.
- İlk kayıt değişiklikten önce, ikinci kayıt aynı URL ve aynı atlaslarla zamanlama düzeltmesinden sonra alındı.
- Ek olarak gerçek `navStressQa` ve `navCombatQa` savaş sahneleri kaydedildi.

## Kök neden

1. Koşu ve saldırı 16 özgün pozu 30 poz/sn oynatıyordu. Tam döngü yalnızca `16 / 30 = 0,533 sn` sürüyordu.
2. Oyun koşu hızının üstüne ayrı bir hareket ve sınıf çarpanı uyguluyordu. Atlı döngüsü gerçek oyunda yaklaşık `0,461 sn` seviyesine iniyordu.
3. Saldırı çarpanı 0,533 sn’lik klibi daha da hızlandırıyor, görsel hareket cooldown süresinin yalnızca yaklaşık %47–69’unu dolduruyordu. Kalan sürede son kare donuyordu.
4. 16 kare zaten anticipation/strike/recovery hareketini içerdiği halde eski prosedürel açı ve ileri sıçrama kodu da çalışıyordu. İki bağımsız hareket üst üste gelerek seğirme oluşturuyordu.

## Uygulanan model

- Temel koşu ve saldırı örnekleme hızı 20 poz/sn oldu. Bu hız 60 Hz ekranda her poza tam üç yenileme verir.
- Koşu döngüsü, birimin gerçek dünya hareket hızına göre dar bir `0,78–1,16` aralığında ölçekleniyor.
- Saldırı döngüsü etkili cooldown süresinin %92’sini dolduruyor; güvenli sınırlar `620–1280 ms`.
- Eski prosedürel saldırı açısı ve ileri sıçrama kaldırıldı; yalnızca üretilmiş 16 karelik hareket kullanılıyor.

## Oyun içi döngü süreleri

| Birim | Koşu önce | Koşu sonra | Saldırı önce | Saldırı sonra |
|---|---:|---:|---:|---:|
| Köylü | 834 ms | 1026 ms | 702 ms | 1104 ms |
| Kılıçlı | 679 ms | 800 ms | 502 ms | 745 ms |
| Okçu | 723 ms | 983 ms | 695 ms | 1030 ms |
| Atlı | 461 ms | 690 ms | 620 ms | 920 ms |
| Uzun mızraklı | 685 ms | 819 ms | 558 ms | 828 ms |
| Gürzlü muhafız | 685 ms | 1026 ms | 651 ms | 966 ms |
| Büyücü | 723 ms | 1012 ms | 702 ms | 1280 ms |
| Bıçak fırlatıcı | 642 ms | 717 ms | 471 ms | 699 ms |

## Ölçüm sonucu

- Düzeltilmiş özel URL: ortalama `59,86 FPS`, p95 `17,6 ms`, p99 `17,7 ms`.
- 8 oyuncu + 8 düşman atlasında koşu ve saldırı için 16/16 benzersiz kare doğrulandı.
- Tüm hareket karelerinde taban çizgisi sapması `0 px`.
- Gerçek `navStressQa`: 591 kare / 9,95 sn, konsol hatası yok.
- Gerçek `navCombatQa`: 1188 kare / 19,99 sn, konsol hatası yok.

## Video dosyaları

- `before/before-fast-animation.mp4`: hızlı davranışın ilk kaydı.
- `after/after-natural-animation.mp4`: aynı atlas izleyicisinin düzeltilmiş kaydı.
- `before-after-comparison.mp4`: koşu ve saldırı önce/sonra yan yana.
- `after/gameplay-natural-animation.mp4`: sekiz birimli gerçek koşu sahnesi.
- `after/combat-gameplay-natural-animation.mp4`: gerçek koşu ve çatışma sahnesi.
