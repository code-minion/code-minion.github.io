/**
 * game-enemies.js — enemy type table + time-based spawn director for the
 * hidden survival game. Kept data-only/behavior-only (no THREE, no DOM) so
 * game.js can own the actual scene objects and just consult this module for
 * "what should exist right now and how tough is it".
 */

export const VICTORY_TIME_SEC = 5 * 60;
export const MAX_ENEMIES = 46;
const ELITE_FIRST_AT_SEC = 35;
const ELITE_INTERVAL_SEC = 45;

// Spatial values below are pre-scaled by WORLD_SCALE (~3.25x, matching the
// arena growing from radius 2.0 -> 6.5) so distances/speeds/hitboxes stay
// coherent with the rest of the arena. isFlying enemies ignore "hole"
// obstacles (they only get blocked by solid walls).
//
// contactTickMs: min gap between contact-damage ticks while overlapping the player.
// ranged: present only on enemies that keep distance and lob a projectile instead of (or in addition to) contact damage.
export const ENEMY_TYPES = {
    walker: {
        id: 'walker', name: 'Bug', builder: 'walker',
        baseHp: 3, speed: 1.8, contactDamage: 6, contactTickMs: 700,
        xp: 1, radius: 0.4, introAt: 0, weight: 10, isFlying: false,
    },
    swarmer: {
        id: 'swarmer', name: 'Gnat', builder: 'swarmer',
        baseHp: 1, speed: 3.3, contactDamage: 3, contactTickMs: 550,
        xp: 1, radius: 0.36, introAt: 0, weight: 8, isFlying: true,
    },
    tank: {
        id: 'tank', name: 'Roach', builder: 'tank',
        baseHp: 16, speed: 0.9, contactDamage: 13, contactTickMs: 800,
        xp: 4, radius: 0.67, introAt: 55, weight: 4, isFlying: false,
    },
    shooter: {
        id: 'shooter', name: 'Wasp', builder: 'shooter',
        baseHp: 5, speed: 1.8, contactDamage: 4, contactTickMs: 700,
        xp: 3, radius: 0.34, introAt: 80, weight: 5, isFlying: true,
        ranged: { preferredRange: 3.75, projectileSpeed: 4.9, damage: 5, cooldownMs: 2400, radius: 0.15 },
    },
    elite: {
        id: 'elite', name: 'Merge Conflict', builder: 'elite',
        baseHp: 70, speed: 1.2, contactDamage: 20, contactTickMs: 900,
        xp: 25, radius: 0.92, introAt: ELITE_FIRST_AT_SEC, weight: 0, isElite: true, isFlying: false,
    },
};

/** Stat scaling as a run drags on — enemies get tankier and hit harder. */
export function difficultyMul(elapsedSec) {
    const minutes = elapsedSec / 60;
    return { hp: 1 + minutes * 0.4, dmg: 1 + minutes * 0.22 };
}

function eligibleCommon(elapsedSec) {
    return Object.values(ENEMY_TYPES).filter(t => !t.isElite && elapsedSec >= t.introAt);
}

function weightedPick(list) {
    const total = list.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of list) { r -= t.weight; if (r <= 0) return t; }
    return list[list.length - 1];
}

/**
 * Owns spawn pacing only. Call `update(elapsedSec, dtMs, currentCount)` every
 * tick; it returns an array of enemy type ids to spawn this frame (usually
 * empty). Caller is responsible for actually instantiating/positioning them.
 */
export function createSpawnDirector() {
    let spawnTimerMs = 0;
    let eliteTimerSec = 0;
    let eliteSpawned = false;

    return {
        update(elapsedSec, dtMs, currentCount) {
            const toSpawn = [];
            if (currentCount >= MAX_ENEMIES) return toSpawn;

            // Regular trickle, ramping up: interval shrinks and batch size grows over time.
            spawnTimerMs -= dtMs;
            if (spawnTimerMs <= 0) {
                const interval = Math.max(260, 1500 - elapsedSec * 4.2);
                spawnTimerMs = interval;
                const batch = 1 + Math.floor(elapsedSec / 70);
                const pool = eligibleCommon(elapsedSec);
                for (let i = 0; i < batch && currentCount + toSpawn.length < MAX_ENEMIES; i++) {
                    toSpawn.push(weightedPick(pool).id);
                }
            }

            // Elite on its own cadence, one at a time.
            if (elapsedSec >= ELITE_FIRST_AT_SEC) {
                eliteTimerSec += dtMs / 1000;
                const due = eliteSpawned ? eliteTimerSec >= ELITE_INTERVAL_SEC : true;
                if (due) {
                    toSpawn.push('elite');
                    eliteTimerSec = 0;
                    eliteSpawned = true;
                }
            }
            return toSpawn;
        },
    };
}
