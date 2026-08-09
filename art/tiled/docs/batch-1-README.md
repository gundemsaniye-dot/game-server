# Castle Stormers — Tiled First 5 Maps

Bu paket, yüklenen `tiled.zip` yapısı korunarak hazırlanmıştır.

## Haritalar

1. `grasslands_01.tmj` — tek ana koridor + merkez dal
2. `grasslands_02.tmj` — nehir etrafında iki geçiş
3. `silent_forest_01.tmj` — açık merkez kavşağı
4. `silent_forest_02.tmj` — asimetrik çatallanıp birleşen rota
5. `silent_forest_03.tmj` — yalnızca bu haritada üç köprü darboğazı

Tüm haritalar 32×18 hücre, 40×40 tile ve 1280×720 dünya boyutundadır.

## Zorunlu katmanlar

`00_GROUND_BASE`, `01_GROUND_TERRAIN`, `02_GROUND_TRANSITIONS`,
`03_HAZARD_VISUALS`, `04_ROADS`, `05_BRIDGES`, `06_DETAILS_BELOW`,
`07_DETAILS_ABOVE`, `NAV_BLOCKED`, `NAV_COST`, `OBJECTS_BELOW`,
`OBJECTS_SORTED`.

## Yerleştirilen işlevsel objeler

- `playerCastle`, `enemyCastle`
- `playerDeploy`, `enemySpawn`
- `resourceNode`
- `towerSlot`
- `lanePath`, `laneConnector`
- `bridge`
- `tree`, `rock`

`OBJECTS_BELOW` zemin seviyesindeki zone/path objelerini taşır.
`OBJECTS_SORTED` kaleler, kule slotları, kaynaklar ve Y-depth uygulanacak statik objeleri taşır.

Phaser kodu objeleri öncelikle `name` alanından, ikincil olarak `type/class` alanından okuyabilir.
Ayrıntılı sözleşme `object-contract.json` içindedir.
