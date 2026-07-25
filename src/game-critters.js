/**
 * game-critters.js — simple primitive-built bugs and helper robots for the
 * hidden game. Same philosophy as the Kit Chan rig: no external models,
 * just primitives, so the whole game stays lightweight and self-contained.
 */
import * as THREE from 'three';

const BUG_COLORS = [0x8a3a3a, 0x5c4a8a, 0x3a6b4a, 0x8a6f2a];

/**
 * A small critter: rounded body + two antennae + four stub legs. Very low
 * poly since several can be on screen at once. `hp` scales its size a
 * touch so tougher bugs read as tougher at a glance.
 */
export function buildBug({ hp = 1 } = {}) {
    const color = BUG_COLORS[Math.floor(Math.random() * BUG_COLORS.length)];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const matEye = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });

    const scale = 1 + (hp - 1) * 0.22;
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

    const jitterSeed = Math.random() * Math.PI * 2;

    return {
        root,
        hp,
        maxHp: hp,
        /** Idle scurry wiggle — purely cosmetic, no movement logic here. */
        update(t) {
            root.position.y = Math.abs(Math.sin(t * 6 + jitterSeed)) * 0.015;
            root.rotation.y = Math.sin(t * 2 + jitterSeed) * 0.3;
            legs.forEach((leg, i) => {
                leg.rotation.x = Math.sin(t * 10 + jitterSeed + i) * 0.5;
            });
        },
    };
}

/**
 * A small helper robot: box body, dome head, two wheel-stubs, blinking
 * antenna light. Deliberately distinct silhouette from Kit Chan so it
 * reads as "automated helper", not another character.
 */
export function buildRobot() {
    const matBody = new THREE.MeshStandardMaterial({ color: 0x8a94a3, roughness: 0.5, metalness: 0.3 });
    const matAccent = new THREE.MeshStandardMaterial({ color: 0x00d2ff, roughness: 0.3, emissive: 0x00d2ff, emissiveIntensity: 0.4 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.6 });

    const root = new THREE.Group();

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.1), matBody);
    body.position.y = 0.13;
    root.add(body);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.01), matAccent);
    visor.position.set(0, 0.15, 0.051);
    root.add(visor);

    const domeGeo = new THREE.SphereGeometry(0.06, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const dome = new THREE.Mesh(domeGeo, matDark);
    dome.position.y = 0.195;
    root.add(dome);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 4), matDark);
    antenna.position.y = 0.25;
    root.add(antenna);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), matAccent);
    antennaTip.position.y = 0.285;
    root.add(antennaTip);

    const wheelGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10);
    const wheelL = new THREE.Mesh(wheelGeo, matDark);
    wheelL.rotation.z = Math.PI / 2;
    wheelL.position.set(-0.075, 0.045, 0);
    const wheelR = new THREE.Mesh(wheelGeo, matDark);
    wheelR.rotation.z = Math.PI / 2;
    wheelR.position.set(0.075, 0.045, 0);
    root.add(wheelL, wheelR);

    const armGeo = new THREE.CapsuleGeometry(0.018, 0.08, 4, 6);
    const armL = new THREE.Mesh(armGeo, matBody);
    armL.position.set(-0.09, 0.11, 0);
    armL.rotation.z = 0.3;
    const armR = new THREE.Mesh(armGeo, matBody);
    armR.position.set(0.09, 0.11, 0);
    armR.rotation.z = -0.3;
    root.add(armL, armR);

    const seed = Math.random() * Math.PI * 2;

    return {
        root,
        armL, armR,
        /** Idle hover-bob + blinking antenna light. */
        update(t) {
            root.position.y = 0.01 + Math.sin(t * 2 + seed) * 0.008;
            antennaTip.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 4 + seed)) * 0.7;
        },
        /** Quick zap gesture played when it lands a hit on a bug. */
        playZap() {
            armL.rotation.z = -0.9;
            armR.rotation.z = 0.9;
            setTimeout(() => {
                armL.rotation.z = 0.3;
                armR.rotation.z = -0.3;
            }, 200);
        },
    };
}
