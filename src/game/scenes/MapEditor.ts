import { Scene } from "phaser";
import { LEVELS } from "../config/levels.config";
import {
  MAP_ASSETS,
  MAP_ASSETS_BY_KEY,
  MAP_PROP_ATLASES,
  PROCEDURAL_VISUALS,
  PROCEDURAL_VISUALS_BY_ID,
} from "../config/mapAssets";
import { BASE_PLAYER_UNIT_IDS, UNIT_CONFIGS, visualUnitId } from "../config/units.config";
import {
  createCampaignMapBundle,
  createSingleMapExport,
  getEditableBattleMap,
  parseMapImport,
  publishBattleMap,
  saveDraftBattleMap,
  validateBattleMap,
} from "../config/maps.config";
import { createMapPropVisual, renderBattleMap, weatherLabel, type MapRenderResult } from "../systems/MapRenderer";
import { preloadTiledBattleMap } from "../tiled/TiledAssetLoader";
import { getTiledBattleMapDefinition, TILED_BATTLE_MAPS } from "../tiled/TiledMapRegistry";
import { renderTiledBattleMap } from "../tiled/TiledMapRenderer";
import type { TiledMapRenderResult } from "../tiled/TiledTypes";
import type {
  BattleMapConfig,
  GroundMaterialId,
  MapVisualConfig,
  MapObjectConfig,
  ProceduralVisualId,
  ResourceNodeConfig,
  TerrainPatchConfig,
} from "../types/MapTypes";

type Selection =
  | { kind: "object"; id: string }
  | { kind: "resource"; id: string }
  | { kind: "patch"; id: string }
  | { kind: "lane"; id: string; pointIndex: number };

type PaletteDrag =
  | { kind: "object"; visual: MapVisualConfig; defaultScale: number; footprintRadius: number; obstacle: boolean; defaultDepth?: number }
  | { kind: "resource"; visual: MapVisualConfig; defaultScale: number; resourceType: ResourceNodeConfig["type"] }
  | { kind: "patch"; material: GroundMaterialId };

type PaletteFilter = "procedural" | "terrain" | "hazard" | "resource" | "assets";

const WORLD_WIDTH = 1280;
const WORLD_HEIGHT = 720;
const TOP_HEIGHT = 66;
const LEFT_WIDTH = 0;
const RIGHT_WIDTH = 300;
const GRID_SIZE = 16;
const EDITOR_VIEW_WIDTH = WORLD_WIDTH - LEFT_WIDTH - RIGHT_WIDTH;
const EDITOR_VIEW_HEIGHT = WORLD_HEIGHT - TOP_HEIGHT;
const FIT_ZOOM = Math.min(EDITOR_VIEW_WIDTH / WORLD_WIDTH, EDITOR_VIEW_HEIGHT / WORLD_HEIGHT);
const PLAYER_FORTRESS_X = 230;
const ENEMY_FORTRESS_X = 1048;
const FORTRESS_Y = 350;
const FORTRESS_HEIGHT = 700;
const MATERIAL_LABELS: Record<GroundMaterialId, string> = {
  grass: "ÇİMEN", soil: "TOPRAK", forest_floor: "ORMAN ZEMİNİ", mud: "ÇAMUR",
  dry_soil: "KURU TOPRAK", sand: "KUM", snow: "KAR", stone: "TAŞ", ash: "KÜL",
  water: "SU", lava: "LAV",
};

const MATERIAL_COLORS: Record<GroundMaterialId, number> = {
  grass: 0x6f9f50, soil: 0xae895c, forest_floor: 0x536444, mud: 0x6d6244,
  dry_soil: 0x9f7448, sand: 0xd8b66f, snow: 0xeaf3f5, stone: 0x727b7b,
  ash: 0x4a4140, water: 0x5799b5, lava: 0xc94724,
};

const MATERIAL_ORDER = Object.keys(MATERIAL_LABELS) as GroundMaterialId[];

const ASSET_LABELS_TR: Record<string, string> = {
  "Oak Tree": "Meşe Ağacı", "Wheat Field": "Buğday Tarlası", "Farm Fence": "Çiftlik Çiti", "Farm Cottage": "Çiftlik Evi",
  "Pine Cluster": "Çam Kümesi", "Moss Rock": "Yosunlu Kaya", "Fallen Log": "Devrilmiş Kütük", "Forest Watchtower": "Orman Gözetleme Kulesi",
  "Dead Tree": "Kuru Ağaç", Reeds: "Sazlık", "Mud Pool": "Çamur Havuzu", "Log Bridge": "Kütük Köprü",
  "Cliff Rock": "Uçurum Kayası", "Lightning Mast": "Yıldırım Direği", "Ruined Arch": "Yıkık Kemer", "Storm Crystal": "Fırtına Kristali",
  "Cracked Rock": "Çatlak Kaya", "Dry Bush": "Kuru Çalı", "Road Banner": "Yol Sancağı", "Supply Wagon": "Erzak Arabası",
  Cactus: "Kaktüs", "Palm Tree": "Palmiye", "Sandstone Ruin": "Kumtaşı Harabesi", "Bone Pile": "Kemik Yığını",
  "Snow Pine": "Karlı Çam", "Ice Crystal": "Buz Kristali", "Ice Rock": "Buz Kayası", "Frozen Tower": "Donmuş Kule",
  "Obsidian Spike": "Obsidyen İğne", "Lava Vent": "Lav Bacası", "Burned Tree": "Yanmış Ağaç", "Infernal Ruin": "Cehennem Harabesi",
};

