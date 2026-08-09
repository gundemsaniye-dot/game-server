# Castle Stormers — Tiled Maps 16–20

Bu paket, önceki haritaların 32×18 grid, 40×40 tile ve 1280×720 dünya sözleşmesini sürdürür.

## Haritalar

16. `desert_02.tmj` — tek kıvrımlı kanyon rotası ve iki yerel kaynak sapması
17. `frozen_pass_01.tmj` — donmuş havzanın üstünden ve altından geçen iki tam rota
18. `frozen_pass_02.tmj` — üç ardışık buz kanalını geçen tek merkez geçidi
19. `infernal_dungeon_01.tmj` — kısa tehlikeli merkez rotası + uzun üst güvenli rota
20. `ash_citadel_final.tmj` — üç final saldırı rotası, geçiş bağlantıları ve üç lav köprüsü

Haritalar sırasıyla 1, 2, 1, 2 ve 3 tam savaş rotası kullanır. Böylece bütün seviyeler aynı tek veya çift yol şablonuna bağlı değildir.
`lanePath` tam sol-sağ savaş rotasını, `laneConnector` ise yalnızca yerel geçiş veya kaynak sapmasını temsil eder.

## İşlevsel objeler

`playerCastle`, `enemyCastle`, `playerDeploy`, `enemySpawn`, `towerSlot`,
`resourceNode`, `lanePath`, `laneConnector`, `bridge`, `hazardZone`, `tree`, `rock`.

`NAV_BLOCKED` hassas çarpışma maskesidir. `HazardZone` objeleri çalışma zamanı davranışını taşır;
`useTileMask=true` olduğundan gerçek şekil için tile maskesi kullanılmalıdır.
