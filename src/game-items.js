/**
 * game-items.js — passive stat items + the level-up choice pool. Pure
 * data/logic (no THREE, no DOM) so game.js can render whatever it likes
 * around these entries. Passive levels live directly on runState.passives
 * (e.g. { speed: 2, might: 1 }); helper getters below turn a level into an
 * actual multiplier/bonus.
 */
import { WEAPON_DEFS, WEAPON_ORDER, MAX_CARRIED_WEAPONS } from './game-weapons.js';

export const PASSIVE_DEFS = {
    speed: {
        id: 'speed', name: 'Standing Desk', icon: '🦿', maxLevel: 3,
        summary: 'Move faster.',
        valueAtLevel(level) { return 1 + level * 0.14; }, // move speed multiplier
        levelDesc(level) { return `+${Math.round(level * 14)}% move speed`; },
    },
    might: {
        id: 'might', name: 'Mechanical Keyboard', icon: '⌨️', maxLevel: 5,
        summary: 'Hit harder with every weapon.',
        valueAtLevel(level) { return 1 + level * 0.12; }, // damage multiplier
        levelDesc(level) { return `+${Math.round(level * 12)}% damage`; },
    },
    armor: {
        id: 'armor', name: 'Rubber Duck Shield', icon: '🛡️', maxLevel: 3,
        summary: 'Shrug off some contact damage.',
        valueAtLevel(level) { return level; }, // flat damage reduction
        levelDesc(level) { return `-${level} contact damage taken`; },
    },
    magnet: {
        id: 'magnet', name: 'Merge Magnet', icon: '🧲', maxLevel: 3,
        summary: 'Pull in XP orbs from farther away.',
        valueAtLevel(level) { return 0.45 + level * 0.52; }, // pickup radius
        levelDesc(level) { return `+${Math.round(level * 16)}% pickup radius`; },
    },
    vitality: {
        id: 'vitality', name: 'Second Wind', icon: '☕', maxLevel: 5,
        summary: 'More max HP, and a full heal right now.',
        valueAtLevel(level) { return level * 20; }, // max HP bonus
        levelDesc(level) { return `+${level * 20} max HP`; },
    },
    cooldown: {
        id: 'cooldown', name: 'Code Generator', icon: '⚡', maxLevel: 4,
        summary: 'All weapons recharge faster.',
        valueAtLevel(level) { return Math.max(0.55, 1 - level * 0.1); }, // cooldown multiplier
        levelDesc(level) { return `-${Math.round(level * 10)}% cooldowns`; },
    },
    area: {
        id: 'area', name: 'Bigger Monitor', icon: '🖥️', maxLevel: 3,
        summary: 'Bigger blasts, wider blades.',
        valueAtLevel(level) { return 1 + level * 0.14; }, // area multiplier
        levelDesc(level) { return `+${Math.round(level * 14)}% area`; },
    },
};

export function defaultPassives() {
    return { speed: 0, might: 0, armor: 0, magnet: 0, vitality: 0, cooldown: 0, area: 0 };
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Builds up to `count` distinct level-up choices for the current run.
 * Each choice: { kind, id, name, icon, desc, apply(runState) }.
 * Falls back to a flat currency bonus if everything is already maxed.
 */
export function buildLevelUpChoices(runState, count = 3) {
    const pool = [];

    for (const weaponId of WEAPON_ORDER) {
        const def = WEAPON_DEFS[weaponId];
        const owned = runState.weapons.find(w => w.id === weaponId);
        if (owned) {
            if (owned.level < def.maxLevel) {
                pool.push({
                    kind: 'weapon-upgrade', id: weaponId,
                    name: `${def.name} — Lv.${owned.level + 1}`, icon: def.icon,
                    desc: def.levelDesc(owned.level + 1),
                    apply(rs) { rs.weapons.find(w => w.id === weaponId).level += 1; },
                });
            }
        } else if (runState.weapons.length < MAX_CARRIED_WEAPONS) {
            pool.push({
                kind: 'weapon-new', id: weaponId,
                name: `New: ${def.name}`, icon: def.icon,
                desc: def.summary,
                apply(rs) { rs.weapons.push({ id: weaponId, level: 1, cooldownMs: 0 }); },
            });
        }
    }

    for (const passiveId of Object.keys(PASSIVE_DEFS)) {
        const def = PASSIVE_DEFS[passiveId];
        const level = runState.passives[passiveId] || 0;
        if (level < def.maxLevel) {
            pool.push({
                kind: 'passive', id: passiveId,
                name: `${def.name} — Lv.${level + 1}`, icon: def.icon,
                desc: def.levelDesc(level + 1),
                apply(rs) {
                    rs.passives[passiveId] = (rs.passives[passiveId] || 0) + 1;
                    if (passiveId === 'vitality') rs.healOnNextApply = true;
                },
            });
        }
    }

    shuffle(pool);
    const picks = pool.slice(0, count);
    while (picks.length < count) {
        picks.push({
            kind: 'bonus', id: 'bonus-commits',
            name: 'Bonus Commits', icon: '💰',
            desc: '+25 Commits, banked for the lobby shop.',
            apply(rs) { rs.bonusCommits = (rs.bonusCommits || 0) + 25; },
        });
    }
    return picks;
}
