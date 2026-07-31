/**
 * game-weapons.js — weapon data table for the hidden survival game.
 * Pure data/math, no THREE and no DOM: each entry exposes stats(level) so
 * game.js can decide timing/damage/shape, then build whatever visual it
 * needs via game-critters.js builders. Keeping this side free of rendering
 * concerns makes the balance easy to read and tweak in one place.
 */

export const WEAPON_DEFS = {
    bullet: {
        id: 'bullet',
        name: 'Bullet Shooter',
        icon: '🔫',
        maxLevel: 8,
        summary: 'Auto-fires at the nearest bug.',
        stats(level) {
            return {
                damage: 3 + level * 2,
                cooldownMs: Math.max(220, 900 - level * 70),
                count: level >= 8 ? 2 : 1,
                pierce: level >= 5 ? 1 : 0,
                speed: 8.5,
                range: 5.5,
            };
        },
        levelDesc(level) {
            const s = this.stats(level);
            const bits = [`${s.damage} dmg`, `${(1000 / s.cooldownMs).toFixed(1)}/s`];
            if (s.pierce) bits.push(`pierce ${s.pierce}`);
            if (s.count > 1) bits.push(`x${s.count} shots`);
            return bits.join(' · ');
        },
    },
    orbit: {
        id: 'orbit',
        name: 'Orbit Blades',
        icon: '🗡️',
        maxLevel: 6,
        summary: 'Spinning blades that shred anything they touch.',
        stats(level) {
            return {
                damage: 4 + level * 2,
                count: level,
                radius: 1.04 + level * 0.114,
                rotSpeed: 2.0 + level * 0.15,
                hitTickMs: 350,
            };
        },
        levelDesc(level) {
            const s = this.stats(level);
            return `${s.count} blade${s.count > 1 ? 's' : ''} · ${s.damage} dmg`;
        },
    },
    nova: {
        id: 'nova',
        name: 'Nova Pulse',
        icon: '💥',
        maxLevel: 6,
        summary: 'Periodic shockwave, damages everything nearby.',
        stats(level) {
            return {
                damage: 5 + level * 3,
                radius: 1.625 + level * 0.26,
                cooldownMs: Math.max(1300, 3200 - level * 260),
            };
        },
        levelDesc(level) {
            const s = this.stats(level);
            return `${s.damage} dmg · r${s.radius.toFixed(2)} every ${(s.cooldownMs / 1000).toFixed(1)}s`;
        },
    },
    shotgun: {
        id: 'shotgun',
        name: 'Shotgun Spread',
        icon: '💢',
        maxLevel: 6,
        summary: 'A cone of pellets toward the nearest bug.',
        stats(level) {
            return {
                pelletCount: 3 + level,
                damage: 2 + level,
                spreadRad: (28 + level * 3) * (Math.PI / 180),
                cooldownMs: Math.max(850, 1800 - level * 110),
                speed: 7.5,
                range: 3.75,
            };
        },
        levelDesc(level) {
            const s = this.stats(level);
            return `${s.pelletCount} pellets · ${s.damage} dmg each`;
        },
    },
    drone: {
        id: 'drone',
        name: 'Drone Turret',
        icon: '🤖',
        maxLevel: 3,
        summary: 'Deploys hovering drones that zap on their own.',
        stats(level) {
            return {
                droneCount: level,
                damage: 4 + level * 2,
                cooldownMs: Math.max(650, 1200 - level * 130),
                range: 4.2,
            };
        },
        levelDesc(level) {
            const s = this.stats(level);
            return `${s.droneCount} drone${s.droneCount > 1 ? 's' : ''} · ${s.damage} dmg`;
        },
    },
};

export const WEAPON_ORDER = ['bullet', 'orbit', 'nova', 'shotgun', 'drone'];
export const STARTING_WEAPON = 'bullet';
export const MAX_CARRIED_WEAPONS = 5;
