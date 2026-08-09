# Castle Stormers — Tiled 20 Level Paketi

## Düzenleme standardı — tek kaynak, tek yön

Tiled'de değiştirilecek dosyalar bu klasördedir: `art/tiled/maps/level<number>.tmj`.
Örneğin kampanya **Level 1**, `level_001 → grasslands_01 → maps/level1.tmj`
zincirini kullanır. Eşleştirme yalnızca oyun kuralları için
`src/game/config/levels.config.ts` içinde tanımlıdır; görsel ve navigasyon
verisini değiştirmez.

| Katman | Tiled'de görünümü | Anlamı |
| --- | --- | --- |
| `REFERENCE_ART_PREVIEW` | Tek parça referans görsel | Sadece Tiled düzenleyicisi için arka plan; oyuna gönderilmez. |
| `00_GROUND_BASE` | Phaser uygulama atlası | Oyunda görünen temel harita; Tiled'de gizli kalır. |
| `NAV_BLOCKED` | Yarı saydam kırmızı | Birliklerin asla giremeyeceği su, uçurum, duvar. |
| `05_BRIDGES` | Yarı saydam yeşil | `NAV_BLOCKED` üstündeki geçilebilir köprü/geçit hücreleri. |
| `NAV_COST` | Yarı saydam mavi | Geçilebilir ama yavaş zemin. |

Her navigasyon katmanı artık kendi desen setini kullanır: `NAV_BLOCKED` için
yalnızca **navigation-blocked** (kırmızı), `05_BRIDGES` için yalnızca
**navigation-bridge** (yeşil), `NAV_COST` için **navigation-cost** (üç mavi ton).
Bu renkler yalnızca Tiled düzenleyicisi ve `?navDebug=1` QA
görünümü içindir; normal oyunda referans görselin üzerine çizilmez.

20 seviyenin geçilemez alanları, referans görseller üstündeki 32×18 karelere
tek tek uyarlanmış olarak `tools/lib/tiled-impassable-regions.mjs` içinde
tanımlıdır. `npm run tiled:nav:standardize` bu tanımı ilgili `level1.tmj`–
`level20.tmj` dosyalarına uygular; eski veya başka katmandan karışmış marker'ları
korumaz. Köprü hücreleri kırmızı engelin üstündeki tek geçiş istisnasıdır.

### Ağaç yerleşim kuralı

Kırmızı `NAV_BLOCKED` hücreleri su/uçurum/duvardır; ağaç veya ağaç-kaynak
yerleşemez. Kontrol yalnızca ağacın kök noktasına bakmaz: 48px'lik ayak izi
tamamen kırmızı alanın dışında kalmalıdır. Yeşil `05_BRIDGES` hücresi kırmızıyı
geçersiz kılar; bu nedenle köprü hücresi bu kontrol açısından geçilebilirdir.

`npm run tiled:trees:normalize` tüm `.tmj` haritalarındaki ağaçları ve oyunun
tüm kaynak konumlarını bu kurala göre en yakın güvenli hücreye taşır. Böylece
yeni su/lav/uçurum maskesi bir kaynağın altında kalmaz. `npm run tiled:check`
bu kuralı salt-okunur şekilde de denetler; ihlal varsa build başarısız olur.
Oyun çalışırken de aynı `.tmj` navigasyonundan son bir güvenlik kontrolü yapılır.

Tiled'de referansın tamamını görmek için `REFERENCE_ART_PREVIEW` açık,
`00_GROUND_BASE` kapalı kalmalıdır.

Geliştirme sunucusu açıkken `.tmj` kaydedildiğinde oyun kopyası otomatik
yenilenir. Elle kontrol etmek için proje kökünde `npm run tiled:check` çalıştır.
Bu komut `.tmj`
dosyasını tarayıcının çalışma kopyasına çevirir ve yol, spawn/deploy ve katman
sözleşmesini denetler. Yanlış marker rengi (örneğin `05_BRIDGES` içindeki kırmızı)
artık hata olarak reddedilir. `public/assets/tiled/` çıktı klasörüdür; elle
düzenlenmez.

