import fs from "fs";

const GAME_TS = "src/game/scenes/Game.ts";
let content = fs.readFileSync(GAME_TS, "utf8");

// Add import t
if (!content.includes('import { t } from "../i18n/Localization";')) {
  content = content.replace('import { Scene } from "phaser";', 'import { Scene } from "phaser";\nimport { t } from "../i18n/Localization";');
}

const replacements = [
  ['"SAVAŞA HAZIRLANIYOR..."', 't("game_preparing_battle")'],
  ['"ENEMY"', 't("game_enemy")'],
  ['"Unit sec, turkuaz alanda istedigin yere dokun."', 't("game_unit_select_hint")'],
  ['"EDITOR\'E DON"', 't("game_return_to_editor")'],
  ['"Oyun durdu."', 't("game_paused")'],
  ['"Oyun devam ediyor."', 't("game_resumed")'],
  ['"Birimi turkuaz alana yerlestir."', 't("game_place_unit_hint")'],
  ['"START BATTLE"', 't("game_start_battle")'],
  ['"MAIN MENU"', 't("game_main_menu")'],
  ['"CLOSE"', 't("game_close")'],
  ['`LEVEL ${level.order} · ${storyTitle.toUpperCase()}`', 't("game_level_title", { level: level.order, title: storyTitle.toUpperCase() })'],
  ['`${warningSeconds} SN SONRA REZERV · ${laneNames}`', 't("game_wave_warning", { seconds: warningSeconds, lanes: laneNames })'],
  ['"MAXED OUT: Aktif + kuyruktaki oduncu limiti dolu."', 't("game_max_out_worker")'],
  ['"MAX OUT: Aktif + kuyruktaki ordu limiti dolu."', 't("game_max_out_army")'],
  ['"MAXED OUT: Aktif oduncu limiti dolu."', 't("game_max_out_worker")'],
  ['"MAX OUT: Aktif ordu limiti dolu."', 't("game_max_out_army")'],
  ['"Yeterli gold yok."', 't("game_not_enough_gold")'],
  ['"Once sol menuden kac unit gonderecegini sec."', 't("game_select_unit_first")'],
  ['"BASE HIT"', 't("game_base_hit")'],
  ['"ZING!"', 't("game_zing")'],
  ['"SPLASH"', 't("game_splash")'],
  ['"BOOM"', 't("game_boom")'],
  ['`${power === "missile" ? "Missile" : "Ice Blast"} henuz hazir degil.`', 't("game_power_not_ready", { power: power === "missile" ? "Missile" : "Ice Blast" })'],
  ['"Power kullanildi. Asker secip devam et."', 't("game_power_used_hint")'],
  ['`Enemy training: ${UNIT_CONFIGS[type].label}`', 't("game_ai_training", { unit: UNIT_CONFIGS[type].label })'],
  ['"LEVEL UP"', 't("game_level_up")'],
  ['"REMOVE"', 't("game_remove")']
];

for (const [search, replace] of replacements) {
  // Use split/join to replace all occurrences globally
  content = content.split(search).join(replace);
}

fs.writeFileSync(GAME_TS, content, "utf8");
console.log("Game.ts updated successfully!");
