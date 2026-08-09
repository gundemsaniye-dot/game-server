# Tiled Map Workflow

Bu proje Tiled kaynak haritalarını doğrudan `art/tiled/maps/*.tmj` konumundan oyun içinde okumaz.
Oyun, build sonrası oluşan runtime JSON dosyalarını kullanır:

```text
art/tiled/maps/*.tmj
        ↓ npm run tiled:build
public/assets/tiled/maps/*.json
        ↓ Phaser preload
Game scene
```

Bu ZIP içinde normal komutlar düzeltildi:

```bash
npm run dev
npm run build
```

art/tiled içindeki haritaları otomatik olarak `public/assets/tiled` içine yeniden üretir.

Manuel kontrol için:

```bash
npm run tiled:build
npm run tiled:validate
npm run dev-nolog
```

Tarayıcıda hâlâ eski görüntü varsa:

```text
Command + Shift + R
```

ile sert yenileme yap. Dev modda Tiled JSON ve tileset URL’lerine cache-bust eklendi.
