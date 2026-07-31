/**
 * game-critters.js — low-poly primitive-built enemies, projectiles and
 * pickups for the hidden survival game. Same philosophy as the Kit Chan
 * rig: no external models, just primitives, so the whole game stays
 * lightweight and self-contained.
 *
 * Enemy builders all return { root, update(t), playHit() }. `update` just
 * drives cosmetic idle animation (bob/wiggle/flutter); game.js positions and
 * rotates `root` externally each frame based on actual movement/facing.
 * Disposal of GPU resources (geometry/material) is handled generically by
 * game.js via a traversal helper, not per-builder.
 */
import * as THREE from 'three';

function flashOnHit(meshes, baseColors) {
    let flashUntil = 0;
    return {
        trigger(now) { flashUntil = now + 90; },
        apply(now) {
            const lit = now < flashUntil;
            meshes.forEach((m, i) => {
                m.material.emissive?.setHex(lit ? 0xffffff : (baseColors[i] ?? 0x000000));
                if (m.material.emissiveIntensity !== undefined) m.material.emissiveIntensity = lit ? 0.9 : (m.userData.baseEmissive ?? 0);
            });
        },
    };
}

// ---------------------------------------------------------------------
// Enemy: Walker Bug — the baseline critter. Rounded body, antennae, legs.
// ---------------------------------------------------------------------
const BUG_COLORS = [0x8a3a3a, 0x5c4a8a, 0x3a6b4a, 0x8a6f2a];
export function buildWalkerBug({ scale = 4.0 } = {}) {
    const color = BUG_COLORS[Math.floor(Math.random() * BUG_COLORS.length)];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive: 0x000000 });
    const matEye = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });

    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.09 * scale, 8, 6), mat);
    body.scale.set(1, 0.7, 1.15);
    body.position.y = 0.06 * scale;
    root.add(body);

    const eyeGeo = new THREE.SphereGeometry(0.018 * scale, 6, 5);
    const eyeL = new THREE.Mesh(eyeGeo, matEye);
    eyeL.position.set(-0.035 * scale, 0.09 * scale, 0.08 * scale);
    const eyeR = new THREE.Mesh(eyeGeo, matEye);
    eyeR.position.set(0.035 * scale, 0.09 * scale, 0.08 * scale);
    root.add(eyeL, eyeR);

    const antGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.06 * scale, 4);
    const antL = new THREE.Mesh(antGeo, matEye);
    antL.position.set(-0.03 * scale, 0.14 * scale, 0.05 * scale);
    antL.rotation.z = 0.4;
    const antR = new THREE.Mesh(antGeo, matEye);
    antR.position.set(0.03 * scale, 0.14 * scale, 0.05 * scale);
    antR.rotation.z = -0.4;
    root.add(antL, antR);

    const legGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.05 * scale, 4);
    const legs = [];
    for (let i = 0; i < 4; i++) {
        const side = i < 2 ? -1 : 1;
        const front = i % 2 === 0;
        const leg = new THREE.Mesh(legGeo, mat);
        leg.position.set(side * 0.07 * scale, 0.02 * scale, front ? 0.03 * scale : -0.03 * scale);
        leg.rotation.z = side * 0.6;
        root.add(leg);
        legs.push(leg);
    }

    const seed = Math.random() * Math.PI * 2;
    const flash = flashOnHit([body], [color]);
    return {
        root,
        update(t) {
            root.position.y = Math.abs(Math.sin(t * 6 + seed)) * 0.015;
            root.rotation.y = Math.sin(t * 2 + seed) * 0.3;
            legs.forEach((leg, i) => { leg.rotation.x = Math.sin(t * 10 + seed + i) * 0.5; });
            flash.apply(t * 1000);
        },
        playHit() { flash.trigger(performance.now()); },
    };
}

