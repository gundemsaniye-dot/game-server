# Castle Stormers — Tiled Maps 06–10

Bu paket, önceki ilk 5 haritanın 32×18 / 40 px tile / 1280×720 dünya sözleşmesini sürdürür.

## Haritalar

6. `muddy_fields_01.tmj` — tek kıvrımlı ana rota ve yalnızca kaynak alanına giden kısa yerel döngü
7. `muddy_fields_02.tmj` — merkez bataklığın etrafında iki asimetrik tam rota
8. `muddy_fields_03.tmj` — tek merkez köprü darboğazı ve iki yerel kaynak sapması
9. `storm_valley_01.tmj` — riskli kısa köprü rotası + uzun güvenli alt rota
10. `storm_valley_02.tmj` — farklı noktalarda köprülenen, şaşırtmalı iki rota ve merkez geçişi

Haritalar aynı sayıda path kullanmaz. Bazıları tek ana rota, bazıları iki alternatif rota,
bazıları ise yalnızca kısa yerel connector içerir.

## İşlevsel objeler

`playerCastle`, `enemyCastle`, `playerDeploy`, `enemySpawn`, `towerSlot`,
`resourceNode`, `lanePath`, `laneConnector`, `bridge`, `hazardZone`, `tree`, `rock`.

`NAV_BLOCKED`, hassas engel maskesidir. `HazardZone` objeleri çalışma zamanı davranışını taşır;
`useTileMask=true` olduğundan gerçek şekil için tile maskesi kullanılmalıdır.
