import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../src/game/maps/", import.meta.url);
const biomeAssets = {
  grasslands: ["wildflower-patch", "poppy-clump", "daisy-clump", "grass-tuft", "clover-patch", "pebble-scatter", "fallen-branch", "mossy-stump", "dirt-patch", "meadow-soil", "shallow-puddle", "round-pond"],
  silent_forest: ["fern-cluster", "mushroom-ring", "leaf-litter", "exposed-roots", "pinecone-scatter", "moss-patch", "fallen-twig", "forest-stone", "dark-forest-soil", "forest-stream", "tiny-puddle", "ancient-stump"],
  muddy_fields: ["cattail-tuft", "lily-pads", "swamp-grass", "mud-splatter", "wet-mud", "marsh-stone", "driftwood", "small-puddle", "marsh-pond", "swamp-mushroom", "waterlogged-branch", "reed-shore"],
  storm_valley: ["heather-bush", "wind-grass", "slate-pebbles", "slate-rock", "lichen-patch", "wet-earth", "rain-puddle", "mountain-stream", "broken-branch", "wind-shrub", "crystal-shard", "scorched-soil"],
  dry_steppe: ["dry-grass", "thorn-bush", "steppe-pebbles", "small-sandstone", "dry-twig", "cracked-earth", "dust-ground", "dry-creek", "steppe-flower", "tumbleweed", "brittle-shrub", "bleached-wood"],
  desert: ["small-cactus", "desert-shrub", "sand-ripple", "desert-pebbles", "small-sandstone", "desert-twig", "palm-debris", "beetle-tracks", "sunbaked-sand", "oasis-pond", "desert-flower", "prickly-bush"],
  frozen_pass: ["snow-drift", "ice-stone", "ice-shard", "frost-grass", "packed-snow", "cracked-ice", "icy-stream", "frozen-pond", "snowy-branch", "blue-ice-boulder", "ice-flower", "snow-pebbles"],
  infernal_dungeon: ["ash-pile", "black-pebbles", "charred-wood", "obsidian-shard", "lava-crack", "burnt-earth", "ember-grass", "ash-swirl", "warm-ash-trace", "scorched-stump", "ember-mushroom", "blackened-stone"],
};
const signatures = { grasslands_01: "bluebell-meadow", grasslands_02: "butterfly-bloom", silent_forest_01: "foxglove-cluster", silent_forest_02: "mossy-hooftrail", silent_forest_03: "elderwood-stump", muddy_fields_01: "cattail-crown", muddy_fields_02: "lily-pad-crown", muddy_fields_03: "bog-mushroom-circle", storm_valley_01: "storm-scar-bush", storm_valley_02: "rainwater-rill", storm_valley_03: "charged-crystal-sprig", dry_steppe_01: "steppe-thistle", dry_steppe_02: "dusty-grass-whorl", dry_steppe_03: "windflower-clump", desert_01: "oasis-reed-crown", desert_02: "beetle-trail-crown", frozen_pass_01: "ice-flower-crown", frozen_pass_02: "snowy-log-crown", infernal_dungeon_01: "ember-mushroom-crown", ash_citadel_final: "ash-blossom-crown" };
const waterNames = new Set(["round-pond", "forest-stream", "marsh-pond", "mountain-stream", "oasis-pond", "icy-stream", "frozen-pond"]);
const groundNames = new Set(["dirt-patch", "meadow-soil", "shallow-puddle", "leaf-litter", "pinecone-scatter", "moss-patch", "dark-forest-soil", "mud-splatter", "wet-mud", "small-puddle", "lichen-patch", "wet-earth", "rain-puddle", "scorched-soil", "cracked-earth", "dust-ground", "dry-creek", "sand-ripple", "beetle-tracks", "sunbaked-sand", "snow-drift", "packed-snow", "cracked-ice", "snow-pebbles", "ash-pile", "lava-crack", "burnt-earth", "ash-swirl", "warm-ash-trace"]);
const points = [[430,110],[505,185],[610,100],[735,155],[850,110],[455,285],[565,250],[700,320],[820,275],[420,485],[535,555],[650,470],[765,560],[865,485],[590,640],[750,650]];

const files = (await readdir(root)).filter((file) => file.endsWith(".json"));
for (const file of files) {
  const path = join(root.pathname, file);
  const map = JSON.parse(await readFile(path, "utf8"));
  const names = biomeAssets[map.biome];
  map.schemaVersion = 3;
  map.objects = map.objects.filter((item) => !item.id.startsWith("decor-v3-"));
  names.forEach((name, index) => {
    let [x, y] = points[index];
    if (waterNames.has(name) && x < 470) x = 500;
    const ground = groundNames.has(name) || waterNames.has(name);
    map.objects.push({
      id: `decor-v3-${name}`, kind: "decoration", assetKey: `map-prop-${map.biome}-${name}`,
      x, y, scale: ground ? 0.34 : 0.24, rotation: ((index % 5) - 2) * 0.08,
      depth: ground ? 6 : Math.round(y), footprintRadius: waterNames.has(name) ? 64 : ground ? 30 : 20, blocksDeploy: false,
    });
  });
  names.slice(0, 2).forEach((name, index) => {
    const [x, y] = points[12 + index];
    map.objects.push({
      id: `decor-v3-accent-${index}`, kind: "decoration", assetKey: `map-prop-${map.biome}-${name}`,
      x, y, scale: 0.18, rotation: index ? 0.16 : -0.14, depth: Math.round(y), footprintRadius: 18, blocksDeploy: false,
    });
  });
  const signature = signatures[map.id];
  if (signature) map.objects.push({ id: `decor-v3-signature`, kind: "decoration", assetKey: `map-prop-${map.biome}-${signature}`, x: 675, y: 220, scale: 0.28, rotation: 0, depth: 220, footprintRadius: 24, blocksDeploy: false });
  map.objects.push({ id: "decor-v3-pine", kind: "decoration", assetKey: "map-prop-shared-pine-tree", x: 850, y: 610, scale: 0.24, rotation: 0, depth: 610, footprintRadius: 24, blocksDeploy: false });
  await writeFile(path, `${JSON.stringify(map, null, 2)}\n`);
}