// ---------------------------------------------------------------------
// Enemy: Swarmer Gnat — tiny, fast, flapping wings, spawns in numbers.
// ---------------------------------------------------------------------
export function buildSwarmerGnat({ scale = 4.5 } = {}) {
    const color = 0xb8c94a;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: 0x000000 });
    const matWing = new THREE.MeshStandardMaterial({ color: 0xdfe9f5, roughness: 0.3, transparent: true, opacity: 0.55, side: THREE.DoubleSide });

    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.05 * scale, 6, 5), mat);
    body.position.y = 0.05 * scale;
    body.scale.set(1, 1, 1.3);
    root.add(body);

    const wingGeo = new THREE.PlaneGeometry(0.09 * scale, 0.05 * scale);
    const wingL = new THREE.Mesh(wingGeo, matWing);
    wingL.position.set(-0.03 * scale, 0.075 * scale, 0);
    const wingR = new THREE.Mesh(wingGeo, matWing);
    wingR.position.set(0.03 * scale, 0.075 * scale, 0);
    root.add(wingL, wingR);

    const seed = Math.random() * Math.PI * 2;
    const flash = flashOnHit([body], [color]);
    return {
        root,
        update(t) {
            root.position.y = 0.03 * scale + Math.sin(t * 14 + seed) * 0.02;
            wingL.rotation.y = Math.sin(t * 40 + seed) * 0.9;
            wingR.rotation.y = -Math.sin(t * 40 + seed) * 0.9;
            // root.rotation.y (facing) is set externally by game.js, not here.
            flash.apply(t * 1000);
        },
        playHit() { flash.trigger(performance.now()); },
    };
}

// ---------------------------------------------------------------------
// Enemy: Tank Roach — big, slow, armored shell, heavy footfalls.
// ---------------------------------------------------------------------
export function buildTankRoach({ scale = 6.3 } = {}) {
    const colorShell = 0x4a2e1f;
    const matShell = new THREE.MeshStandardMaterial({ color: colorShell, roughness: 0.5, metalness: 0.15, emissive: 0x000000 });
    const matBelly = new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.8 });

    const root = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.1 * scale, 10, 7), matShell);
    shell.scale.set(1.15, 0.6, 1.5);
    shell.position.y = 0.08 * scale;
    root.add(shell);

    const ridgeGeo = new THREE.BoxGeometry(0.02 * scale, 0.03 * scale, 0.1 * scale);
    for (let i = 0; i < 3; i++) {
        const ridge = new THREE.Mesh(ridgeGeo, matShell);
        ridge.position.set(0, 0.12 * scale, -0.04 * scale + i * 0.06 * scale);
        root.add(ridge);
    }

    const legGeo = new THREE.CylinderGeometry(0.012 * scale, 0.01 * scale, 0.08 * scale, 5);
    const legs = [];
    for (let i = 0; i < 6; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2) - 1;
        const leg = new THREE.Mesh(legGeo, matBelly);
        leg.position.set(side * 0.1 * scale, 0.02 * scale, row * 0.05 * scale);
        leg.rotation.z = side * 0.7;
        root.add(leg);
        legs.push(leg);
    }

    const seed = Math.random() * Math.PI * 2;
    const flash = flashOnHit([shell], [colorShell]);
    return {
        root,
        update(t) {
            root.position.y = Math.abs(Math.sin(t * 3 + seed)) * 0.012;
            root.rotation.y = Math.sin(t * 1 + seed) * 0.12;
            legs.forEach((leg, i) => { leg.rotation.x = Math.sin(t * 4.5 + seed + i * 0.8) * 0.4; });
            flash.apply(t * 1000);
        },
        playHit() { flash.trigger(performance.now()); },
    };
}

// ---------------------------------------------------------------------
// Enemy: Shooter Wasp — keeps its distance, lobs a projectile at intervals.
// ---------------------------------------------------------------------
export function buildShooterWasp({ scale = 4.2 } = {}) {
    const matBody = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.6, emissive: 0x000000 });
    const matStripe = new THREE.MeshStandardMaterial({ color: 0xe8c23a, roughness: 0.5 });
    const matWing = new THREE.MeshStandardMaterial({ color: 0xdfe9f5, roughness: 0.3, transparent: true, opacity: 0.5, side: THREE.DoubleSide });

    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.045 * scale, 0.08 * scale, 4, 8), matBody);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.09 * scale;
    root.add(body);

    for (let i = 0; i < 2; i++) {
        const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.046 * scale, 0.012 * scale, 6, 10), matStripe);
        stripe.rotation.y = Math.PI / 2;
        stripe.position.set(0, 0.09 * scale, -0.02 * scale + i * 0.035 * scale);
        root.add(stripe);
    }

    const wingGeo = new THREE.PlaneGeometry(0.12 * scale, 0.06 * scale);
    const wingL = new THREE.Mesh(wingGeo, matWing);
    wingL.position.set(-0.03 * scale, 0.13 * scale, 0);
    const wingR = new THREE.Mesh(wingGeo, matWing);
    wingR.position.set(0.03 * scale, 0.13 * scale, 0);
    root.add(wingL, wingR);

    const stinger = new THREE.Mesh(new THREE.ConeGeometry(0.014 * scale, 0.05 * scale, 6), matBody);
    stinger.rotation.x = Math.PI / 2;
    stinger.position.set(0, 0.09 * scale, -0.07 * scale);
    root.add(stinger);

    const seed = Math.random() * Math.PI * 2;
    const flash = flashOnHit([body], [0x2a2118]);
    return {
        root,
        update(t) {
            root.position.y = 0.03 * scale + Math.sin(t * 5 + seed) * 0.02;
            wingL.rotation.y = Math.sin(t * 35 + seed) * 0.7;
            wingR.rotation.y = -Math.sin(t * 35 + seed) * 0.7;
            flash.apply(t * 1000);
        },
        playHit() { flash.trigger(performance.now()); },
    };
}

