# Castle Stormers — Tiled Maps 11–15

Bu paket, önceki haritaların 32×18 grid, 40×40 tile ve 1280×720 dünya sözleşmesini sürdürür.

## Haritalar

11. `storm_valley_03.tmj` — iki tam rota, merkez geçişi ve asimetrik fırtına köprüleri
12. `dry_steppe_01.tmj` — tek zikzak ana rota ve yalnızca kaynaklara giden kısa sapmalar
13. `dry_steppe_02.tmj` — dikey yarığı farklı noktalardan geçen iki tam rota
14. `dry_steppe_03.tmj` — geniş doğrudan merkez yolu + uzun üst kanat rotası
15. `desert_01.tmj` — kısa üst ve uzun alt olmak üzere iki asimetrik kanyon geçişi

Her harita aynı path sayısını kullanmaz. `lanePath` tam sol-sağ savaş rotasını,
`laneConnector` ise yalnızca yerel bağlantı veya kaynak sapmasını temsil eder.

## İşlevsel objeler

`playerCastle`, `enemyCastle`, `playerDeploy`, `enemySpawn`, `towerSlot`,
`resourceNode`, `lanePath`, `laneConnector`, `bridge`, `hazardZone`, `tree`, `rock`.

`NAV_BLOCKED` hassas çarpışma maskesidir. `HazardZone` objeleri çalışma zamanı davranışını taşır;
`useTileMask=true` olduğundan gerçek şekil için tile maskesi kullanılmalıdır.
