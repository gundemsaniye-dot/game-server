export const MAP_WIDTH = 1280;
export const MAP_HEIGHT = 720;
export const CASTLE_FOOT_CLEARANCE = 10;
export const ZONE_WIDTH = 40;
export const ZONE_GAP_FROM_ATTACK_LINE = 10;
export const PLAYER_DEPLOY_WIDTH = 62;

// All side fortresses use the level 3 authoring standard: 6 tiles (240 px) wide.
// frontX is the inner fortress edge; anchorX/anchorY is the primary stronghold point.
export const TILED_GAMEPLAY_LAYOUTS = {
  grasslands_01: { player: [240, 180, 620], enemy: [1040, 1100, 90] },
  grasslands_02: { player: [240, 180, 620], enemy: [1040, 1100, 90] },
  silent_forest_01: { player: [240, 180, 615], enemy: [1040, 1100, 90] },
  silent_forest_02: { player: [240, 180, 620], enemy: [1040, 1100, 90] },
  silent_forest_03: { player: [240, 180, 620], enemy: [1040, 1100, 90] },
  muddy_fields_01: { player: [240, 180, 545], enemy: [1040, 1100, 90] },
  muddy_fields_02: { player: [240, 180, 620], enemy: [1040, 1100, 90] },
  muddy_fields_03: { player: [240, 180, 620], enemy: [1040, 1100, 90] },
  storm_valley_01: { player: [240, 180, 595], enemy: [1040, 1100, 100] },
  storm_valley_02: { player: [240, 180, 585], enemy: [1040, 1100, 115] },
  storm_valley_03: { player: [240, 180, 620], enemy: [1040, 1100, 90] },
  dry_steppe_01: { player: [240, 180, 620], enemy: [1040, 1100, 90] },
  dry_steppe_02: { player: [240, 180, 620], enemy: [1040, 1100, 90] },
  dry_steppe_03: { player: [240, 180, 620], enemy: [1040, 1100, 90] },
  desert_01: { player: [240, 180, 600], enemy: [1040, 1100, 95] },
  desert_02: { player: [240, 180, 600], enemy: [1040, 1100, 95] },
  frozen_pass_01: { player: [240, 180, 560], enemy: [1040, 1100, 95] },
  frozen_pass_02: { player: [240, 180, 590], enemy: [1040, 1100, 100] },
  infernal_dungeon_01: { player: [240, 180, 610], enemy: [1040, 1100, 85] },
  ash_citadel_final: { player: [240, 180, 610], enemy: [1040, 1100, 100] },
};

export function expectedGameplayObjects(mapId) {
  const layout = TILED_GAMEPLAY_LAYOUTS[mapId];
  if (!layout) throw new Error(`${mapId}: missing reference-measured gameplay layout.`);
  const [playerFrontX, playerAnchorX, playerAnchorY] = layout.player;
  const [enemyFrontX, enemyAnchorX, enemyAnchorY] = layout.enemy;
  const playerDeployRightX = playerFrontX + CASTLE_FOOT_CLEARANCE + ZONE_GAP_FROM_ATTACK_LINE + ZONE_WIDTH;
  return {
    playerCastle: {
      x: 0,
      y: 0,
      width: playerFrontX,
      height: MAP_HEIGHT,
      anchorX: playerAnchorX,
      anchorY: playerAnchorY,
    },
    enemyCastle: {
      x: enemyFrontX,
      y: 0,
      width: MAP_WIDTH - enemyFrontX,
      height: MAP_HEIGHT,
      anchorX: enemyAnchorX,
      anchorY: enemyAnchorY,
    },
    playerDeploy: {
      x: playerDeployRightX - PLAYER_DEPLOY_WIDTH,
      y: 0,
      width: PLAYER_DEPLOY_WIDTH,
      height: MAP_HEIGHT,
    },
    enemySpawn: {
      x: enemyFrontX - CASTLE_FOOT_CLEARANCE - ZONE_GAP_FROM_ATTACK_LINE - ZONE_WIDTH,
      y: 0,
      width: ZONE_WIDTH,
      height: MAP_HEIGHT,
    },
  };
}