// ---------------------------------------------------------------------
// Enemy: Elite Boss ("Merge Conflict") — big, spiked, pulsing glow.
// ---------------------------------------------------------------------
export function buildEliteBoss({ scale = 7.4 } = {}) {
    const color = 0x8a1f3a;
    const matBody = new THREE.MeshStandardMaterial({ color, roughness: 0.45, emissive: 0x4a0f1c, emissiveIntensity: 0.5 });
    matBody.userData.baseEmissive = 0.5;
    const matEye = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 1.2, roughness: 0.3 });
    const matSpike = new THREE.MeshStandardMaterial({ color: 0x2a0f14, roughness: 0.6 });

    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.13 * scale, 12, 8), matBody);
    body.scale.set(1, 0.8, 1.2);
    body.position.y = 0.11 * scale;
    root.add(body);

    const eyeGeo = new THREE.SphereGeometry(0.022 * scale, 6, 5);
    const eyeL = new THREE.Mesh(eyeGeo, matEye);
    eyeL.position.set(-0.05 * scale, 0.15 * scale, 0.1 * scale);
    const eyeR = new THREE.Mesh(eyeGeo, matEye);
    eyeR.position.set(0.05 * scale, 0.15 * scale, 0.1 * scale);
    root.add(eyeL, eyeR);

    const spikeGeo = new THREE.ConeGeometry(0.02 * scale, 0.07 * scale, 5);
    for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(spikeGeo, matSpike);
        const a = (i / 5) * Math.PI - Math.PI / 2;
        spike.position.set(Math.sin(a) * 0.09 * scale, 0.2 * scale, Math.cos(a) * 0.05 * scale - 0.02 * scale);
        spike.rotation.x = -0.3;
        root.add(spike);
    }

    const legGeo = new THREE.CylinderGeometry(0.014 * scale, 0.012 * scale, 0.09 * scale, 5);
    const legs = [];
    for (let i = 0; i < 4; i++) {
        const side = i < 2 ? -1 : 1;
        const front = i % 2 === 0;
        const leg = new THREE.Mesh(legGeo, matSpike);
        leg.position.set(side * 0.1 * scale, 0.03 * scale, front ? 0.05 * scale : -0.05 * scale);
        leg.rotation.z = side * 0.6;
        root.add(leg);
        legs.push(leg);
    }

    const seed = Math.random() * Math.PI * 2;
    const flash = flashOnHit([body], [color]);
    return {
        root,
        update(t) {
            root.position.y = Math.abs(Math.sin(t * 2.5 + seed)) * 0.02;
            root.rotation.y = Math.sin(t * 0.8 + seed) * 0.15;
            legs.forEach((leg, i) => { leg.rotation.x = Math.sin(t * 3.5 + seed + i) * 0.45; });
            matBody.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 2)) * 0.35;
            matEye.emissiveIntensity = 0.9 + Math.abs(Math.sin(t * 5)) * 0.6;
            flash.apply(t * 1000);
        },
        playHit() { flash.trigger(performance.now()); },
    };
}

export const ENEMY_BUILDERS = {
    walker: buildWalkerBug,
    swarmer: buildSwarmerGnat,
    tank: buildTankRoach,
    shooter: buildShooterWasp,
    elite: buildEliteBoss,
};