Bu paket, daha önce hazırlanan 1–5, 6–10, 11–15 ve 16–20 paketlerinin tek proje altında birleştirilmiş ve bağımsız olarak doğrulanmış sürümüdür.

## Teknik yapı

- 20 adet `.tmj` harita
- 32×18 grid, 40×40 tile, 1280×720 dünya boyutu
- Haritaların kullandığı tüm harici `.tsj` tileset dosyaları ve PNG tileset görselleri
- Her harita için 1280×720 ön izleme
- Tek Tiled proje dosyası: `castle-stormers-20-levels.tiled-project`
- Kampanya sırası: `level-manifest.json`
- Obje sözleşmesi: `object-contract.json`
- Bağımsız kontrol sonucu: `validation-report.json`

## Level sırası

1. `level1.tmj` — `grasslands` — `single_main_corridor_with_center_branch`
2. `level2.tmj` — `grasslands` — `two_routes_around_vertical_river`
3. `level3.tmj` — `silent_forest` — `open_crossroads`
4. `level4.tmj` — `silent_forest` — `asymmetric_fork_and_rejoin`
5. `level5.tmj` — `silent_forest` — `three_bridge_chokepoints`
6. `level6.tmj` — `muddy_fields` — `single_winding_route_with_short_resource_loop`
7. `level7.tmj` — `muddy_fields` — `two_asymmetric_routes_around_central_bog`
8. `level8.tmj` — `muddy_fields` — `single_central_bridge_chokepoint_with_local_detours`
9. `level9.tmj` — `storm_valley` — `direct_risky_bridge_plus_long_safe_route`
10. `level10.tmj` — `storm_valley` — `staggered_split_routes_with_two_chokepoints`
11. `level11.tmj` — `storm_valley` — `two_routes_with_midfield_switch_and_asymmetric_bridge_pressure`
12. `level12.tmj` — `dry_steppe` — `single_zigzag_route_around_central_rock_field_with_local_resource_spurs`
13. `level13.tmj` — `dry_steppe` — `two_full_routes_crossing_a_vertical_ravine_at_separate_bridges`
14. `level14.tmj` — `dry_steppe` — `wide_direct_center_lane_plus_one_long_upper_flank`
15. `level15.tmj` — `desert` — `two_asymmetric_canyon_crossings_one_short_and_one_long`
16. `level16.tmj` — `desert` — `single_serpentine_canyon_route_with_two_local_supply_spurs`
17. `level17.tmj` — `snow` — `two_full_routes_around_a_frozen_basin_with_separate_bridge_chokepoints`
18. `level18.tmj` — `snow` — `single_central_causeway_crossing_three_sequential_ice_channels`
19. `level19.tmj` — `infernal` — `short_dangerous_center_route_plus_long_upper_safe_route_over_lava_fissure`
20. `level20.tmj` — `infernal` — `three_final_assault_routes_with_cross_lane_switches_and_staged_lava_bridges`

## Phaser kullanım notu

Phaser preload sırasında ilgili `.tmj` dosyasını JSON tilemap olarak ve haritanın referans verdiği tileset PNG dosyasını image olarak yükleyin. Harita içindeki dış tileset kaynağı `../tilesets/*.tsj`, tileset görseli ise `../images/*.png` biçiminde göreli yol kullanır; klasör yapısını koruyun.

İşlevsel obje katmanları `OBJECTS_BELOW` ve `OBJECTS_SORTED` içindedir. Kale, spawn/deploy, lane, connector, bridge, hazard, kule slotu, kaynak ve engel objelerinin isim/type sözleşmesi `object-contract.json` dosyasında tanımlıdır.

## Kontrol sonucu

- Harita: 20/20 geçti
- Tileset: 8 adet
- Tileset PNG: 8 adet
- Ön izleme: 20/20 adet
- Eksik dış dosya: 0
- Geçersiz JSON/GID/katman/temel obje hatası: 0
