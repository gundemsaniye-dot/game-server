# Castle Stormers - Tiled harita duzenleme rehberi

## Tek kaynak

Tiled'de elle duzenlenecek dosyalar `art/tiled/maps/level1.tmj` ile
`level20.tmj` arasindadir. `public/assets/tiled/` uretilen web ciktisidir;
elle duzenlenmez.

Her harita 32x18 kare, her kare 40x40 px ve oyun alani 1280x720 px'dir.
Level ile oyun map ID eslesmesi `level-manifest.json` dosyasindadir.

## Dort katman

| Katman | Oyundaki gorevi |
| --- | --- |
| `REFERENCE_ART_PREVIEW` | Tiled'de gordugunuz 1280x720 referans resimdir. Kilitli tutulur ve runtime JSON'a alinmaz; oyun ayni resmi ayri texture olarak gosterir. |
| `NAV_BLOCKED` | Kirmizi kareler askerlerin gecemeyecegi su, lav, ucurum, duvar ve sert engellerdir. |
| `05_BRIDGES` | Yesil kareler gecilebilir kopru/gecitlerdir. Ayni karedeki kirmizi `NAV_BLOCKED` isaretini gecersiz kilar. |
| `GAMEPLAY_ZONES` | Yalniz iki `CastleAnchor`, bir `DeployZone` ve bir `SpawnZone` tasir. |

Eski zemin, transition, hazard visual, road, detail, `NAV_COST`,
`OBJECTS_BELOW` ve `OBJECTS_SORTED` katmanlari kaldirildi. Referans resim zaten
butun gorseli tasidigi icin eski gorsel tile katmanlari oyunda cizilmiyordu.
`NAV_COST` yalniz rota maliyeti ekliyordu ve artik oyun tarafinda okunmuyor.

## GAMEPLAY_ZONES nesneleri

| Nesne | Anlami |
| --- | --- |
| `playerCastle` / `CastleAnchor` | Oyuncu kalesinin gercek referans ayak izi ve kale anchor noktasi. `blocksNavigation=true` oldugu icin asker kalenin icinden gecemez. |
| `enemyCastle` / `CastleAnchor` | Rakip kalesinin gercek referans ayak izi ve kale anchor noktasi. `blocksNavigation=true` oldugu icin asker kalenin icinden gecemez. |
| `playerDeploy` / `DeployZone` | Oyuncunun asker birakabilecegi dikdortgendir. Rakip asker hareketini engellemez. |
| `enemySpawn` / `SpawnZone` | Rakip askerlerin cikis dikdortgenidir. Oyuncu asker hareketini engellemez. |

`CastleAnchor` ozellikleri: `team`, `anchorX`, `anchorY`,
`blocksNavigation`. Deploy ve spawn icin yalniz `team` gerekir.

Tree, rock, `TowerSlot`, `ResourceNode`, `LanePath`, `LaneConnector`,
`BridgeZone`, `HazardZone`, `Obstacle` ve `Bounds` placeholder nesneleri TMJ'den
kaldirildi. Mevcut oyunda kaynaklar, dekorlar ve lane verisi hala
`src/game/maps/<mapId>.json` dosyasindan gelir; TMJ'deki eski placeholder'lar
ya hic okunmuyor ya da eksik sayida olduklari icin otomatik olarak bu veriye
geri donuyordu.

## Tiled'de elle duzenleme

1. `REFERENCE_ART_PREVIEW` gorunur ve kilitli kalsin.
2. Kale/deploy/spawn duzenlerken `GAMEPLAY_ZONES` katmanini secin.
3. Dikdortgeni secip surukleyin; ok tusu 1 px tasir. Boyutu sagdaki nesne
   ozelliklerinden piksel olarak girebilirsiniz.
4. `anchorX` ve `anchorY`, kale gorselinin oyun anchor noktasidir. Kale
   dikdortgeni ise askerlerin giremeyecegi gercek kale/duvar ayak izidir.
5. Navigasyon boyarken yalniz dogru marker'i kullanin: kirmizi
   `navigation-blocked`, yesil `navigation-bridge`.
6. Kaydedip `npm run web:sync` calistirin ve tarayiciyi yenileyin.
7. Son kontrol icin `npm run tiled:check` calistirin.

`npm run web:sync` elle yaptiginiz konumlari korur ve kaynak `.tmj` dosyalarina
yazmaz. `web:sync:layout`, `tiled:gameplay:align`, `tiled:simplify`,
`tiled:nav:standardize` ve `tiled:trees:normalize` kaynak haritayi koddan
yeniden yazabildigi icin kalici olarak kilitlenmistir.

Kaynak `.tmj` dosyalari `art/tiled/tmj-source-lock.json` SHA-256 manifestiyle
korunur. Herhangi bir harita degisirse build/sync sessizce devam etmez; degisen
dosyalari listeler ve kullaniciya bildirim ister. Bilincli bir Tiled duzenlemesi
kullaniciya bildirildikten ve onaylandiktan sonra kilit su acik komutla yenilenir:

`CONFIRM_TMJ_SOURCE_CHANGE=1 npm run tiled:lock:update`

`npm run tiled:nav:standardize` de kirmizi/yesil navigasyonu kod tablosundan
yeniden uretir ve elle boyanmis navigasyonu ezer. Normal Tiled duzenleme
akisinda calistirilmaz.

## Build sozlesmesi

- `npm run tiled:simplify`: eski 13 katmanli kaynaklari dort katmanli sozlesmeye
  bir kez gecirmek icin kullanilan idempotent bakim komutudur.
- `npm run web:sync`: TMJ kaynaklarini web runtime JSON'a cevirir.
- `npm run tiled:check`: kaynak/runtime yapisini, GID'leri, kale/deploy/spawn
  otoritesini ve iki tarafin da kale saldiri cizgisine ulasabildigini denetler.
- `npm run android:sync`: ayni web ciktisini Android projesine kopyalar.

Nesne sozlesmesinin makine tarafindan okunan kisa surumu
`object-contract.json` dosyasindadir.
