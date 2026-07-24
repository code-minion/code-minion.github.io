/**
 * kit-chan-character.js — procedural low-poly rig, ported from the design
 * handoff (Kit Chan 3D Baseline). Pure Three.js, no external model file —
 * every part is built from primitive geometry, same approach as the 2D
 * mascot. Poses: idle | walk | sit | guard | wave.
 */
import * as THREE from 'three';

const AUTO_REVERT_MS = { wave: 2200, guard: 0 };

export function buildKitChanCharacter({ hoodieColor = 0x7C93A6, wearHeadphones = true } = {}) {
    const mkMat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.78, metalness: 0.04 }, extra));

    const matSkin = mkMat(0xC9A98D);
    const matHair = mkMat(0x4A3826);
    const matHoodie = mkMat(hoodieColor);
    const matHoodieDark = mkMat(0x556B7E);
    const matPants = mkMat(0x445A6B);
    const matShoe = mkMat(0x27221C);
    const matGlasses = mkMat(0x2A2118);
    const matHeadphone = mkMat(0x2C2822);
    const matStripe = mkMat(0xE9E4D8);
    const matHoodInner = mkMat(0x455A6C, { side: THREE.DoubleSide });
    const matMouthInside = mkMat(0x241410, { roughness: 0.9 });

    const root = new THREE.Group(); root.name = 'KitChanBaseline';

    // ---- Head ----
    const head = new THREE.Group(); head.name = 'Head'; head.position.y = 0.78;
    const r = 0.185;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), matSkin);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.4), matHair);

    const eyeDirX = 0.34;
    const eyeDirZ = Math.sqrt(1 - eyeDirX * eyeDirX);
    const dirL = new THREE.Vector3(-eyeDirX, 0, eyeDirZ);
    const dirR = new THREE.Vector3(eyeDirX, 0, eyeDirZ);
    const quatFromDir = (dir) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

    const eyeGeo = new THREE.SphereGeometry(r * 0.075, 10, 8);
    const eyeL = new THREE.Mesh(eyeGeo, matGlasses);
    eyeL.position.copy(dirL).multiplyScalar(r * 0.97);
    const eyeR = new THREE.Mesh(eyeGeo, matGlasses);
    eyeR.position.copy(dirR).multiplyScalar(r * 0.97);

    const glassesR = r * 1.03;
    const frameGeo = new THREE.TorusGeometry(r * 0.19, r * 0.025, 8, 20);
    const frameL = new THREE.Mesh(frameGeo, matGlasses);
    frameL.position.copy(dirL).multiplyScalar(glassesR);
    frameL.quaternion.copy(quatFromDir(dirL));
    const frameR = new THREE.Mesh(frameGeo, matGlasses);
    frameR.position.copy(dirR).multiplyScalar(glassesR);
    frameR.quaternion.copy(quatFromDir(dirR));
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(r * 0.22, r * 0.03, r * 0.03), matGlasses);
    bridge.position.set(0, 0, glassesR);
    const templeGeo = new THREE.BoxGeometry(r * 0.22, r * 0.025, r * 0.025);
    const templeL = new THREE.Mesh(templeGeo, matGlasses);
    templeL.position.set(-r * 0.55, 0.01, r * 0.78); templeL.rotation.y = 0.5;
    const templeR = new THREE.Mesh(templeGeo, matGlasses);
    templeR.position.set(r * 0.55, 0.01, r * 0.78); templeR.rotation.y = -0.5;

    const browDirX = 0.34, browDirY = 0.25;
    const browDirZ = Math.sqrt(Math.max(1 - browDirX * browDirX - browDirY * browDirY, 0.0001));
    const browDirL = new THREE.Vector3(-browDirX, browDirY, browDirZ);
    const browDirR = new THREE.Vector3(browDirX, browDirY, browDirZ);
    const browGeo = new THREE.BoxGeometry(r * 0.26, r * 0.045, r * 0.03);
    const browL = new THREE.Mesh(browGeo, matHair);
    browL.position.copy(browDirL).multiplyScalar(r * 1.06);
    browL.quaternion.copy(quatFromDir(browDirL));
    browL.rotateZ(0.12);
    const browR = new THREE.Mesh(browGeo, matHair);
    browR.position.copy(browDirR).multiplyScalar(r * 1.06);
    browR.quaternion.copy(quatFromDir(browDirR));
    browR.rotateZ(-0.12);

    const headphoneGroup = new THREE.Group(); headphoneGroup.name = 'Headphones';
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, r * 0.09, 8, 24, Math.PI), matHeadphone);
    const earGeo = new THREE.CylinderGeometry(r * 0.28, r * 0.28, r * 0.16, 14);
    const earL = new THREE.Mesh(earGeo, matHeadphone);
    earL.rotation.z = Math.PI / 2; earL.position.set(-r * 1.05, 0, 0);
    const earR = new THREE.Mesh(earGeo, matHeadphone);
    earR.rotation.z = Math.PI / 2; earR.position.set(r * 1.05, 0, 0);
    headphoneGroup.add(band, earL, earR);
    headphoneGroup.visible = wearHeadphones !== false;

    const mouthDirY = -0.5;
    const mouthDirZ = Math.sqrt(1 - mouthDirY * mouthDirY);
    const mouthDir = new THREE.Vector3(0, mouthDirY, mouthDirZ);
    const mouthGeo = new THREE.TorusGeometry(r * 0.22, r * 0.035, 8, 16, Math.PI);
    const mouth = new THREE.Mesh(mouthGeo, matGlasses);
    mouth.position.copy(mouthDir).multiplyScalar(r * 1.02);
    mouth.quaternion.copy(quatFromDir(mouthDir));
    mouth.rotateZ(Math.PI);

    const mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(r * 0.21, 12, 8), matMouthInside);
    mouthOpen.position.copy(mouthDir).multiplyScalar(r * 1.0);
    mouthOpen.quaternion.copy(quatFromDir(mouthDir));
    mouthOpen.scale.set(1, 0.16, 0.32);
    mouthOpen.visible = false;

    head.add(skull, hair, eyeL, eyeR, frameL, frameR, bridge, templeL, templeR, browL, browR, mouth, mouthOpen, headphoneGroup);

    // ---- Torso ----
    const torsoYaw = new THREE.Group(); torsoYaw.name = 'TorsoYaw';
    const torso = new THREE.Group(); torso.name = 'Torso';
    const torsoBaseY = 0.225;
    torso.position.y = torsoBaseY;
    const bodyH = 0.34;
    const hoodie = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.185, bodyH, 12), matHoodie);
    hoodie.position.y = bodyH / 2;

    const stringLen = bodyH * 0.5;
    const stringGeo = new THREE.CylinderGeometry(0.008, 0.008, stringLen, 8);
    const stringTopY = bodyH * 0.95;
    const stringL = new THREE.Mesh(stringGeo, matStripe);
    stringL.position.set(-0.022, stringTopY - stringLen / 2, 0.16);
    stringL.rotation.set(-0.16, 0, 0.05);
    const stringR = new THREE.Mesh(stringGeo, matStripe);
    stringR.position.set(0.022, stringTopY - stringLen / 2, 0.16);
    stringR.rotation.set(-0.16, 0, -0.05);
    const agletGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.022, 8);
    const tipLocal = new THREE.Vector3(0, -stringLen / 2 - 0.008, 0);
    const agletL = new THREE.Mesh(agletGeo, matStripe);
    agletL.position.copy(stringL.position).add(tipLocal.clone().applyEuler(stringL.rotation));
    agletL.quaternion.setFromEuler(stringL.rotation);
    const agletR = new THREE.Mesh(agletGeo, matStripe);
    agletR.position.copy(stringR.position).add(tipLocal.clone().applyEuler(stringR.rotation));
    agletR.quaternion.setFromEuler(stringR.rotation);

    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), matHoodInner);
    hood.rotation.x = Math.PI - 0.32; hood.scale.set(1.05, 0.8, 1.15);
    hood.position.set(0, bodyH * 0.86, -0.108);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 16), matHoodieDark);
    collar.rotation.x = Math.PI / 2; collar.position.y = bodyH * 0.96;

    const makeArm = (side) => {
        const shoulder = new THREE.Group();
        shoulder.position.set(side * 0.195, bodyH * 0.86, 0);
        const upperLen = 0.13;
        const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, upperLen, 4, 8), matHoodie);
        upperArm.position.y = -upperLen / 2 - 0.015;
        shoulder.add(upperArm);

        const elbow = new THREE.Group();
        elbow.position.y = -upperLen - 0.03;
        shoulder.add(elbow);

        const forearmLen = 0.12;
        const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, forearmLen, 4, 8), matHoodie);
        forearm.position.y = -forearmLen / 2 - 0.01;
        elbow.add(forearm);

        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), matSkin);
        hand.position.y = -forearmLen - 0.045;
        elbow.add(hand);

        return { shoulder, elbow, upperArm, forearm, hand };
    };
    const armPartsL = makeArm(-1), armPartsR = makeArm(1);

    torso.add(hoodie, stringL, stringR, agletL, agletR, hood, collar, armPartsL.shoulder, armPartsR.shoulder);

    // ---- Legs ----
    const hipsPivot = new THREE.Group(); hipsPivot.position.y = torsoBaseY;

    const makeLeg = (side) => {
        const hip = new THREE.Group();
        hip.position.set(side * 0.07, 0, 0);
        const upperLen = 0.18;
        const upperLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, upperLen * 0.6, 4, 8), matPants);
        upperLeg.position.y = -upperLen / 2;
        hip.add(upperLeg);

        const knee = new THREE.Group();
        knee.position.y = -upperLen;
        hip.add(knee);

        const lowerLen = 0.17;
        const lowerLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, lowerLen * 0.6, 4, 8), matPants);
        lowerLeg.position.y = -lowerLen / 2;
        knee.add(lowerLeg);

        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.14), matShoe);
        shoe.position.set(0, -lowerLen - 0.02, 0.02);
        knee.add(shoe);

        return { hip, knee, upperLeg, lowerLeg, shoe };
    };
    const legPartsL = makeLeg(-1), legPartsR = makeLeg(1);
    hipsPivot.add(legPartsL.hip, legPartsR.hip);

    torsoYaw.add(torso, hipsPivot);
    root.add(head, torsoYaw);
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    root.position.y += size.y / 2;

    const parts = {
        root, head, torsoYaw, torso, hipsPivot, armPartsL, armPartsR, legPartsL, legPartsR,
        mouth, mouthOpen, eyeL, eyeR, matHoodie, headphoneGroup, torsoBaseY,
    };

    // ---- Animation state ----
    const clock = new THREE.Clock();
    let pose = 'idle';
    let talking = false;
    let revertTimer = null;

    function setPose(nextPose, { persistent = false } = {}) {
        clearTimeout(revertTimer);
        pose = nextPose;
        const revertMs = persistent ? 0 : AUTO_REVERT_MS[nextPose];
        if (revertMs) {
            revertTimer = setTimeout(() => { pose = 'idle'; }, revertMs);
        }
    }
    function setTalking(value) { talking = value; }
    function getPose() { return pose; }

    function update() {
        const t = clock.getElapsedTime();
        const p = parts;

        p.head.rotation.y = Math.sin(t * 0.6) * 0.06;
        p.torsoYaw.position.set(0, 0, 0);

        p.torso.rotation.set(0, 0, 0);
        p.hipsPivot.position.set(0, p.torsoBaseY, 0);
        p.armPartsL.shoulder.rotation.set(0, 0, 0);
        p.armPartsR.shoulder.rotation.set(0, 0, 0);
        p.armPartsL.elbow.rotation.set(0, 0, 0);
        p.armPartsR.elbow.rotation.set(0, 0, 0);
        p.legPartsL.hip.rotation.set(0, 0, 0);
        p.legPartsR.hip.rotation.set(0, 0, 0);
        p.legPartsL.knee.rotation.set(0, 0, 0);
        p.legPartsR.knee.rotation.set(0, 0, 0);

        if (pose === 'walk') {
            const speed = 5.5, swing = Math.sin(t * speed);
            p.legPartsL.hip.rotation.x = swing * 0.55;
            p.legPartsR.hip.rotation.x = -swing * 0.55;
            p.legPartsL.knee.rotation.x = Math.max(0, Math.sin(t * speed + Math.PI / 2)) * 0.9;
            p.legPartsR.knee.rotation.x = Math.max(0, Math.sin(t * speed + Math.PI / 2 + Math.PI)) * 0.9;
            p.armPartsL.shoulder.rotation.x = -swing * 0.5;
            p.armPartsR.shoulder.rotation.x = swing * 0.5;
            p.armPartsL.shoulder.rotation.z = -0.24;
            p.armPartsR.shoulder.rotation.z = 0.24;
            p.hipsPivot.position.y = p.torsoBaseY + Math.abs(Math.sin(t * speed)) * 0.012;
            p.torso.rotation.z = swing * 0.03;
        } else if (pose === 'sit') {
            p.legPartsL.hip.rotation.x = -1.4; p.legPartsR.hip.rotation.x = -1.4;
            p.legPartsL.knee.rotation.x = 1.4; p.legPartsR.knee.rotation.x = 1.4;
            p.hipsPivot.position.y = p.torsoBaseY - 0.02;
            p.armPartsL.shoulder.rotation.x = 0.15; p.armPartsR.shoulder.rotation.x = 0.15;
            p.armPartsL.shoulder.rotation.z = -0.22; p.armPartsR.shoulder.rotation.z = 0.22;
            p.armPartsL.elbow.rotation.x = -0.3; p.armPartsR.elbow.rotation.x = -0.3;
            p.torso.rotation.x = 0.05;
        } else if (pose === 'guard') {
            p.armPartsL.shoulder.rotation.set(-1.0, 0, 0.1);
            p.armPartsR.shoulder.rotation.set(-1.0, 0, -0.1);
            p.armPartsL.elbow.rotation.x = -1.3; p.armPartsR.elbow.rotation.x = -1.3;
            p.legPartsL.hip.rotation.x = -0.2; p.legPartsR.hip.rotation.x = 0.15;
            p.legPartsL.knee.rotation.x = 0.25; p.legPartsR.knee.rotation.x = 0.2;
            p.hipsPivot.position.y = p.torsoBaseY - 0.02;
            p.torsoYaw.position.y = Math.sin(t * 3) * 0.006;
        } else if (pose === 'wave') {
            p.armPartsR.shoulder.rotation.x = -2.9;
            p.armPartsR.shoulder.rotation.z = 0.3 + Math.sin(t * 6) * 0.15;
            p.armPartsR.elbow.rotation.x = -0.15;
            p.armPartsL.shoulder.rotation.z = -0.26 + Math.sin(t * 1.1) * 0.02;
        } else {
            p.armPartsL.shoulder.rotation.z = -0.26 + Math.sin(t * 1.1) * 0.02;
            p.armPartsR.shoulder.rotation.z = 0.26 - Math.sin(t * 1.1 + 0.4) * 0.02;
        }

        if (p.mouth && p.mouthOpen) {
            if (talking) {
                p.mouth.visible = false;
                p.mouthOpen.visible = true;
                const openness = Math.max(0, Math.sin(t * 9)) * 0.65 + Math.max(0, Math.sin(t * 3.2 + 1)) * 0.35;
                p.mouthOpen.scale.set(1, 0.16 + openness * 0.7, 0.32 + openness * 0.28);
            } else {
                p.mouth.visible = true;
                p.mouthOpen.visible = false;
                p.mouth.scale.set(1, 0.82 + Math.sin(t * 0.45) * 0.32, 1);
            }
        }
        if (p.eyeL && p.eyeR) {
            const blinkCycle = 3.4, blinkDur = 0.14;
            const bt = t % blinkCycle;
            const blinkScale = bt < blinkDur ? Math.max(0.08, 1 - Math.sin((bt / blinkDur) * Math.PI) * 0.92) : 1;
            p.eyeL.scale.y = blinkScale; p.eyeR.scale.y = blinkScale;
        }
    }

    return { root, parts, setPose, getPose, setTalking, update };
}