const cloneMap = (map: BattleMapConfig) =>
  JSON.parse(JSON.stringify(map)) as BattleMapConfig;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export class MapEditor extends Scene {
  private map!: BattleMapConfig;
  private currentMapId = "grasslands_01";
  private mapRender?: MapRenderResult;
  private tiledMapRender?: TiledMapRenderResult;
  private worldObjects: Phaser.GameObjects.GameObject[] = [];
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  private levelMenuObjects: Phaser.GameObjects.GameObject[] = [];
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  private selection?: Selection;
  private inspectorText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private snapText!: Phaser.GameObjects.Text;
  private zoomText!: Phaser.GameObjects.Text;
  private flowText!: Phaser.GameObjects.Text;
  private paletteTitle!: Phaser.GameObjects.Text;
  private paletteButtons: Phaser.GameObjects.GameObject[] = [];
  private assetFilter: PaletteFilter = "procedural";
  private assetScroll = 0;
  private assetSearch = "";
  private assetSearchInput?: HTMLInputElement;
  private editableHandles: Array<{ object: Phaser.GameObjects.Shape; selection: Selection }> = [];
  private history: string[] = [];
  private historyIndex = -1;
  private snapEnabled = true;
  private zoom = FIT_ZOOM;
  private flowEditEnabled = false;
  private spaceHeld = false;
  private panning = false;
  private panPointerId?: number;
  private panStartX = 0;
  private panStartY = 0;
  private panScrollX = 0;
  private panScrollY = 0;
  private paletteDrag?: PaletteDrag;
  private autosave?: Phaser.Time.TimerEvent;

  constructor() {
    super("MapEditor");
  }

  init(data?: { mapId?: string }) {
    if (data?.mapId && LEVELS.some((level) => level.mapId === data.mapId)) {
      this.currentMapId = data.mapId;
    }
  }

  preload() {
    this.load.setPath("assets");
    Object.keys(TILED_BATTLE_MAPS).forEach((mapId) => preloadTiledBattleMap(this, mapId));
    MAP_PROP_ATLASES.forEach((atlas) => {
      if (!this.textures.exists(atlas.key)) this.load.atlas(atlas.key, atlas.imagePath, atlas.dataPath);
    });
  }

  create() {
    this.cameras.main
      .setBackgroundColor(0x101820)
      .setViewport(LEFT_WIDTH, TOP_HEIGHT, EDITOR_VIEW_WIDTH, EDITOR_VIEW_HEIGHT)
      .setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      .setZoom(this.zoom)
      .centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.uiCamera = this.cameras.add(0, 0, WORLD_WIDTH, WORLD_HEIGHT, false, "map-editor-ui");
    this.input.setTopOnly(true);
    this.loadMap(this.currentMapId);
    this.createChrome();
    this.createKeyboardControls();
    this.createPointerControls();
    this.renderWorld();
    this.setStatus("Taslak hazır. Harita öğelerini sürükleyerek düzenleyebilirsin.");
  }

  private loadMap(mapId: string) {
    this.currentMapId = mapId;
    this.map = getEditableBattleMap(mapId);
    this.selection = undefined;
    this.history = [JSON.stringify(this.map)];
    this.historyIndex = 0;
    if (this.levelText) this.levelText.setText(this.levelLabel());
    if (this.paletteTitle) this.rebuildPalette();
    if (this.mapRender) this.renderWorld();
    this.fitWorldView();
    this.updateInspector();
  }

  private createChrome() {
    this.makeUi(this.add.rectangle(640, TOP_HEIGHT / 2, 1280, TOP_HEIGHT, 0x111a25, 0.98));
    this.makeUi(this.add.rectangle(1280 - RIGHT_WIDTH / 2, 393, RIGHT_WIDTH, 654, 0x152231, 0.97));

    let x = 8;
    x = this.toolbarButton(x, 55, "GERİ", () => this.backToCampaign());
    x = this.toolbarButton(x, 30, "<", () => this.shiftLevel(-1));
    this.levelText = this.makeUi(
      this.add
        .text(x + 45, 33, this.levelLabel(), this.uiTextStyle(14))
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true }),
    );
    this.levelText.on("pointerdown", () => this.toggleLevelMenu());
    x += 90;
    x = this.toolbarButton(x, 30, ">", () => this.shiftLevel(1));
    x = this.toolbarButton(x, 55, "GERİ AL", () => this.undo());
    x = this.toolbarButton(x, 55, "İLERİ", () => this.redo());
    this.snapText = this.makeUi(
      this.add.text(0, 0, "", this.uiTextStyle(13)).setOrigin(0.5),
    );
    x = this.toolbarButton(x, 64, "IZGARA", () => {
      this.snapEnabled = !this.snapEnabled;
      this.updateToolbarState();
    }, this.snapText);
    this.zoomText = this.makeUi(
      this.add.text(0, 0, "", this.uiTextStyle(11)).setOrigin(0.5),
    );
    x = this.toolbarButton(x, 28, "−", () => this.setZoom(this.zoom - 0.1));
    x = this.toolbarButton(x, 50, "SIĞDIR", () => this.fitWorldView(), this.zoomText);
    x = this.toolbarButton(x, 28, "+", () => this.setZoom(this.zoom + 0.1));
    this.flowText = this.makeUi(this.add.text(0, 0, "", this.uiTextStyle(10)).setOrigin(0.5));
    x = this.toolbarButton(x, 76, "REHBER", () => {
      this.flowEditEnabled = !this.flowEditEnabled;
      if (!this.flowEditEnabled && this.selection?.kind === "lane") this.selection = undefined;
      this.updateToolbarState();
      this.renderWorld();
    }, this.flowText);
    x = this.toolbarButton(x, 60, "İÇE AL", () => this.importJson());
    x = this.toolbarButton(x, 60, "DIŞA", () => this.exportJson(false));
    x = this.toolbarButton(x, 64, "TEST", () => this.testPlay());
    x = this.toolbarButton(x, 66, "YAYINLA", () => this.publish());
    if (import.meta.env.DEV) {
      this.toolbarButton(x, 72, "KAYDET", () => void this.saveProject());
    }
    this.updateToolbarState();

    this.paletteTitle = this.makeUi(
      this.add.text(1130, 82, "1 • ITEM VIEW / EKLE", this.uiTextStyle(16)).setOrigin(0.5),
    );
    this.makeUi(
      this.add
        .text(1130, 101, "Ara • filtrele • tıkla/sürükle", {
          ...this.uiTextStyle(10), color: "#a9c2d4", strokeThickness: 2,
        })
        .setOrigin(0.5),
    );
    this.createAssetSearchInput();
    this.rebuildPalette();

    this.makeUi(this.add.rectangle(1130, 407, 270, 2, 0x6d879c, 0.72));
    this.makeUi(this.add.text(1130, 424, "2 • SEÇ VE DÜZENLE", this.uiTextStyle(15)).setOrigin(0.5));
    this.inspectorText = this.makeUi(
      this.add.text(997, 443, "", {
        ...this.uiTextStyle(11),
        fixedWidth: 266,
        lineSpacing: 3,
        wordWrap: { width: 264 },
      }),
    );
    this.createInspectorButtons();

    this.statusText = this.makeUi(
      this.add
        .text(640, 704, "", {
          ...this.uiTextStyle(13),
          color: "#d9f7ff",
          backgroundColor: "#071018dd",
          padding: { x: 12, y: 5 },
        })
        .setOrigin(0.5),
    );
    this.updateInspector();
  }

  private toolbarButton(
    x: number,
    width: number,
    label: string,
    action: () => void,
    providedLabel?: Phaser.GameObjects.Text,
  ) {
    const center = x + width / 2;
    const back = this.makeUi(
      this.add
        .rectangle(center, 33, width - 6, 38, 0x223346, 0.98)
        .setStrokeStyle(1, 0x66849a)
        .setInteractive({ useHandCursor: true }),
    );
    const text = providedLabel ?? this.makeUi(
      this.add.text(center, 33, label, this.uiTextStyle(12)).setOrigin(0.5),
    );
    text
      .setPosition(center, 33)
      .setDepth(back.depth + 1)
      .setInteractive({ useHandCursor: true });
    back.on("pointerdown", action);
    text.on("pointerdown", action);
    const over = () => back.setFillStyle(0x34516a, 1);
    const out = () => back.setFillStyle(0x223346, 0.98);
    back.on("pointerover", over).on("pointerout", out);
    text.on("pointerover", over).on("pointerout", out);
    return x + width;
  }

  private rebuildPalette() {
    this.paletteButtons.forEach((object) => {
      object.destroy();
      this.uiObjects = this.uiObjects.filter((candidate) => candidate !== object);
    });
    this.paletteButtons = [];
    const filters: Array<[string, PaletteFilter]> = [
      ["PHASER", "procedural"], ["ZEMİN", "terrain"], ["SU/LAV", "hazard"],
      ["KAYNAK", "resource"], ["ASSET", "assets"],
    ];
    filters.forEach(([label, filter], index) => {
      const x = 1017 + (index % 4) * 76;
      const y = 147 + Math.floor(index / 4) * 24;
      const active = this.assetFilter === filter;
      const back = this.makeUi(this.add.rectangle(x, y, 70, 19, active ? 0x397a94 : 0x1c3042, 0.98).setStrokeStyle(1, active ? 0x8bd7ed : 0x58758a).setInteractive({ useHandCursor: true }));
      const text = this.makeUi(this.add.text(x, y, label, { ...this.uiTextStyle(7), strokeThickness: 1 }).setOrigin(0.5));
      const choose = () => { this.assetFilter = filter; this.assetScroll = 0; this.rebuildPalette(); };
      back.on("pointerdown", choose); text.setInteractive({ useHandCursor: true }).on("pointerdown", choose);
      this.paletteButtons.push(back, text);
    });
    const normalizedSearch = this.normalizeSearch(this.assetSearch);
    const assets = this.assetFilter === "assets"
      ? MAP_ASSETS
        .filter((asset) => !normalizedSearch || this.normalizeSearch([asset.label, ...asset.searchTerms].join(" ")).includes(normalizedSearch))
        .sort((first, second) => Number(second.biome === this.map.biome || second.featuredMapId === this.currentMapId) - Number(first.biome === this.map.biome || first.featuredMapId === this.currentMapId) || first.label.localeCompare(second.label, "tr"))
      : [];
    const procedural = this.assetFilter === "procedural"
      ? PROCEDURAL_VISUALS.filter((definition) => definition.libraryCategory !== "resource")
      : this.assetFilter === "resource"
        ? PROCEDURAL_VISUALS.filter((definition) => definition.resourceType)
        : [];
    const materials: GroundMaterialId[] = this.assetFilter === "terrain"
      ? ["grass", "soil", "forest_floor", "mud", "dry_soil", "sand", "snow", "stone", "ash"]
      : this.assetFilter === "hazard" ? ["water", "lava"] : [];
    const totalItems = assets.length + procedural.length + materials.length;
    const maxScroll = Math.max(0, totalItems - 6);
    this.assetScroll = clamp(this.assetScroll, 0, maxScroll);
    if (assets.length > 0) {
      assets.slice(this.assetScroll, this.assetScroll + 6).forEach((asset, index) => {
        const visual: MapVisualConfig = { source: "asset", assetKey: asset.key };
        const drag: PaletteDrag = asset.category === "resource"
          ? { kind: "resource", visual, defaultScale: asset.defaultScale, resourceType: this.resourceTypeForAsset(asset.key) }
          : { kind: "object", visual, defaultScale: asset.defaultScale, footprintRadius: asset.footprintRadius, obstacle: asset.category === "obstacle", defaultDepth: asset.defaultDepth };
        this.paletteAssetCard(1064 + (index % 2) * 132, 223 + Math.floor(index / 2) * 66, ASSET_LABELS_TR[asset.label] ?? asset.label, drag, asset.atlasKey, asset.frame);
      });
    } else if (procedural.length > 0) {
      procedural.slice(this.assetScroll, this.assetScroll + 6).forEach((definition, index) => {
        const visual: MapVisualConfig = { source: "procedural", id: definition.id, variant: 0 };
        const drag: PaletteDrag = this.assetFilter === "resource"
          ? { kind: "resource", visual, defaultScale: definition.defaultScale, resourceType: definition.resourceType ?? "tree" }
          : { kind: "object", visual, defaultScale: definition.defaultScale, footprintRadius: definition.footprintRadius, obstacle: ["rock_cluster", "fallen_log", "obsidian"].includes(definition.id) };
        this.paletteProceduralCard(1064 + (index % 2) * 132, 223 + Math.floor(index / 2) * 66, definition.label, drag, definition.id, definition.defaultScale);
      });
    } else {
      materials.slice(this.assetScroll, this.assetScroll + 6).forEach((material, index) => {
        this.palettePatchCard(1064 + (index % 2) * 132, 223 + Math.floor(index / 2) * 66, MATERIAL_LABELS[material], { kind: "patch", material }, MATERIAL_COLORS[material]);
      });
    }
    if (totalItems > 6) {
      const trackHeight = 190;
      const thumbHeight = Math.max(30, trackHeight * 6 / totalItems);
      const progress = maxScroll === 0 ? 0 : this.assetScroll / maxScroll;
      const track = this.makeUi(this.add.rectangle(1268, 289, 4, trackHeight, 0x0e1c28, 0.9));
      const thumb = this.makeUi(this.add.rectangle(1268, 194 + thumbHeight / 2 + progress * (trackHeight - thumbHeight), 4, thumbHeight, 0x78b7cd, 0.95));
      this.paletteButtons.push(track, thumb);
    }
    const counter = this.makeUi(this.add.text(1130, 397, `${totalItems === 0 ? 0 : this.assetScroll + 1}-${Math.min(this.assetScroll + 6, totalItems)} / ${totalItems}  •  tekerlekle kaydır`, { ...this.uiTextStyle(8), strokeThickness: 1 }).setOrigin(0.5));
    this.paletteButtons.push(counter);
  }

  private createAssetSearchInput() {
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Item ara...";
    input.setAttribute("aria-label", "Item ara");
    Object.assign(input.style, { position: "fixed", zIndex: "20", width: "265px", height: "24px", boxSizing: "border-box", borderRadius: "5px", outline: "none", border: "1px solid #7092ac", background: "#0c1722", color: "#f1f7fb", padding: "0 8px", font: "11px Arial" });
    const position = () => {
      const rect = this.game.canvas.getBoundingClientRect();
      const scaleX = rect.width / WORLD_WIDTH;
      const scaleY = rect.height / WORLD_HEIGHT;
      input.style.left = `${rect.left + 997 * scaleX}px`;
      input.style.top = `${rect.top + 108 * scaleY}px`;
      input.style.width = `${266 * scaleX}px`;
      input.style.height = `${24 * scaleY}px`;
    };
    input.addEventListener("input", () => { this.assetSearch = input.value; this.assetScroll = 0; this.rebuildPalette(); });
    document.body.appendChild(input);
    position();
    this.assetSearchInput = input;
    this.scale.on("resize", position);
    window.addEventListener("resize", position);
    this.events.once("shutdown", () => {
      this.scale.off("resize", position);
      window.removeEventListener("resize", position);
      input.remove();
    });
  }

  private normalizeSearch(value: string) {
    return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");
  }

  private paletteAssetCard(
    x: number,
    y: number,
    label: string,
    drag: PaletteDrag,
    atlasKey: string,
    frame: string,
  ) {
    const back = this.makeUi(
      this.add
        .rectangle(x, y, 120, 60, 0x22384b, 0.98)
        .setStrokeStyle(1, 0x66849a, 0.95)
        .setInteractive({ useHandCursor: true }),
    );
    const source = this.textures.getFrame(atlasKey, frame);
    const image = this.makeUi(this.add.image(x, y - 8, atlasKey, frame).setOrigin(0.5));
    const previewScale = Math.min(58 / Math.max(1, source.width), 34 / Math.max(1, source.height));
    image.setDisplaySize(source.width * previewScale, source.height * previewScale);
    const text = this.makeUi(
      this.add.text(x, y + 21, `+ ${label}`, {
        ...this.uiTextStyle(8), fixedWidth: 114, align: "center", strokeThickness: 1,
      }).setOrigin(0.5),
    );
    const begin = () => {
      this.paletteDrag = drag;
      this.setStatus(`${label}: karta tıklarsan ekranın ortasına, sürüklersen bıraktığın yere eklenir.`);
    };
    back.on("pointerdown", begin);
    image.setInteractive({ useHandCursor: true }).on("pointerdown", begin);
    text.setInteractive({ useHandCursor: true }).on("pointerdown", begin);
    const hover = () => back.setFillStyle(0x31536c, 1);
    const out = () => back.setFillStyle(0x22384b, 0.98);
    [back, image, text].forEach((object) => {
      object.on("pointerover", hover);
      object.on("pointerout", out);
    });
    this.paletteButtons.push(back, image, text);
  }

  private paletteProceduralCard(
    x: number,
    y: number,
    label: string,
    drag: PaletteDrag,
    visualId: ProceduralVisualId,
    defaultScale: number,
  ) {
    const back = this.makeUi(
      this.add.rectangle(x, y, 120, 60, 0x22384b, 0.98)
        .setStrokeStyle(1, 0x66849a, 0.95)
        .setInteractive({ useHandCursor: true }),
    );
    const preview = this.makeUi(createMapPropVisual(this, {
      visual: { source: "procedural", id: visualId, variant: 0 },
      x, y: y + 7, scale: defaultScale * 0.46, rotation: 0, depth: 0,
    }));
    const text = this.makeUi(this.add.text(x, y + 21, `+ ${label}`, {
      ...this.uiTextStyle(8), fixedWidth: 114, align: "center", strokeThickness: 1,
    }).setOrigin(0.5));
    const begin = () => {
      this.paletteDrag = drag;
      this.setStatus(`${label}: karta tıklarsan ekranın ortasına, sürüklersen bıraktığın yere eklenir.`);
    };
    back.on("pointerdown", begin);
    text.setInteractive({ useHandCursor: true }).on("pointerdown", begin);
    back.on("pointerover", () => back.setFillStyle(0x31536c, 1)).on("pointerout", () => back.setFillStyle(0x22384b, 0.98));
    this.paletteButtons.push(back, preview, text);
  }

  private palettePatchCard(x: number, y: number, label: string, drag: PaletteDrag, color: number) {
    const back = this.makeUi(
      this.add
        .rectangle(x, y, 120, 60, 0x243a4e, 0.98)
        .setStrokeStyle(2, 0x7092ac, 0.9)
        .setInteractive({ useHandCursor: true }),
    );
    const swatch = this.makeUi(
      this.add.ellipse(x, y - 8, 74, 27, color, 0.9).setStrokeStyle(2, 0xd8eef5, 0.62),
    );
    const text = this.makeUi(
      this.add.text(x, y + 21, `+ ${label}`, { ...this.uiTextStyle(8), align: "center", strokeThickness: 2 }).setOrigin(0.5),
    );
    const begin = () => {
      this.paletteDrag = drag;
      this.setStatus(`${label}: karta tıklarsan ekranın ortasına, sürüklersen bıraktığın yere eklenir.`);
    };
    [back, swatch, text].forEach((object) => {
      object.setInteractive({ useHandCursor: true }).on("pointerdown", begin);
      object.on("pointerover", () => back.setFillStyle(0x31536c, 1));
      object.on("pointerout", () => back.setFillStyle(0x243a4e, 0.98));
    });
    this.paletteButtons.push(back, swatch, text);
  }

  private createInspectorButtons() {
    const buttons: Array<[string, () => void]> = [
      ["X -", () => this.adjustSelection("x", -1)], ["X +", () => this.adjustSelection("x", 1)],
      ["Y -", () => this.adjustSelection("y", -1)], ["Y +", () => this.adjustSelection("y", 1)],
      ["ÖLÇ/EN -", () => this.adjustPrimary(-1)], ["ÖLÇ/EN +", () => this.adjustPrimary(1)],
      ["DÖN/BOY -", () => this.adjustSecondary(-1)], ["DÖN/BOY +", () => this.adjustSecondary(1)],
      ["TÜR/VAR -", () => this.adjustVariant(-1)], ["TÜR/VAR +", () => this.adjustVariant(1)],
      ["MİK/VARY -", () => this.adjustAmountOrDepth(-1)], ["MİK/VARY +", () => this.adjustAmountOrDepth(1)],
      ["ÇOĞALT", () => this.duplicateSelection()], ["SİL", () => this.deleteSelection()],
    ];
    buttons.forEach(([label, action], index) => {
      const isWide = index >= buttons.length - 2;
      const x = isWide ? 1130 : 1064 + (index % 2) * 132;
      const y = isWide ? 703 : 520 + Math.floor(index / 2) * 30;
      const width = isWide ? 124 : 124;
      const wideX = label === "SİL" ? 1196 : 1064;
      const back = this.makeUi(
        this.add
          .rectangle(isWide ? wideX : x, y, width, 27, label === "SİL" ? 0x7b2933 : 0x263d51, 0.98)
          .setStrokeStyle(1, label === "SİL" ? 0xd45f69 : 0x66849a)
          .setInteractive({ useHandCursor: true }),
      );
      const text = this.makeUi(this.add.text(isWide ? wideX : x, y, label, this.uiTextStyle(10)).setOrigin(0.5));
      back.on("pointerdown", action);
      text.setInteractive({ useHandCursor: true }).on("pointerdown", action);
      const baseColor = label === "SİL" ? 0x7b2933 : 0x263d51;
      const hoverColor = label === "SİL" ? 0xa13b46 : 0x36566f;
      back.on("pointerover", () => back.setFillStyle(hoverColor, 1)).on("pointerout", () => back.setFillStyle(baseColor, 0.98));
      text.on("pointerover", () => back.setFillStyle(hoverColor, 1)).on("pointerout", () => back.setFillStyle(baseColor, 0.98));
    });
  }

  private renderWorld() {
    this.tiledMapRender?.destroy();
    this.mapRender?.destroy();
    this.worldObjects.forEach((object) => object.destroy());
    this.worldObjects = [];
    this.editableHandles = [];
    const tiledDefinition = getTiledBattleMapDefinition(this.map.id);
    if (tiledDefinition) {
      this.tiledMapRender = renderTiledBattleMap(this, tiledDefinition);
      this.uiCamera.ignore(this.tiledMapRender.layers);
    }
    this.mapRender = renderBattleMap(this, this.map, {
      showBackground: !tiledDefinition,
      showLegacyTerrain: tiledDefinition?.renderLegacyTerrain ?? true,
      showObjects: tiledDefinition?.renderLegacyObjects ?? true,
      showResources: tiledDefinition?.renderLegacyResources ?? true,
      animateWeather: true,
    });
    this.uiCamera.ignore(this.mapRender.objects);
    this.createFortressPreview();
    this.createSoldierSpawnPreview();
    if (this.flowEditEnabled) this.createLockedGuides();
    this.createEditableHandles();
    this.updateInspector();
  }

  private createFortressPreview() {
    const addSide = (key: string, x: number) => {
      if (!this.textures.exists(key)) return;
      const image = this.add.image(x, FORTRESS_Y, key).setOrigin(0.5).setDepth(640);
      const aspect = image.width / Math.max(1, image.height);
      image.setDisplaySize(FORTRESS_HEIGHT * aspect, FORTRESS_HEIGHT);
      this.registerWorld(image);
    };
    addSide("structure-player-fortress-side", PLAYER_FORTRESS_X);
    addSide("structure-enemy-fortress-side", ENEMY_FORTRESS_X);
  }

  private createSoldierSpawnPreview() {
    const alpha = 0.38;
    const panel = this.add.rectangle(58, 360, 114, 720, 0x8b542d, alpha)
      .setStrokeStyle(5, 0xc5d1d8, alpha)
      .setDepth(1100);
    const header = this.add.rectangle(58, 28, 106, 47, 0x3b2418, alpha)
      .setStrokeStyle(3, 0xc5d1d8, alpha)
      .setDepth(1101);
    const title = this.add.text(58, 28, "ASKER", {
      ...this.uiTextStyle(12), color: "#ffffff", strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(alpha).setDepth(1102);
    this.registerWorld(panel, header, title);

    const units = [...BASE_PLAYER_UNIT_IDS];
    const startY = units.length >= 7 ? 96 : 118;
    const stepY = units.length >= 7 ? 58 : units.length >= 5 ? 72 : 102;
    units.forEach((unit, index) => {
      const y = startY + index * stepY;
      const compact = units.length >= 7;
      const cardSize = compact ? 46 : 66;
      const card = this.add.rectangle(58, y, cardSize, cardSize, 0xf4f4f0, alpha)
        .setStrokeStyle(compact ? 3 : 4, 0x4d555b, alpha)
        .setDepth(1101);
      const texture = `unit-player-${visualUnitId(unit)}`;
      const icon = this.add.sprite(58, y - 7, texture, "idle_000")
        .setDisplaySize(compact ? 38 : 51, compact ? 38 : 51)
        .setAlpha(alpha)
        .setDepth(1102);
      const label = this.add.text(58, y + (compact ? 14 : 21), UNIT_CONFIGS[unit].shortLabel, {
        fontFamily: "Arial Black, Arial", fontSize: compact ? "7px" : "8px", color: "#27313a",
      }).setOrigin(0.5).setAlpha(alpha).setDepth(1103);
      this.registerWorld(card, icon, label);
    });

    const hint = this.add.text(58, 692, "OYUN MENÜSÜ\n(SOLUK ÖNİZLEME)", {
      ...this.uiTextStyle(9), align: "center", color: "#dce8ef", strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0.5).setDepth(1103);
    this.registerWorld(hint);
  }

  private createLockedGuides() {
    const graphics = this.add.graphics().setDepth(880);
    const drawZone = (zone: BattleMapConfig["deployZone"], color: number) => {
      graphics.lineStyle(3, color, 0.72);
      graphics.strokeRect(zone.x - zone.width / 2, zone.minY, zone.width, zone.maxY - zone.minY);
    };
    drawZone(this.map.deployZone, 0x38e5ee);
    drawZone(this.map.enemySpawnZone, 0xff6473);
    for (const [label, anchor] of Object.entries(this.map.anchors)) {
      const marker = this.add
        .rectangle(anchor.x, anchor.y, 76, 76, label.startsWith("player") ? 0x3ca2ff : 0xff4e59, 0.1)
        .setStrokeStyle(3, 0xffffff, 0.7)
        .setDepth(881);
      const text = this.add
        .text(anchor.x, anchor.y, "KİLİTLİ", this.uiTextStyle(9))
        .setOrigin(0.5)
        .setDepth(882);
      this.registerWorld(marker, text);
    }
    this.map.terrain.patches.filter((patch) => patch.collision !== "none").forEach((patch) => {
      const color = patch.collision === "lava" ? 0xff814a : 0x72e4ff;
      const boundary = this.add.ellipse(patch.x, patch.y, patch.width, patch.height, color, 0.04)
        .setStrokeStyle(3, color, 0.9)
        .setRotation(patch.rotation)
        .setDepth(884);
      const label = this.add.text(patch.x, patch.y, patch.collision === "lava" ? "LAV ENGELİ" : "SU ENGELİ", this.uiTextStyle(8))
        .setOrigin(0.5)
        .setDepth(885);
      this.registerWorld(boundary, label);
    });
    this.registerWorld(graphics);
  }

  private createEditableHandles() {
    this.map.terrain.patches.forEach((patch) => {
      const hit = patch.shape === "ellipse"
        ? this.add.ellipse(patch.x, patch.y, patch.width, patch.height, 0xffffff, 0.002)
        : this.add.rectangle(patch.x, patch.y, patch.width, patch.height, 0xffffff, 0.002);
      hit.setRotation(patch.rotation).setDepth(890).setInteractive({ useHandCursor: true });
      this.makeDraggable(hit, { kind: "patch", id: patch.id });
    });
    this.map.objects.forEach((object) => {
      const selected = this.selection?.kind === "object" && this.selection.id === object.id;
      const hit = this.add
        .circle(object.x, object.y, Math.max(18, object.footprintRadius), selected ? 0x67f3ff : 0xffffff, selected ? 0.16 : 0.002)
        .setStrokeStyle(selected ? 3 : 1, selected ? 0x67f3ff : 0xffffff, selected ? 0.9 : 0.08)
        .setDepth(900)
        .setInteractive({ useHandCursor: true });
      this.makeDraggable(hit, { kind: "object", id: object.id });
    });
    this.map.resources.forEach((resource) => {
      const selected = this.selection?.kind === "resource" && this.selection.id === resource.id;
      const hit = this.add
        .circle(resource.x, resource.y, 25, selected ? 0xffef76 : 0xffffff, selected ? 0.18 : 0.002)
        .setStrokeStyle(selected ? 3 : 1, selected ? 0xffef76 : 0xffffff, selected ? 0.9 : 0.08)
        .setDepth(901)
        .setInteractive({ useHandCursor: true });
      this.makeDraggable(hit, { kind: "resource", id: resource.id });
    });
    if (!this.flowEditEnabled) return;
    this.map.lanes.forEach((lane) => lane.points.forEach((point, pointIndex) => {
      const selected = this.selection?.kind === "lane" && this.selection.id === lane.id && this.selection.pointIndex === pointIndex;
      const handle = this.add
        .circle(point.x, point.y, selected ? 10 : 8, selected ? 0xffffff : 0x70efff, 0.94)
        .setStrokeStyle(3, 0x13202b)
        .setDepth(920)
        .setInteractive({ useHandCursor: true });
      this.makeDraggable(handle, { kind: "lane", id: lane.id, pointIndex });
    }));
    this.refreshSelectionHandles();
  }

  private makeDraggable(object: Phaser.GameObjects.Shape, selection: Selection) {
    this.registerWorld(object);
    this.editableHandles.push({ object, selection });
    this.input.setDraggable(object);
    object.on("pointerdown", () => {
      if (this.spaceHeld) return;
      this.selection = selection;
      this.refreshSelectionHandles();
      this.updateInspector();
    });
    object.on("drag", (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      if (this.spaceHeld) return;
      const target = this.selectionTarget(selection);
      if (!target) return;
      const x = selection.kind === "lane" ? target.x : this.snap(dragX);
      const y = this.snap(dragY);
      if (selection.kind !== "lane") target.x = clamp(x, 12, 1268);
      target.y = clamp(y, 12, 708);
      object.setPosition(target.x, target.y);
      this.updateInspector();
    });
    object.on("dragend", () => {
      if (!this.spaceHeld) this.commitChange();
    });
  }

  private refreshSelectionHandles() {
    this.editableHandles.forEach(({ object, selection }) => {
      const selected = this.sameSelection(selection, this.selection);
      if (selection.kind === "lane") {
        object.setFillStyle(selected ? 0xffffff : 0x70efff, 0.94).setStrokeStyle(3, 0x13202b, 1);
        return;
      }
      const color = selection.kind === "resource" ? 0xffef76 : 0x67f3ff;
      object
        .setFillStyle(selected ? color : 0xffffff, selected ? 0.16 : 0.002)
        .setStrokeStyle(selected ? 3 : 1, selected ? color : 0xffffff, selected ? 0.95 : 0.08);
    });
  }

  private sameSelection(first: Selection, second?: Selection) {
    if (!second || first.kind !== second.kind) return false;
    if (first.kind === "lane" && second.kind === "lane") {
      return first.id === second.id && first.pointIndex === second.pointIndex;
    }
    return first.id === second.id;
  }

  private selectionTarget(selection = this.selection):
    | MapObjectConfig
    | ResourceNodeConfig
    | TerrainPatchConfig
    | { x: number; y: number }
    | undefined {
    if (!selection) return undefined;
    if (selection.kind === "object") return this.map.objects.find((item) => item.id === selection.id);
    if (selection.kind === "resource") return this.map.resources.find((item) => item.id === selection.id);
    if (selection.kind === "patch") return this.map.terrain.patches.find((item) => item.id === selection.id);
    return this.map.lanes.find((lane) => lane.id === selection.id)?.points[selection.pointIndex];
  }

  private createKeyboardControls() {
    this.input.keyboard?.on("keydown-SPACE", () => { if (!this.isSearchFocused()) this.spaceHeld = true; });
    this.input.keyboard?.on("keyup-SPACE", () => { this.spaceHeld = false; this.panning = false; });
    this.input.keyboard?.on("keydown-DELETE", () => { if (!this.isSearchFocused()) this.deleteSelection(); });
    this.input.keyboard?.on("keydown-BACKSPACE", (event: KeyboardEvent) => {
      if (this.isSearchFocused()) return;
      event.preventDefault();
      this.deleteSelection();
    });
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (this.isSearchFocused()) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? this.redo() : this.undo();
        return;
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        this.redo();
        return;
      }
      const amount = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") this.nudge(-amount, 0);
      if (event.key === "ArrowRight") this.nudge(amount, 0);
      if (event.key === "ArrowUp") this.nudge(0, -amount);
      if (event.key === "ArrowDown") this.nudge(0, amount);
      if (event.key === "-" || event.key === "_") this.setZoom(this.zoom - 0.1);
      if (event.key === "+" || event.key === "=") this.setZoom(this.zoom + 0.1);
    });
  }

  private isSearchFocused() {
    return document.activeElement === this.assetSearchInput;
  }

  private createPointerControls() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.spaceHeld) return;
      this.panning = true;
      this.panPointerId = pointer.id;
      this.panStartX = pointer.x;
      this.panStartY = pointer.y;
      this.panScrollX = this.cameras.main.scrollX;
      this.panScrollY = this.cameras.main.scrollY;
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.panning || pointer.id !== this.panPointerId || !pointer.isDown) return;
      this.cameras.main.setScroll(
        this.panScrollX - (pointer.x - this.panStartX) / this.zoom,
        this.panScrollY - (pointer.y - this.panStartY) / this.zoom,
      );
    });
    const finishPointer = (pointer: Phaser.Input.Pointer) => {
      if (this.paletteDrag) {
        const drag = this.paletteDrag;
        this.paletteDrag = undefined;
        if (pointer.x > LEFT_WIDTH && pointer.x < WORLD_WIDTH - RIGHT_WIDTH && pointer.y > TOP_HEIGHT) {
          const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          this.placePaletteItem(drag, this.snap(point.x), this.snap(point.y));
        } else if (pointer.x >= WORLD_WIDTH - RIGHT_WIDTH && pointer.y > TOP_HEIGHT) {
          const point = this.cameras.main.getWorldPoint(EDITOR_VIEW_WIDTH / 2, TOP_HEIGHT + EDITOR_VIEW_HEIGHT / 2);
          this.placePaletteItem(drag, this.snap(point.x), this.snap(point.y));
        }
      }
      if (pointer.id === this.panPointerId) {
        this.panning = false;
        this.panPointerId = undefined;
      }
    };
    this.input.on("pointerup", finishPointer);
    this.input.on("pointerupoutside", finishPointer);
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      if (_pointer.x >= WORLD_WIDTH - RIGHT_WIDTH && _pointer.y >= 135 && _pointer.y <= 405) {
        this.assetScroll += dy > 0 ? 2 : -2;
        this.rebuildPalette();
      }
    });
  }

  private placePaletteItem(drag: PaletteDrag, x: number, y: number) {
    if (drag.kind === "object") {
      const object: MapObjectConfig = {
        id: this.nextId("object"), kind: drag.obstacle ? "obstacle" : "decoration",
        visual: drag.visual, x, y, scale: drag.defaultScale, rotation: 0, depth: drag.defaultDepth ?? Math.round(y + 6),
        footprintRadius: drag.footprintRadius, blocksDeploy: drag.obstacle,
      };
      this.map.objects.push(object);
      this.selection = { kind: "object", id: object.id };
    } else if (drag.kind === "resource") {
      const resource: ResourceNodeConfig = {
        id: this.nextId("resource"), type: drag.resourceType, amount: 8, visual: drag.visual,
        x, y, scale: drag.defaultScale,
        rotation: 0, depth: 8,
      };
      this.map.resources.push(resource);
      this.selection = { kind: "resource", id: resource.id };
    } else {
      const collision = drag.material === "water" ? "water" : drag.material === "lava" ? "lava" : "none";
      const impassable = collision !== "none";
      const patch: TerrainPatchConfig = {
        id: this.nextId("patch"), shape: "ellipse", x, y,
        width: impassable ? 190 : 190, height: impassable ? 54 : 104,
        color: MATERIAL_COLORS[drag.material],
        alpha: impassable ? 0.86 : 0.82, rotation: 0, depth: impassable ? 7 : 3,
        material: drag.material, collision, variant: 0,
      };
      this.map.terrain.patches.push(patch);
      this.selection = { kind: "patch", id: patch.id };
    }
    this.commitChange();
    this.setStatus(`${this.selectionKindLabel()} eklendi ve seçildi. Sağdaki kontrollerden düzenleyebilirsin.`);
  }

  private nudge(dx: number, dy: number) {
    const target = this.selectionTarget();
    if (!target) return;
    if (this.selection?.kind !== "lane") target.x = clamp(target.x + dx, 0, WORLD_WIDTH);
    target.y = clamp(target.y + dy, 0, WORLD_HEIGHT);
    this.commitChange();
  }

  private adjustSelection(field: "x" | "y" | "scale" | "rotation" | "depth" | "amount", delta: number) {
    const target = this.selectionTarget() as Record<string, number> | undefined;
    if (!target || typeof target[field] !== "number") return;
    if (field === "x" && this.selection?.kind === "lane") return;
    target[field] += delta;
    if (field === "scale") target[field] = clamp(target[field], 0.05, 3);
    if (field === "amount") target[field] = clamp(Math.round(target[field]), 1, 99);
    this.commitChange();
  }

  private adjustPrimary(direction: number) {
    if (this.selection?.kind === "patch") {
      const patch = this.selectionTarget() as TerrainPatchConfig | undefined;
      if (!patch) return;
      patch.width = clamp(patch.width + direction * 16, 32, 620);
      this.commitChange();
      return;
    }
    this.adjustSelection("scale", direction * 0.05);
  }

  private adjustSecondary(direction: number) {
    if (this.selection?.kind === "patch") {
      const patch = this.selectionTarget() as TerrainPatchConfig | undefined;
      if (!patch) return;
      patch.height = clamp(patch.height + direction * 12, 20, 420);
      this.commitChange();
      return;
    }
    this.adjustSelection("rotation", direction * 0.1);
  }

  private adjustVariant(direction: number) {
    const target = this.selectionTarget();
    if (!target) return;
    if (this.selection?.kind === "patch") {
      const patch = target as TerrainPatchConfig;
      const index = MATERIAL_ORDER.indexOf(patch.material);
      patch.material = MATERIAL_ORDER[(index + direction + MATERIAL_ORDER.length) % MATERIAL_ORDER.length];
      patch.color = MATERIAL_COLORS[patch.material];
      patch.collision = patch.material === "water" ? "water" : patch.material === "lava" ? "lava" : "none";
      patch.depth = patch.collision === "none" ? 3 : 7;
      patch.alpha = patch.collision === "none" ? 0.82 : 0.86;
    } else if ("visual" in target && target.visual.source === "procedural") {
      target.visual.variant = Math.max(0, target.visual.variant + direction);
    } else {
      this.setStatus("Varyant yalnızca Phaser öğelerinde kullanılabilir.");
      return;
    }
    this.commitChange();
  }

  private adjustAmountOrDepth(direction: number) {
    if (this.selection?.kind === "patch") {
      const patch = this.selectionTarget() as TerrainPatchConfig | undefined;
      if (!patch) return;
      patch.variant = Math.max(0, patch.variant + direction);
      this.commitChange();
    } else if (this.selection?.kind === "resource") this.adjustSelection("amount", direction);
    else this.adjustSelection("depth", direction);
  }

  private duplicateSelection() {
    if (!this.selection || this.selection.kind === "lane") {
      this.setStatus("Çoğaltmak için önce haritadaki bir öğeyi seç.");
      return;
    }
    const target = this.selectionTarget();
    if (!target || !("id" in target)) return;
    const copy = { ...target, id: this.nextId(this.selection.kind), x: target.x + 24, y: target.y + 24 };
    if (this.selection.kind === "object") this.map.objects.push(copy as MapObjectConfig);
    if (this.selection.kind === "resource") this.map.resources.push(copy as ResourceNodeConfig);
    if (this.selection.kind === "patch") this.map.terrain.patches.push(copy as TerrainPatchConfig);
    this.selection = { ...this.selection, id: copy.id } as Selection;
    this.commitChange();
    this.setStatus("Seçili öğe çoğaltıldı.");
  }

  private deleteSelection() {
    if (!this.selection || this.selection.kind === "lane") {
      this.setStatus("Silmek için önce haritadaki bir öğeyi seç. Akış noktaları silinemez.");
      return;
    }
    const deletedLabel = this.selectionKindLabel();
    const { kind, id } = this.selection;
    if (kind === "object") this.map.objects = this.map.objects.filter((item) => item.id !== id);
    if (kind === "resource") this.map.resources = this.map.resources.filter((item) => item.id !== id);
    if (kind === "patch") this.map.terrain.patches = this.map.terrain.patches.filter((item) => item.id !== id);
    this.selection = undefined;
    this.commitChange();
    this.setStatus(`${deletedLabel} silindi. Geri Al ile geri getirebilirsin.`);
  }

  private commitChange(resetHistory = false) {
    const snapshot = JSON.stringify(this.map);
    if (resetHistory) {
      this.history = [snapshot];
      this.historyIndex = 0;
    } else if (snapshot !== this.history[this.historyIndex]) {
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(snapshot);
      this.historyIndex = this.history.length - 1;
      if (this.history.length > 80) {
        this.history.shift();
        this.historyIndex -= 1;
      }
    }
    this.scheduleAutosave();
    this.renderWorld();
  }

  private undo() {
    if (this.historyIndex <= 0) return;
    this.historyIndex -= 1;
    this.map = JSON.parse(this.history[this.historyIndex]) as BattleMapConfig;
    this.selection = undefined;
    this.scheduleAutosave();
    this.renderWorld();
  }

  private redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex += 1;
    this.map = JSON.parse(this.history[this.historyIndex]) as BattleMapConfig;
    this.selection = undefined;
    this.scheduleAutosave();
    this.renderWorld();
  }

  private scheduleAutosave() {
    this.autosave?.remove(false);
    this.autosave = this.time.delayedCall(500, () => {
      saveDraftBattleMap(this.map);
      this.setStatus(`Otomatik kayıt: ${this.levelLabel()} taslağı tarayıcıya kaydedildi.`);
    });
  }

  private testPlay() {
    saveDraftBattleMap(this.map);
    const level = LEVELS.find((candidate) => candidate.mapId === this.currentMapId);
    this.scene.start("Game", {
      levelId: level?.id ?? "level_001",
      mapOverride: cloneMap(this.map),
      editorPreview: true,
      returnScene: "MapEditor",
    });
  }

  private publish() {
    const result = publishBattleMap(this.map);
    this.setStatus(result.valid ? "Yayınlandı: normal oyun artık bu haritayı kullanacak." : `Yayınlama reddedildi: ${result.errors[0]}`);
  }

  private async saveProject() {
    const validation = validateBattleMap(this.map);
    if (!validation.valid) {
      this.setStatus(`Projeye kayıt reddedildi: ${validation.errors[0]}`);
      return;
    }
    try {
      const response = await fetch("/__castle_map_save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapId: this.currentMapId, map: this.map }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      this.setStatus(result.ok ? "Harita JSON dosyası projeye kaydedildi." : `Projeye kayıt hatası: ${result.error}`);
    } catch {
      this.setStatus("Projeye kayıt hizmeti kullanılamadı.");
    }
  }

  private importJson() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const parsed = parseMapImport(String(reader.result ?? ""));
        if (parsed.errors.length > 0) {
          this.setStatus(`İçe aktarma reddedildi: ${parsed.errors[0]}`);
          return;
        }
        parsed.maps.forEach(saveDraftBattleMap);
        this.loadMap(parsed.maps.some((map) => map.id === this.currentMapId) ? this.currentMapId : parsed.maps[0].id);
        this.renderWorld();
        this.setStatus(`${parsed.maps.length} harita başarıyla içe aktarıldı.`);
      };
      reader.readAsText(file);
    };
    input.click();
  }

  private exportJson(bundle: boolean) {
    saveDraftBattleMap(this.map);
    const payload = bundle ? createCampaignMapBundle() : createSingleMapExport(this.map);
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = bundle ? "castle-raid-20-maps.json" : `${this.currentMapId}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    this.setStatus(bundle ? "20 haritalık paket dışa aktarıldı." : `${this.levelLabel()} dışa aktarıldı.`);
  }

  private shiftLevel(direction: number) {
    const index = LEVELS.findIndex((level) => level.mapId === this.currentMapId);
    const next = (index + direction + LEVELS.length) % LEVELS.length;
    this.closeLevelMenu();
    this.loadMap(LEVELS[next].mapId);
  }

  private toggleLevelMenu() {
    if (this.levelMenuObjects.length > 0) {
      this.closeLevelMenu();
      return;
    }
    const shade = this.makeUi(
      this.add.rectangle(430, 210, 390, 262, 0x0b1520, 0.98).setStrokeStyle(3, 0x78cbe4),
    );
    this.levelMenuObjects.push(shade);
    LEVELS.forEach((level, index) => {
      const x = 280 + (index % 5) * 75;
      const y = 112 + Math.floor(index / 5) * 62;
      const back = this.makeUi(
        this.add
          .rectangle(x, y, 62, 44, level.mapId === this.currentMapId ? 0x34728a : 0x26384b, 1)
          .setStrokeStyle(2, 0x6d879c)
          .setInteractive({ useHandCursor: true }),
      );
      const text = this.makeUi(this.add.text(x, y, String(level.order), this.uiTextStyle(14)).setOrigin(0.5));
      const select = () => { this.closeLevelMenu(); this.loadMap(level.mapId); };
      back.on("pointerdown", select);
      text.setInteractive({ useHandCursor: true }).on("pointerdown", select);
      this.levelMenuObjects.push(back, text);
    });
  }

  private closeLevelMenu() {
    this.levelMenuObjects.forEach((object) => {
      object.destroy();
      this.uiObjects = this.uiObjects.filter((candidate) => candidate !== object);
    });
    this.levelMenuObjects = [];
  }

  private updateInspector() {
    if (!this.inspectorText) return;
    const target = this.selectionTarget() as Record<string, unknown> | undefined;
    if (!this.selection || !target) {
      this.inspectorText.setText([
        `${this.levelLabel().replace(" ▼", "")} • ${this.biomeLabel()} • ${this.map.objects.length} öğe • ${this.map.resources.length} kaynak`,
        `Hava: ${weatherLabel(this.map.weather.type)}`,
        "Öğeye tıkla → düzenle / çoğalt / SİL.",
      ]);
      return;
    }
    const visual = "visual" in target ? target.visual as MapVisualConfig : undefined;
    const asset = visual?.source === "asset" ? MAP_ASSETS_BY_KEY[visual.assetKey] : undefined;
    const procedural = visual?.source === "procedural" ? PROCEDURAL_VISUALS_BY_ID[visual.id] : undefined;
    const selectedName = asset
      ? (ASSET_LABELS_TR[asset.label] ?? asset.label)
      : procedural?.label ?? ("material" in target ? MATERIAL_LABELS[target.material as GroundMaterialId] : this.selectionKindLabel());
    const lines = [
      `SEÇİLİ: ${selectedName}`,
      `X: ${Number(target.x).toFixed(0)}   Y: ${Number(target.y).toFixed(0)}`,
    ];
    const transform: string[] = [];
    if ("scale" in target) transform.push(`Ölçek ${Number(target.scale).toFixed(2)}`);
    if ("rotation" in target) transform.push(`Dönüş ${Number(target.rotation).toFixed(2)}`);
    if (transform.length > 0) lines.push(transform.join(" • "));
    const metadata: string[] = [];
    if ("depth" in target) metadata.push(`Katman ${target.depth}`);
    if ("amount" in target) metadata.push(`Miktar ${target.amount}`);
    if (visual?.source === "procedural") metadata.push(`Varyant ${visual.variant}`);
    if ("collision" in target && target.collision !== "none") metadata.push(`Engel ${String(target.collision).toUpperCase()}`);
    if (metadata.length > 0) lines.push(metadata.join(" • "));
    if (this.selection.kind === "lane") lines.push("Akış noktasının X değeri kilitlidir; Y değeri sürüklenebilir. Noktalar görünür yol ile birlik rotasını birlikte şekillendirir.");
    this.inspectorText.setText(lines);
  }

  private resourceTypeForAsset(assetKey: string): ResourceNodeConfig["type"] {
    const biome = MAP_ASSETS_BY_KEY[assetKey]?.biome;
    if (biome === "frozen_pass") return "crystal";
    if (biome === "storm_valley") return "ore";
    if (biome === "infernal_dungeon") return "lava_rock";
    return "tree";
  }

  private updateToolbarState() {
    this.snapText?.setText(`IZG ${this.snapEnabled ? GRID_SIZE : "KAP"}`);
    this.zoomText?.setText(`${Math.round(this.zoom * 100)}%`);
    this.flowText?.setText(this.flowEditEnabled ? "REHBER AÇIK" : "REHBER KAPALI");
  }

  private fitWorldView() {
    this.zoom = FIT_ZOOM;
    this.cameras.main.setZoom(this.zoom).centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.updateToolbarState();
  }

  private setZoom(value: number) {
    this.zoom = clamp(value, 0.6, 1.5);
    this.cameras.main.setZoom(this.zoom);
    this.updateToolbarState();
  }

  private snap(value: number) {
    return this.snapEnabled ? Math.round(value / GRID_SIZE) * GRID_SIZE : Math.round(value);
  }

  private nextId(prefix: string) {
    const known = new Set([
      ...this.map.objects.map((item) => item.id),
      ...this.map.resources.map((item) => item.id),
      ...this.map.terrain.patches.map((item) => item.id),
    ]);
    let index = 1;
    while (known.has(`${prefix}-${index}`)) index += 1;
    return `${prefix}-${index}`;
  }

  private levelLabel() {
    const level = LEVELS.find((candidate) => candidate.mapId === this.currentMapId);
    return `L${String(level?.order ?? 1).padStart(2, "0")} ▼`;
  }

  private biomeLabel() {
    const labels: Record<BattleMapConfig["biome"], string> = {
      grasslands: "Çayırlar", silent_forest: "Sessiz Orman", muddy_fields: "Çamurlu Ova",
      storm_valley: "Fırtına Vadisi", dry_steppe: "Kuru Bozkır", desert: "Çöl",
      frozen_pass: "Donmuş Geçit", infernal_dungeon: "Cehennem Diyarı",
    };
    return labels[this.map.biome];
  }

  private selectionKindLabel() {
    if (!this.selection) return "SEÇİM";
    return { object: "ÖĞE", resource: "KAYNAK", patch: "ZEMİN BÖLGESİ", lane: "AKIŞ NOKTASI" }[this.selection.kind];
  }

  private backToCampaign() {
    saveDraftBattleMap(this.map);
    this.scene.start("MapSelect");
  }

  private setStatus(message: string) {
    this.statusText?.setText(message);
  }

  private makeUi<T extends Phaser.GameObjects.GameObject>(object: T): T {
    (object as T & { setDepth: (depth: number) => T }).setDepth(1500 + this.uiObjects.length);
    this.uiObjects.push(object);
    this.cameras.main.ignore(object);
    return object;
  }

  private registerWorld(...objects: Phaser.GameObjects.GameObject[]) {
    this.worldObjects.push(...objects);
    this.uiCamera.ignore(objects);
  }

  private uiTextStyle(size: number): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: `${size}px`,
      color: "#f1f7fb",
      stroke: "#09131b",
      strokeThickness: 3,
    };
  }
}
