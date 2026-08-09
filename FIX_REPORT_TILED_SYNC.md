# Tiled Sync Fix Report

## Düzeltmeler

1. `package.json` düzeltildi.
   - `npm run dev` artık başlamadan önce Tiled mapleri yeniden build eder.
   - `npm run build` artık başlamadan önce Tiled mapleri yeniden build eder.
   - Ortak komut: `npm run prepare:maps`.

2. `art/tiled/maps/*.tmj` → `public/assets/tiled/maps/*.json` zinciri güncellendi.
   - 20 kaynak `.tmj` var.
   - 20 runtime `.json` var.
   - `dist/assets/tiled/maps` içinde 20 map var.

3. Dev mod cache sorunu azaltıldı.
   - `src/game/tiled/TiledAssetLoader.ts` içinde dev modda Tiled JSON ve tileset URL’lerine cache-bust query eklendi.

4. Tiled navigation düzeltildi.
   - `NAV_BLOCKED` içinde player deploy alanı, enemy spawn alanı ve resource erişimleri temizlendi.
   - `npm run tiled:validate` sonucu: 20/20 passed.

5. Production build alındı.
   - `npm run build-nolog` başarıyla tamamlandı.

## Çalıştırma

```bash
cd castle-raid-2
npm run dev
```

Tarayıcıda eski görüntü kalırsa:

```text
Command + Shift + R
```

## Manuel doğrulama

```bash
npm run tiled:build
npm run tiled:validate
npm run dev-nolog
```
