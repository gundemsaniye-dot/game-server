export type UnitAnimationName = 'idle' | 'run' | 'attack';

export interface UnitAnimationDefinition {
    prefix: `${UnitAnimationName}_`;
    start: number;
    end: number;
    frameRate: number;
    repeat: number;
}

export const UNIT_ANIMATION_DEFINITIONS: Record<UnitAnimationName, UnitAnimationDefinition> = {
    idle: {
        prefix: 'idle_',
        start: 0,
        end: 7,
        frameRate: 6,
        repeat: -1
    },
    run: {
        prefix: 'run_',
        start: 0,
        end: 15,
        frameRate: 16,
        repeat: -1
    },
    attack: {
        prefix: 'attack_',
        start: 0,
        end: 7,
        frameRate: 10,
        repeat: 0
    }
};

export const UNIT_ATLAS_FRAME_ZERO_PAD = 3;
