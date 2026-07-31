/**
 * game-obstacles.js — static arena obstacles for the survival game. Pure
 * 2D (x/z) logic, no THREE, so it's testable the same way as the other
 * data/logic modules.
 *
 * Two kinds:
 *  - "wall": solid pillar. Blocks ground movers, flying movers, AND
 *    projectiles (both player and enemy).
 *  - "hole": a gap in the floor. Blocks ground movers only — flying
 *    enemies and every projectile pass straight over it.
 */

export const OBSTACLE_KIND = { WALL: 'wall', HOLE: 'hole' };

function dist(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

export function blocksGround() { return true; } // both kinds block ground movers
export function blocksFlying(o) { return o.kind === OBSTACLE_KIND.WALL; }
export function blocksProjectile(o) { return o.kind === OBSTACLE_KIND.WALL; }

/**
 * Scatter walls/holes inside the arena, away from the center (player start)
 * and from each other. Best-effort placement — if a spot can't be found
 * after a few tries it's just skipped, so a crowded arena never hangs.
 */
export function generateObstacles(arenaRadius, {
    wallCount = 7,
    holeCount = 4,
    minGapFromCenter = 2.2,
    minGapBetween = 1.2,
} = {}) {
    const obstacles = [];
    function tryPlace(kind, radius, maxAttempts = 30) {
        for (let i = 0; i < maxAttempts; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = minGapFromCenter + Math.random() * Math.max(0.1, arenaRadius * 0.82 - minGapFromCenter);
            const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
            const ok = obstacles.every(o => dist(x, z, o.x, o.z) >= o.radius + radius + minGapBetween);
            if (ok) { obstacles.push({ id: obstacles.length, kind, x, z, radius }); return; }
        }
    }
    for (let i = 0; i < wallCount; i++) tryPlace(OBSTACLE_KIND.WALL, 0.45 + Math.random() * 0.35);
    for (let i = 0; i < holeCount; i++) tryPlace(OBSTACLE_KIND.HOLE, 0.55 + Math.random() * 0.4);
    return obstacles;
}

/**
 * Hard position correction ("slide"): pushes (x,z) out of any obstacle it's
 * penetrating, for the given mover radius. Used every frame as a safety net
 * for both the player (primary collision response) and enemies (cleanup
 * after steering, in case steering wasn't enough).
 */
export function resolveCollision(x, z, radius, obstacles, { flying = false } = {}) {
    let nx = x, nz = z;
    for (const o of obstacles) {
        if (flying ? !blocksFlying(o) : !blocksGround(o)) continue;
        const dx = nx - o.x, dz = nz - o.z;
        const d = Math.hypot(dx, dz);
        const minD = o.radius + radius;
        if (d >= minD) continue;
        if (d > 1e-6) {
            const push = minD - d;
            nx += (dx / d) * push;
            nz += (dz / d) * push;
        } else {
            nx += minD;
        }
    }
    return { x: nx, z: nz };
}

/**
 * Soft steering: given a mover at (x,z) wanting to travel in unit direction
 * (dirX,dirZ), deflect that direction around any blocking obstacle ahead of
 * it within `lookahead` units, so autonomous movers curve around obstacles
 * instead of just walking into them and sliding. Not real pathfinding —
 * just enough local avoidance to look intentional for a handful of static
 * obstacles.
 */
export function steerAroundObstacles(x, z, dirX, dirZ, obstacles, moverRadius, { flying = false, lookahead = 1.0 } = {}) {
    let outX = dirX, outZ = dirZ;
    for (const o of obstacles) {
        if (flying ? !blocksFlying(o) : !blocksGround(o)) continue;
        const toObsX = o.x - x, toObsZ = o.z - z;
        const distToObs = Math.hypot(toObsX, toObsZ);
        const combined = o.radius + moverRadius;
        if (distToObs > lookahead + combined) continue;
        const dot = toObsX * dirX + toObsZ * dirZ;
        if (dot <= 0) continue; // obstacle isn't ahead of us
        const cross = toObsX * dirZ - toObsZ * dirX;
        const perp = Math.abs(cross);
        if (perp >= combined) continue; // current heading already clears it
        const side = cross >= 0 ? -1 : 1;
        const strength = (combined - perp) / combined;
        outX += -dirZ * side * strength * 1.4;
        outZ += dirX * side * strength * 1.4;
    }
    const len = Math.hypot(outX, outZ);
    if (len < 1e-6) return { x: dirX, z: dirZ };
    return { x: outX / len, z: outZ / len };
}