// ---------------------------------------------------------------------
// Helper robot / drone — deployable weapon visual, hover + arm zap.
// ---------------------------------------------------------------------
export function buildDrone() {
    const matBody = new THREE.MeshStandardMaterial({ color: 0x8a94a3, roughness: 0.5, metalness: 0.3 });
    const matAccent = new THREE.MeshStandardMaterial({ color: 0x00d2ff, roughness: 0.3, emissive: 0x00d2ff, emissiveIntensity: 0.4 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.6 });

    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.462, 0.462, 0.336), matBody);
    body.position.y = 0.546;
    root.add(body);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.336, 0.1, 0.042), matAccent);
    visor.position.set(0, 0.63, 0.172);
    root.add(visor);

    const domeGeo = new THREE.SphereGeometry(0.21, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const dome = new THREE.Mesh(domeGeo, matDark);
    dome.position.y = 0.777;
    root.add(dome);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.21, 4), matDark);
    antenna.position.y = 0.966;
    root.add(antenna);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 6), matAccent);
    antennaTip.position.y = 1.092;
    root.add(antennaTip);

    const armGeo = new THREE.CapsuleGeometry(0.063, 0.252, 4, 6);
    const armL = new THREE.Mesh(armGeo, matBody);
    armL.position.set(-0.315, 0.462, 0);
    armL.rotation.z = 0.3;
    const armR = new THREE.Mesh(armGeo, matBody);
    armR.position.set(0.315, 0.462, 0);
    armR.rotation.z = -0.3;
    root.add(armL, armR);

    const seed = Math.random() * Math.PI * 2;
    return {
        root,
        update(t) {
            root.position.y = 0.21 + Math.sin(t * 2 + seed) * 0.042;
            root.rotation.y = t * 0.6 + seed;
            antennaTip.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 4 + seed)) * 0.7;
        },
        playZap() {
            armL.rotation.z = -0.9;
            armR.rotation.z = 0.9;
            setTimeout(() => { armL.rotation.z = 0.3; armR.rotation.z = -0.3; }, 150);
        },
    };
}

// ---------------------------------------------------------------------
// Weapon visuals: orbit blade, nova ring, bullet, shotgun pellet.
// ---------------------------------------------------------------------
export function buildOrbitBlade() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x00d2ff, emissive: 0x00d2ff, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3 });
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.225, 0), mat);
    mesh.scale.set(1, 1, 1.8);
    return mesh;
}

export function buildBulletMesh() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x00d2ff, emissive: 0x00d2ff, emissiveIntensity: 0.7 });
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.15, 3, 6), mat);
    return mesh;
}

export function buildPelletMesh() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff2d7e, emissive: 0xff2d7e, emissiveIntensity: 0.6 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), mat);
    return mesh;
}

export function buildWaspBoltMesh() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8c23a, emissive: 0xe8c23a, emissiveIntensity: 0.6 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), mat);
    return mesh;
}

export function buildNovaRing() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2d7e, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.01, 0.03, 32), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    return mesh;
}

export function buildXpOrb() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x39ffb0, emissive: 0x39ffb0, emissiveIntensity: 0.8, roughness: 0.3 });
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mat);
    mesh.position.y = 0.2;
    root.add(mesh);
    const seed = Math.random() * Math.PI * 2;
    return {
        root,
        update(t) {
            root.position.y = 0; // kept flat, only the inner mesh bobs/spins
            mesh.rotation.y = t * 2 + seed;
            mesh.position.y = 0.16 + Math.sin(t * 3 + seed) * 0.048;
        },
    };
}

// ---------------------------------------------------------------------
// Arena obstacles: solid pillar ("wall") and floor gap ("hole"). Purely
// visual — game-obstacles.js owns the actual collision math, keyed on the
// same radius passed in here.
// ---------------------------------------------------------------------
export function buildWallObstacle(radius) {
    const height = 0.95;
    const matBody = new THREE.MeshStandardMaterial({ color: 0x22303f, roughness: 0.75, metalness: 0.1 });
    const matTrim = new THREE.MeshStandardMaterial({ color: 0x00d2ff, emissive: 0x00d2ff, emissiveIntensity: 0.35, roughness: 0.4 });

    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.05, height, 16), matBody);
    body.position.y = height / 2;
    root.add(body);

    const trim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.98, radius * 0.05, 8, 24), matTrim);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = height * 0.94;
    root.add(trim);

    return { root, update() { /* static — nothing to animate */ } };
}

export function buildHoleObstacle(radius) {
    const matPit = new THREE.MeshStandardMaterial({ color: 0x030608, roughness: 1 });
    const matRim = new THREE.MeshStandardMaterial({ color: 0xff2d7e, emissive: 0xff2d7e, emissiveIntensity: 0.4, roughness: 0.5 });

    const root = new THREE.Group();
    const pit = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), matPit);
    pit.rotation.x = -Math.PI / 2;
    pit.position.y = -0.02;
    root.add(pit);

    const rim = new THREE.Mesh(new THREE.RingGeometry(radius * 0.94, radius, 24), matRim);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.005;
    root.add(rim);

    return { root, update() { /* static — nothing to animate */ } };
}
