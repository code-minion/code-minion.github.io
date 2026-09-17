/**
 * game.js — hidden wave-survival roguelite built around the Kit Chan rig.
 * Lives on its own dedicated page (survivor.html), reached only via the
 * Konami-code redirect on the main site. Fully client-side (localStorage),
 * except an optional high-score ping to Discord after a run ends.
 *
 * Move with WASD/arrows. Weapons auto-fire at nearby bugs. Leveling up
 * offers a choice of new weapons/upgrades. Dying (or surviving 5 minutes)
 * returns you to the lobby with "Commits" to spend on permanent upgrades.
 */
import * as THREE from 'three';
import { buildKitChanCharacter } from './kit-chan-character.js';
import {
    ENEMY_BUILDERS, buildDrone, buildOrbitBlade, buildBulletMesh, buildPelletMesh,
    buildWaspBoltMesh, buildNovaRing, buildXpOrb, buildWallObstacle, buildHoleObstacle,
} from './game-critters.js';
import { ENEMY_TYPES, VICTORY_TIME_SEC, MAX_ENEMIES, difficultyMul, createSpawnDirector } from './game-enemies.js';
import { WEAPON_DEFS, STARTING_WEAPON } from './game-weapons.js';
import { PASSIVE_DEFS, defaultPassives, buildLevelUpChoices } from './game-items.js';
import { generateObstacles, blocksProjectile, resolveCollision, steerAroundObstacles } from './game-obstacles.js';
import { track } from './analytics.js';

const STORAGE_KEY = 'kitchan-survivor-v1';
const HIGHSCORE_ENDPOINT = import.meta.env.VITE_BFF_HIGHSCORE_URL || 'https://llm-bff-psi.vercel.app/api/game-highscore';

// Lightweight request obfuscation, NOT real security — this is public JS, so
// the scheme is readable by anyone who opens dev tools. It only exists to
// filter out the laziest scripted spam (a plain JSON replay won't match the
// server's decoder); it is never a substitute for the server's own
// validation, which stays exactly as strict either way. Keep OBFUSCATE_SHIFT
// and OBFUSCATE_MARKER in sync with repos/llm-bff/api/game-highscore.js.
const OBFUSCATE_SHIFT = 41;
const OBFUSCATE_MARKER = '~KC~';

/** JSON -> UTF-8 bytes -> byte-shift -> random noise prefix -> base64. */
function encodeHighscorePayload(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    const shifted = bytes.map(b => (b + OBFUSCATE_SHIFT) % 256);
    const marker = new TextEncoder().encode(OBFUSCATE_MARKER);
    const noise = crypto.getRandomValues(new Uint8Array(2 + Math.floor(Math.random() * 6)));
    const combined = new Uint8Array(noise.length + marker.length + shifted.length);
    combined.set(noise, 0);
    combined.set(marker, noise.length);
    combined.set(shifted, noise.length + marker.length);
    let binary = '';
    combined.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary);
}

// World is scaled ~3.25x versus the original modal-panel version (arena
// radius 2.0 -> 6.5) so there's real room to roam on a fullscreen page.
// Projectile/effect MESH + HITBOX sizes are scaled further (~5x, see
// game-weapons.js / game-critters.js) since "small object readability"
// matters more than strict distance-scale consistency.
const FLOOR_RADIUS = 6.5;
const ARENA_CLAMP_RADIUS = FLOOR_RADIUS * 0.94;
const SPAWN_RADIUS = FLOOR_RADIUS * 1.05;
const PLAYER_BASE_SPEED = 3.2;
const PLAYER_RADIUS = 0.1; // player's own model/hitbox is intentionally NOT rescaled
const BASE_MAX_HP = 100;
const INVULN_MS = 350;
const XP_PICKUP_ATTRACT_SPEED = 8.5;
const PROJECTILE_HIT_RADIUS = 0.25;
const DRONE_ORBIT_RADIUS = 0.6;
const ORBIT_BLADE_HIT_PAD = 0.25;

const RANKS = [
    { at: 0, title: 'Intern' },
    { at: 50, title: 'Junior Dev' },
    { at: 300, title: 'Software Engineer' },
    { at: 1000, title: 'Senior Engineer' },
    { at: 3000, title: 'Staff Engineer' },
    { at: 10000, title: 'Principal Engineer' },
    { at: 25000, title: 'Code Minion Overlord' },
];

const META_UPGRADES = [
    { id: 'vitality', name: 'Extra Coffee', icon: '☕', desc: '+12 max HP per level', baseCost: 20 },
    { id: 'swiftness', name: 'Standing Desk', icon: '🦿', desc: '+3% move speed per level', baseCost: 25 },
    { id: 'might', name: 'Mechanical Keyboard', icon: '⌨️', desc: '+3% weapon damage per level', baseCost: 30 },
    { id: 'revive', name: 'Backup Save', icon: '💾', desc: '+1 free revive per run (max 2)', baseCost: 90, maxLevel: 2 },
    { id: 'fortune', name: 'Expense Report', icon: '🧾', desc: '+8% Commits earned per run', baseCost: 35 },
];

function defaultMeta() {
    return {
        commits: 0,
        totalEarned: 0,
        totalRuns: 0,
        bestLevel: 0,
        bestTimeSec: 0,
        upgrades: { vitality: 0, swiftness: 0, might: 0, revive: 0, fortune: 0 },
    };
}
function loadMeta() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultMeta();
        const parsed = JSON.parse(raw);
        return Object.assign(defaultMeta(), parsed, { upgrades: Object.assign(defaultMeta().upgrades, parsed.upgrades) });
    } catch {
        return defaultMeta();
    }
}
function saveMeta(meta) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
}

function costFor(baseCost, level) { return Math.ceil(baseCost * Math.pow(1.15, level)); }
function currentRank(totalEarned) {
    let rank = RANKS[0].title;
    for (const r of RANKS) if (totalEarned >= r.at) rank = r.title;
    return rank;
}
function formatNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return Math.floor(n).toString();
}
function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
function xpForLevel(level) { return Math.round(6 + level * 4); }

// Reused instead of allocating fresh Vector3s on every shot fired.
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FORWARD_Z = new THREE.Vector3(0, 0, 1);
const LOOK_AT_OFFSET = new THREE.Vector3(0, 0.35, 0);

/** Frees GPU-side geometry/material buffers — scene.remove() alone only unlinks the object. */
function disposeObject3D(obj) {
    obj.traverse((node) => {
        node.geometry?.dispose();
        if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
        else node.material?.dispose();
    });
}

function initGame() {
    const lobbyEl = document.getElementById('kc-lobby');
    const runEl = document.getElementById('kc-run');
    const canvas = document.getElementById('kc-stage-canvas');
    const stageWrap = document.getElementById('kc-stage-wrap');
    const stageToast = document.getElementById('kc-stage-toast');
    const damageFlash = document.getElementById('kc-damage-flash');
    const moveHint = document.getElementById('kc-move-hint');

    const lobbyCommitsEl = document.getElementById('kc-lobby-commits');
    const lobbyRankEl = document.getElementById('kc-lobby-rank');
    const lobbyBestLevelEl = document.getElementById('kc-lobby-best-level');
    const lobbyBestTimeEl = document.getElementById('kc-lobby-best-time');
    const startRunBtn = document.getElementById('kc-start-run');
    const metaUpgradesEl = document.getElementById('kc-meta-upgrades');

    const hpFillEl = document.getElementById('kc-hp-fill');
    const hpTextEl = document.getElementById('kc-hp-text');
    const xpFillEl = document.getElementById('kc-xp-fill');
    const timerEl = document.getElementById('kc-timer');
    const levelValueEl = document.getElementById('kc-level-value');
    const weaponTrayEl = document.getElementById('kc-weapon-tray');

    const levelUpEl = document.getElementById('kc-levelup');
    const levelUpChoicesEl = document.getElementById('kc-levelup-choices');

    const summaryEl = document.getElementById('kc-summary');
    const summaryTitleEl = document.getElementById('kc-summary-title');
    const summaryStatsEl = document.getElementById('kc-summary-stats');
    const summaryContinueBtn = document.getElementById('kc-summary-continue');
    const nameInput = document.getElementById('kc-name-input');
    const highScoreSubmitBtn = document.getElementById('kc-highscore-submit');

    let meta = loadMeta();

    // ---- Three.js scene ----
    const scene = new THREE.Scene();
    function removeFromScene(obj) {
        scene.remove(obj);
        disposeObject3D(obj);
    }
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 60);
    const CAMERA_OFFSET = new THREE.Vector3(0, 9, 11);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambient = new THREE.AmbientLight(0xffffff, 1.9);
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.4);
    dirLight.position.set(4, 7, 4);
    scene.add(ambient, dirLight);

    const ground = new THREE.Mesh(
        new THREE.CircleGeometry(FLOOR_RADIUS, 56),
        new THREE.MeshStandardMaterial({ color: 0x101c28, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Ring marks the actual movement boundary (ARENA_CLAMP_RADIUS), not the
    // slightly larger cosmetic floor — otherwise the player hits an invisible
    // stop short of the visible edge.
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(ARENA_CLAMP_RADIUS - 0.06, ARENA_CLAMP_RADIUS, 64),
        new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    scene.add(ring);

    function addProp(x, z, geo, color, y = 0) {
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
        mesh.position.set(x, y, z);
        scene.add(mesh);
        return mesh;
    }
    addProp(-4.06, -2.93, new THREE.BoxGeometry(0.9, 0.66, 0.54), 0x6b5640, 0.33);
    addProp(3.9, 3.25, new THREE.ConeGeometry(0.36, 0.9, 8), 0x3a6b4a, 0.45);
    addProp(3.9, 3.25, new THREE.CylinderGeometry(0.18, 0.21, 0.24, 8), 0x8a6f55, 0.12);

    const character = buildKitChanCharacter({ hoodieColor: 0x7C93A6 });
    scene.add(character.root);

    function resizeStage() {
        const w = stageWrap.clientWidth;
        const h = stageWrap.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    resizeStage();
    window.addEventListener('resize', resizeStage);

    let shakeUntil = 0;
    function updateCamera() {
        const target = character.root.position.clone().add(CAMERA_OFFSET);
        camera.position.lerp(target, 0.09);
        if (performance.now() < shakeUntil) {
            camera.position.x += (Math.random() - 0.5) * 0.06;
            camera.position.y += (Math.random() - 0.5) * 0.06;
        }
        const lookAt = character.root.position.clone().add(LOOK_AT_OFFSET);
        camera.lookAt(lookAt);
    }
    camera.position.copy(character.root.position.clone().add(CAMERA_OFFSET));
    camera.lookAt(character.root.position.clone().add(LOOK_AT_OFFSET));

    let toastTimer = null;
    function showToast(msg, ms = 1800) {
        stageToast.textContent = msg;
        stageToast.classList.add('kc-stage-toast-show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => stageToast.classList.remove('kc-stage-toast-show'), ms);
    }

    // ---- Run state (reset each run) ----
    let runState = null;
    let spawnDirector = null;
    const enemies = [];
    const playerProjectiles = [];
    const enemyProjectiles = [];
    const xpOrbs = [];
    const novaRings = [];
    const obstacles = [];
    const obstacleVisuals = [];
    const weaponRuntime = { orbit: { blades: [], hitMap: new Map(), angle: 0 }, drone: { drones: [] } };
    let pendingLevelUps = 0;

    function mightMul() { return PASSIVE_DEFS.might.valueAtLevel(runState.passives.might || 0) * (1 + (meta.upgrades.might || 0) * 0.03); }
    function cooldownMul() { return PASSIVE_DEFS.cooldown.valueAtLevel(runState.passives.cooldown || 0); }
    function areaMul() { return PASSIVE_DEFS.area.valueAtLevel(runState.passives.area || 0); }
    function speedMul() { return PASSIVE_DEFS.speed.valueAtLevel(runState.passives.speed || 0) * (1 + (meta.upgrades.swiftness || 0) * 0.03); }
    function pickupRadius() { return 0.6 + PASSIVE_DEFS.magnet.valueAtLevel(runState.passives.magnet || 0); }
    function computeMaxHp() { return BASE_MAX_HP + (meta.upgrades.vitality || 0) * 12 + (runState.passives.vitality || 0) * 20; }

    function clearArena() {
        enemies.forEach(e => removeFromScene(e.visual.root));
        enemies.length = 0;
        playerProjectiles.forEach(p => removeFromScene(p.mesh));
        playerProjectiles.length = 0;
        enemyProjectiles.forEach(p => removeFromScene(p.mesh));
        enemyProjectiles.length = 0;
        xpOrbs.forEach(o => removeFromScene(o.visual.root));
        xpOrbs.length = 0;
        novaRings.forEach(r => removeFromScene(r.mesh));
        novaRings.length = 0;
        weaponRuntime.orbit.blades.forEach(m => removeFromScene(m));
        weaponRuntime.orbit.blades = [];
        weaponRuntime.orbit.hitMap.clear();
        weaponRuntime.drone.drones.forEach(d => removeFromScene(d.entity.root));
        weaponRuntime.drone.drones = [];
        obstacleVisuals.forEach(v => removeFromScene(v.root));
        obstacleVisuals.length = 0;
        obstacles.length = 0;
    }

    function setupObstacles() {
        const placed = generateObstacles(ARENA_CLAMP_RADIUS, { wallCount: 7, holeCount: 4 });
        placed.forEach(o => {
            obstacles.push(o);
            const visual = o.kind === 'wall' ? buildWallObstacle(o.radius) : buildHoleObstacle(o.radius);
            visual.root.position.set(o.x, 0, o.z);
            scene.add(visual.root);
            obstacleVisuals.push(visual);
        });
    }

    // ---- Enemies ----
    function spawnEnemyOfType(id, elapsedSec) {
        if (enemies.length >= MAX_ENEMIES) return;
        const def = ENEMY_TYPES[id];
        const mul = difficultyMul(elapsedSec);
        const visual = ENEMY_BUILDERS[def.builder]();
        const angle = Math.random() * Math.PI * 2;
        const pos = new THREE.Vector3(Math.cos(angle) * SPAWN_RADIUS, 0, Math.sin(angle) * SPAWN_RADIUS);
        visual.root.position.copy(pos);
        scene.add(visual.root);
        enemies.push({
            def, visual, pos,
            hp: Math.ceil(def.baseHp * mul.hp), maxHp: Math.ceil(def.baseHp * mul.hp),
            dmgMul: mul.dmg, lastContactMs: 0, lastRangedMs: 0, dead: false,
        });
    }

    function damageEnemy(e, amount, now) {
        if (e.dead) return;
        e.hp -= amount;
        e.visual.playHit?.();
        if (e.hp <= 0) killEnemy(e, now);
    }
    function killEnemy(e, now) {
        e.dead = true;
        removeFromScene(e.visual.root);
        const idx = enemies.indexOf(e);
        if (idx !== -1) enemies.splice(idx, 1);
        runState.kills += 1;
        spawnXpOrb(e.pos, e.def.xp);
        if (e.def.isElite) showToast('Merge Conflict resolved! 🎉', 2200);
    }

    function updateEnemy(e, dtMs, now) {
        const toPlayer = character.root.position.clone().sub(e.pos);
        toPlayer.y = 0;
        const dist = toPlayer.length();
        const def = e.def;
        const contactRange = PLAYER_RADIUS + def.radius;

        let dirX = 0, dirZ = 0, wantsMove = false;
        if (def.ranged) {
            const pref = def.ranged.preferredRange;
            if (dist > pref + 0.08) {
                dirX = toPlayer.x / (dist || 1); dirZ = toPlayer.z / (dist || 1);
                wantsMove = true;
            } else if (dist < pref - 0.2) {
                dirX = -toPlayer.x / (dist || 1); dirZ = -toPlayer.z / (dist || 1);
                wantsMove = true;
            }
            if (dist > contactRange && now - e.lastRangedMs >= def.ranged.cooldownMs && dist <= pref + 0.7) {
                e.lastRangedMs = now;
                spawnEnemyProjectile(e);
            }
        } else if (dist > contactRange + 0.03) {
            dirX = toPlayer.x / (dist || 1); dirZ = toPlayer.z / (dist || 1);
            wantsMove = true;
        }

        if (wantsMove) {
            const steered = steerAroundObstacles(e.pos.x, e.pos.z, dirX, dirZ, obstacles, def.radius, { flying: def.isFlying, lookahead: 1.4 });
            e.pos.x += steered.x * def.speed * (dtMs / 1000);
            e.pos.z += steered.z * def.speed * (dtMs / 1000);
            const resolved = resolveCollision(e.pos.x, e.pos.z, def.radius, obstacles, { flying: def.isFlying });
            e.pos.x = resolved.x;
            e.pos.z = resolved.z;
        }

        if (dist <= contactRange && now - e.lastContactMs >= def.contactTickMs) {
            e.lastContactMs = now;
            damagePlayer(def.contactDamage * e.dmgMul, now);
        }

        e.visual.root.position.copy(e.pos);
        if (toPlayer.lengthSq() > 1e-6) e.visual.root.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        e.visual.update(now / 1000);
    }

    function spawnEnemyProjectile(e) {
        const dir = character.root.position.clone().sub(e.pos);
        dir.y = 0;
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
        dir.normalize();
        const mesh = buildWaspBoltMesh();
        mesh.position.copy(e.pos).setY(0.3);
        scene.add(mesh);
        enemyProjectiles.push({
            mesh, pos: e.pos.clone().setY(0.3),
            vel: dir.multiplyScalar(e.def.ranged.projectileSpeed),
            damage: e.def.ranged.damage * e.dmgMul, ttlMs: 2500, radius: e.def.ranged.radius,
        });
    }

    function updateEnemyProjectiles(dt, now) {
        for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
            const p = enemyProjectiles[i];
            p.pos.addScaledVector(p.vel, dt);
            p.mesh.position.copy(p.pos);
            p.ttlMs -= dt * 1000;
            let hit = false;
            for (const o of obstacles) {
                if (!blocksProjectile(o)) continue;
                if (Math.hypot(p.pos.x - o.x, p.pos.z - o.z) <= o.radius + p.radius) { hit = true; break; }
            }
            const dist = p.pos.distanceTo(character.root.position);
            if (!hit && dist <= p.radius + PLAYER_RADIUS) { damagePlayer(p.damage, now); hit = true; }
            if (hit || p.ttlMs <= 0 || p.pos.length() > SPAWN_RADIUS * 1.3) {
                removeFromScene(p.mesh);
                enemyProjectiles.splice(i, 1);
            }
        }
    }

    // ---- XP orbs ----
    function spawnXpOrb(pos, value) {
        const visual = buildXpOrb();
        visual.root.position.copy(pos).setY(0);
        scene.add(visual.root);
        xpOrbs.push({ visual, pos: pos.clone(), value });
    }
    function updateXpOrbs(dt, now) {
        const radius = pickupRadius();
        for (let i = xpOrbs.length - 1; i >= 0; i--) {
            const o = xpOrbs[i];
            const dist = o.pos.distanceTo(character.root.position);
            if (dist <= radius) {
                const dir = character.root.position.clone().sub(o.pos).setY(0);
                if (dist > 0.05) dir.normalize().multiplyScalar(XP_PICKUP_ATTRACT_SPEED * dt);
                o.pos.add(dir);
            }
            o.visual.root.position.copy(o.pos);
            o.visual.update(now / 1000);
            if (o.pos.distanceTo(character.root.position) <= 0.15) {
                removeFromScene(o.visual.root);
                xpOrbs.splice(i, 1);
                addXp(o.value);
            }
        }
    }

    // ---- XP / leveling ----
    function addXp(amount) {
        runState.xp += amount;
        while (runState.xp >= runState.xpToNext) {
            runState.xp -= runState.xpToNext;
            runState.level += 1;
            runState.xpToNext = xpForLevel(runState.level);
            pendingLevelUps += 1;
        }
        if (pendingLevelUps > 0 && !runState.paused) beginLevelUp();
    }
    function beginLevelUp() {
        pendingLevelUps -= 1;
        runState.paused = true;
        character.setPose('wave');
        const choices = buildLevelUpChoices(runState, 3);
        levelUpChoicesEl.innerHTML = choices.map((c, i) => `
            <button class="kc-choice" data-idx="${i}">
                <div class="kc-choice-icon">${c.icon}</div>
                <div class="kc-choice-name">${c.name}</div>
                <div class="kc-choice-desc">${c.desc}</div>
            </button>`).join('');
        levelUpChoicesEl.querySelectorAll('.kc-choice').forEach(btn => {
            btn.addEventListener('click', () => {
                const choice = choices[Number(btn.dataset.idx)];
                choice.apply(runState);
                if (runState.healOnNextApply) { runState.hp = computeMaxHp(); runState.healOnNextApply = false; }
                runState.maxHp = computeMaxHp();
                levelUpEl.style.display = 'none';
                if (pendingLevelUps > 0) beginLevelUp();
                else runState.paused = false;
            });
        });
        levelUpEl.style.display = 'flex';
    }

    // ---- Player damage ----
    function damagePlayer(amount, now) {
        if (now < runState.invulnUntil || runState.hp <= 0) return;
        const reduced = Math.max(1, amount - (runState.passives.armor || 0));
        runState.hp -= reduced;
        runState.invulnUntil = now + INVULN_MS;
        shakeUntil = now + 150;
        damageFlash.classList.add('kc-flash-show');
        setTimeout(() => damageFlash.classList.remove('kc-flash-show'), 160);
        if (runState.hp <= 0) {
            runState.hp = 0;
            if (runState.revivesLeft > 0) {
                runState.revivesLeft -= 1;
                runState.hp = runState.maxHp;
                runState.invulnUntil = now + 1200;
                showToast('Backup restored! 💾', 2000);
            } else {
                endRun('death', now);
            }
        }
    }

    // ---- Weapons: projectile helpers ----
    function nearestEnemy(fromPos, maxRange) {
        let best = null, bestD = Infinity;
        for (const e of enemies) {
            if (e.dead) continue;
            const d = e.pos.distanceTo(fromPos);
            if (d < bestD && (maxRange == null || d <= maxRange)) { bestD = d; best = e; }
        }
        return best;
    }
    function spawnPlayerProjectileDir(origin, dir, speed, damage, pierce, maxRange, mesh) {
        mesh.position.copy(origin);
        mesh.quaternion.setFromUnitVectors(FORWARD_Z, dir);
        scene.add(mesh);
        playerProjectiles.push({
            mesh, pos: origin.clone(), vel: dir.clone().multiplyScalar(speed),
            damage, pierceLeft: pierce, traveled: 0, maxRange, radius: PROJECTILE_HIT_RADIUS, hitSet: new Set(),
        });
    }
    function updatePlayerProjectiles(dt, now) {
        for (let i = playerProjectiles.length - 1; i >= 0; i--) {
            const p = playerProjectiles[i];
            const step = p.vel.clone().multiplyScalar(dt);
            p.pos.add(step);
            p.traveled += step.length();
            p.mesh.position.copy(p.pos);
            let consumed = false;
            for (const o of obstacles) {
                if (!blocksProjectile(o)) continue;
                if (Math.hypot(p.pos.x - o.x, p.pos.z - o.z) <= o.radius + p.radius) { consumed = true; break; }
            }
            if (!consumed) {
                for (const e of enemies) {
                    if (e.dead || p.hitSet.has(e)) continue;
                    if (e.pos.distanceTo(p.pos) <= e.def.radius + p.radius) {
                        damageEnemy(e, p.damage, now);
                        p.hitSet.add(e);
                        if (p.pierceLeft > 0) p.pierceLeft -= 1;
                        else { consumed = true; break; }
                    }
                }
            }
            if (consumed || p.traveled >= p.maxRange) {
                removeFromScene(p.mesh);
                playerProjectiles.splice(i, 1);
            }
        }
    }

    // ---- Weapon: bullet / shotgun / nova (cooldown-fired) ----
    function fireBulletWeapon(w) {
        const stats = WEAPON_DEFS.bullet.stats(w.level);
        const target = nearestEnemy(character.root.position, stats.range);
        if (!target) return;
        const dir = target.pos.clone().sub(character.root.position).setY(0).normalize();
        const dmg = stats.damage * mightMul();
        for (let i = 0; i < stats.count; i++) {
            const spread = (i - (stats.count - 1) / 2) * 0.18;
            const d2 = dir.clone().applyAxisAngle(WORLD_UP, spread);
            spawnPlayerProjectileDir(character.root.position.clone().setY(0.5), d2, stats.speed, dmg, stats.pierce, stats.range, buildBulletMesh());
        }
    }
    function fireShotgunWeapon(w) {
        const stats = WEAPON_DEFS.shotgun.stats(w.level);
        const target = nearestEnemy(character.root.position, stats.range * 1.4);
        const baseDir = target
            ? target.pos.clone().sub(character.root.position).setY(0).normalize()
            : new THREE.Vector3(Math.sin(character.root.rotation.y), 0, Math.cos(character.root.rotation.y));
        const dmg = stats.damage * mightMul();
        for (let i = 0; i < stats.pelletCount; i++) {
            const t = stats.pelletCount === 1 ? 0 : (i / (stats.pelletCount - 1)) - 0.5;
            const d = baseDir.clone().applyAxisAngle(WORLD_UP, t * stats.spreadRad);
            spawnPlayerProjectileDir(character.root.position.clone().setY(0.45), d, stats.speed, dmg, 0, stats.range, buildPelletMesh());
        }
    }
    function fireNovaWeapon(w, now) {
        const stats = WEAPON_DEFS.nova.stats(w.level);
        const radius = stats.radius * areaMul();
        const dmg = stats.damage * mightMul();
        for (const e of enemies) if (!e.dead && e.pos.distanceTo(character.root.position) <= radius) damageEnemy(e, dmg, now);
        const ring = buildNovaRing();
        ring.position.copy(character.root.position).setY(0.02);
        scene.add(ring);
        novaRings.push({ mesh: ring, bornAt: now, ttlMs: 400, maxRadius: radius });
    }
    function updateNovaRings(now) {
        for (let i = novaRings.length - 1; i >= 0; i--) {
            const r = novaRings[i];
            const t = (now - r.bornAt) / r.ttlMs;
            if (t >= 1) { removeFromScene(r.mesh); novaRings.splice(i, 1); continue; }
            const scale = Math.max(0.001, (r.maxRadius / 0.03) * t);
            r.mesh.scale.set(scale, scale, scale);
            r.mesh.material.opacity = 0.55 * (1 - t);
        }
    }

    const COOLDOWN_WEAPONS = { bullet: fireBulletWeapon, shotgun: fireShotgunWeapon, nova: fireNovaWeapon };

    // ---- Weapon: orbit blades (continuous) ----
    function updateOrbitWeapon(dtMs, now) {
        const w = runState.weapons.find(w => w.id === 'orbit');
        const rt = weaponRuntime.orbit;
        if (!w) {
            if (rt.blades.length) { rt.blades.forEach(m => removeFromScene(m)); rt.blades = []; }
            return;
        }
        const stats = WEAPON_DEFS.orbit.stats(w.level);
        const radius = stats.radius * areaMul();
        while (rt.blades.length < stats.count) { const mesh = buildOrbitBlade(); scene.add(mesh); rt.blades.push(mesh); }
        while (rt.blades.length > stats.count) { removeFromScene(rt.blades.pop()); }
        rt.angle += stats.rotSpeed * (dtMs / 1000);
        const dmg = stats.damage * mightMul();
        rt.blades.forEach((mesh, i) => {
            const a = rt.angle + (i / stats.count) * Math.PI * 2;
            const bx = character.root.position.x + Math.cos(a) * radius;
            const bz = character.root.position.z + Math.sin(a) * radius;
            mesh.position.set(bx, 0.5, bz);
            mesh.rotation.y = a;
            for (const e of enemies) {
                if (e.dead) continue;
                if (Math.hypot(e.pos.x - bx, e.pos.z - bz) <= e.def.radius + ORBIT_BLADE_HIT_PAD) {
                    const last = rt.hitMap.get(e) || 0;
                    if (now - last >= stats.hitTickMs) { rt.hitMap.set(e, now); damageEnemy(e, dmg, now); }
                }
            }
        });
    }

    // ---- Weapon: drone turrets (continuous, independent targeting) ----
    function updateDroneWeapon(dtMs, now) {
        const w = runState.weapons.find(w => w.id === 'drone');
        const rt = weaponRuntime.drone;
        if (!w) {
            if (rt.drones.length) { rt.drones.forEach(d => removeFromScene(d.entity.root)); rt.drones = []; }
            return;
        }
        const stats = WEAPON_DEFS.drone.stats(w.level);
        while (rt.drones.length < stats.droneCount) {
            const entity = buildDrone();
            scene.add(entity.root);
            rt.drones.push({ entity, timer: Math.random() * 400 });
        }
        while (rt.drones.length > stats.droneCount) { const d = rt.drones.pop(); removeFromScene(d.entity.root); }
        const dmg = stats.damage * mightMul();
        const cd = stats.cooldownMs * cooldownMul();
        rt.drones.forEach((d, i) => {
            const angle = now / 1000 * 0.6 + i * (Math.PI * 2 / rt.drones.length);
            const px = character.root.position.x + Math.cos(angle) * DRONE_ORBIT_RADIUS;
            const pz = character.root.position.z + Math.sin(angle) * DRONE_ORBIT_RADIUS;
            d.entity.root.position.set(px, 0, pz);
            d.entity.update(now / 1000);
            d.timer -= dtMs;
            if (d.timer <= 0) {
                const target = nearestEnemy(new THREE.Vector3(px, 0, pz), stats.range);
                if (target) {
                    d.entity.playZap();
                    const dir = target.pos.clone().sub(new THREE.Vector3(px, 0, pz)).setY(0).normalize();
                    spawnPlayerProjectileDir(new THREE.Vector3(px, 0.6, pz), dir, 7.5, dmg, 0, stats.range + 0.4, buildBulletMesh());
                    d.timer = cd;
                } else {
                    d.timer = 150;
                }
            }
        });
    }

    function updateWeapons(dtMs, now) {
        updateOrbitWeapon(dtMs, now);
        updateDroneWeapon(dtMs, now);
        runState.weapons.forEach(w => {
            const fn = COOLDOWN_WEAPONS[w.id];
            if (!fn) return;
            const stats = WEAPON_DEFS[w.id].stats(w.level);
            const cd = stats.cooldownMs * cooldownMul();
            w.cooldownMs -= dtMs;
            if (w.cooldownMs <= 0) {
                fn(w, now);
                w.cooldownMs += cd;
                if (w.cooldownMs < 0) w.cooldownMs = 0;
            }
        });
    }

    // ---- Input ----
    const pressedKeys = new Set();
    const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (MOVE_KEYS.has(key)) {
            pressedKeys.add(key);
            moveHint.classList.add('kc-hide');
            e.preventDefault();
        }
    });
    window.addEventListener('keyup', (e) => pressedKeys.delete(e.key.toLowerCase()));

    // Touch: player is always camera-centered, so move in the direction of
    // the touch point relative to the stage's own center (not the whole
    // window, since the HUD strip above shifts the stage down a bit).
    let touchDirX = 0, touchDirZ = 0, touchActive = false;
    const TOUCH_DEAD_ZONE_PX = 12;
    function updateTouchDir(e) {
        if (!e.touches || e.touches.length === 0) return;
        const touch = e.touches[0];
        const rect = stageWrap.getBoundingClientRect();
        const dx = touch.clientX - (rect.left + rect.width / 2);
        const dy = touch.clientY - (rect.top + rect.height / 2);
        const dist = Math.hypot(dx, dy);
        if (dist < TOUCH_DEAD_ZONE_PX) { touchDirX = 0; touchDirZ = 0; return; }
        touchDirX = dx / dist;
        touchDirZ = dy / dist;
    }
    stageWrap.addEventListener('touchstart', (e) => {
        touchActive = true;
        moveHint.classList.add('kc-hide');
        updateTouchDir(e);
        e.preventDefault();
    }, { passive: false });
    stageWrap.addEventListener('touchmove', (e) => { updateTouchDir(e); e.preventDefault(); }, { passive: false });
    const clearTouch = () => { touchActive = false; touchDirX = 0; touchDirZ = 0; };
    stageWrap.addEventListener('touchend', clearTouch);
    stageWrap.addEventListener('touchcancel', clearTouch);

    function updatePlayerMovement(dt) {
        let mx = 0, mz = 0;
        if (pressedKeys.has('w') || pressedKeys.has('arrowup')) mz -= 1;
        if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) mz += 1;
        if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) mx -= 1;
        if (pressedKeys.has('d') || pressedKeys.has('arrowright')) mx += 1;
        if (touchActive) { mx += touchDirX; mz += touchDirZ; }
        const moving = mx !== 0 || mz !== 0;
        if (moving) {
            const len = Math.hypot(mx, mz);
            mx /= len; mz /= len;
            const speed = PLAYER_BASE_SPEED * speedMul();
            let nx = character.root.position.x + mx * speed * dt;
            let nz = character.root.position.z + mz * speed * dt;
            const resolved = resolveCollision(nx, nz, PLAYER_RADIUS, obstacles, { flying: false });
            nx = resolved.x; nz = resolved.z;
            const r = Math.hypot(nx, nz);
            if (r > ARENA_CLAMP_RADIUS) { nx *= ARENA_CLAMP_RADIUS / r; nz *= ARENA_CLAMP_RADIUS / r; }
            character.root.position.x = nx;
            character.root.position.z = nz;
            character.root.rotation.y = Math.atan2(mx, mz);
            if (character.getPose() !== 'wave') character.setPose('walk');
        } else if (character.getPose() === 'walk') {
            character.setPose('idle');
        }
    }

    // ---- Game loop ----
    let lastTick = performance.now();
    let rafId = null;
    function tick() {
        try {
            const now = performance.now();
            const dtMs = Math.min(now - lastTick, 200);
            const dt = dtMs / 1000;
            lastTick = now;

            if (runState && runState.active) {
                if (!runState.paused) {
                    runState.timeSec += dt;
                    updatePlayerMovement(dt);

                    const toSpawn = spawnDirector.update(runState.timeSec, dtMs, enemies.length);
                    toSpawn.forEach(id => spawnEnemyOfType(id, runState.timeSec));

                    enemies.slice().forEach(e => updateEnemy(e, dtMs, now));
                    updateEnemyProjectiles(dt, now);
                    updatePlayerProjectiles(dt, now);
                    updateWeapons(dtMs, now);
                    updateXpOrbs(dt, now);
                    updateNovaRings(now);

                    if (runState.timeSec >= VICTORY_TIME_SEC) endRun('victory', now);
                }
                renderRunUI(now);
            }

            if (runEl.style.display !== 'none') {
                character.update();
                updateCamera();
                renderer.render(scene, camera);
            }
        } catch (err) {
            console.error('[kc-game] tick error (continuing):', err);
        }
        rafId = requestAnimationFrame(tick);
    }

    function renderRunUI(now) {
        const hpPct = Math.max(0, runState.hp / runState.maxHp) * 100;
        hpFillEl.style.width = `${hpPct}%`;
        hpTextEl.textContent = `${Math.ceil(runState.hp)}/${runState.maxHp}`;
        xpFillEl.style.width = `${Math.min(100, (runState.xp / runState.xpToNext) * 100)}%`;
        timerEl.textContent = formatTime(runState.timeSec);
        levelValueEl.textContent = runState.level;

        const sig = runState.weapons.map(w => `${w.id}:${w.level}`).join('|');
        if (sig !== weaponTrayEl.dataset.sig) {
            weaponTrayEl.dataset.sig = sig;
            weaponTrayEl.innerHTML = runState.weapons.map(w =>
                `<div class="kc-weapon-chip" title="${WEAPON_DEFS[w.id].name}">${WEAPON_DEFS[w.id].icon}<span>${w.level}</span></div>`
            ).join('');
        }
    }

    // ---- Run lifecycle ----
    function startRun() {
        const maxHp = BASE_MAX_HP + (meta.upgrades.vitality || 0) * 12;
        runState = {
            active: true, paused: false,
            hp: maxHp, maxHp,
            level: 1, xp: 0, xpToNext: xpForLevel(1),
            weapons: [{ id: STARTING_WEAPON, level: 1, cooldownMs: 0 }],
            passives: defaultPassives(),
            kills: 0, timeSec: 0,
            invulnUntil: 0, revivesLeft: meta.upgrades.revive || 0,
            bonusCommits: 0, healOnNextApply: false,
        };
        pendingLevelUps = 0;
        clearArena();
        setupObstacles();
        character.root.position.set(0, 0, 0);
        character.root.rotation.y = 0;
        character.setPose('idle');
        spawnDirector = createSpawnDirector();

        lobbyEl.style.display = 'none';
        runEl.style.display = 'flex';
        summaryEl.style.display = 'none';
        levelUpEl.style.display = 'none';
        moveHint.classList.remove('kc-hide');
        resizeStage();
        track?.('survivor_run_start');
    }

    function endRun(reason, now) {
        if (!runState.active) return;
        runState.active = false;
        const minutes = runState.timeSec / 60;
        const fortuneMul = 1 + (meta.upgrades.fortune || 0) * 0.08;
        const earned = Math.round((10 + runState.kills * 1.5 + runState.level * 6 + minutes * 8) * fortuneMul) + (runState.bonusCommits || 0);
        runState.earnedCommits = earned;
        meta.commits += earned;
        meta.totalEarned += earned;
        meta.totalRuns += 1;
        meta.bestLevel = Math.max(meta.bestLevel, runState.level);
        meta.bestTimeSec = Math.max(meta.bestTimeSec, Math.floor(runState.timeSec));
        saveMeta(meta);
        track?.('survivor_run_end', { reason, level: runState.level, timeSec: Math.floor(runState.timeSec) });

        summaryTitleEl.textContent = reason === 'victory' ? 'SPRINT COMPLETE! 🎉' : 'YOU GOT MERGED 💀';
        summaryStatsEl.innerHTML = `
            <div>Level reached: <strong>${runState.level}</strong></div>
            <div>Bugs squashed: <strong>${runState.kills}</strong></div>
            <div>Time survived: <strong>${formatTime(runState.timeSec)}</strong></div>
            <div class="kc-summary-earned">+${earned} Commits</div>
        `;
        runEl.style.display = 'none';
        levelUpEl.style.display = 'none';
        summaryEl.style.display = 'flex';
        highScoreSubmitBtn.disabled = false;
        highScoreSubmitBtn.textContent = 'SEND';
        nameInput.value = '';
    }

    function returnToLobby() {
        summaryEl.style.display = 'none';
        lobbyEl.style.display = 'flex';
        renderLobby();
    }

    // ---- Lobby / meta upgrades ----
    function renderLobby() {
        lobbyCommitsEl.textContent = formatNum(meta.commits);
        lobbyRankEl.textContent = currentRank(meta.totalEarned);
        lobbyBestLevelEl.textContent = meta.bestLevel;
        lobbyBestTimeEl.textContent = formatTime(meta.bestTimeSec);
        renderMetaUpgrades();
    }
    function renderMetaUpgrades() {
        metaUpgradesEl.innerHTML = META_UPGRADES.map(u => {
            const level = meta.upgrades[u.id] || 0;
            const maxed = u.maxLevel != null && level >= u.maxLevel;
            const cost = costFor(u.baseCost, level);
            const affordable = meta.commits >= cost;
            return `
                <div class="kc-upgrade ${maxed ? 'kc-owned' : ''}">
                    <div class="kc-upgrade-info">
                        <div class="kc-upgrade-name">${u.icon} ${u.name} <span class="kc-upgrade-lv">Lv.${level}</span></div>
                        <div class="kc-upgrade-desc">${u.desc}</div>
                    </div>
                    <button class="kc-upgrade-buy" data-id="${u.id}" ${maxed || !affordable ? 'disabled' : ''}>
                        ${maxed ? 'MAX' : `${cost} Commits`}
                    </button>
                </div>`;
        }).join('');
        metaUpgradesEl.querySelectorAll('.kc-upgrade-buy').forEach(btn => {
            btn.addEventListener('click', () => {
                const u = META_UPGRADES.find(u => u.id === btn.dataset.id);
                const level = meta.upgrades[u.id] || 0;
                const cost = costFor(u.baseCost, level);
                if (meta.commits < cost) return;
                meta.commits -= cost;
                meta.upgrades[u.id] = level + 1;
                saveMeta(meta);
                renderLobby();
            });
        });
    }

    startRunBtn.addEventListener('click', startRun);
    summaryContinueBtn.addEventListener('click', returnToLobby);
    highScoreSubmitBtn.addEventListener('click', async () => {
        highScoreSubmitBtn.disabled = true;
        highScoreSubmitBtn.textContent = 'SENDING…';
        try {
            await fetch(HIGHSCORE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    p: encodeHighscorePayload({
                        name: (nameInput.value || 'Anonymous').slice(0, 40),
                        level: runState ? runState.level : meta.bestLevel,
                        commitsEarned: runState ? (runState.earnedCommits || 0) : 0,
                        rank: currentRank(meta.totalEarned),
                        playMinutes: runState ? Math.round(runState.timeSec / 60) : 0,
                    }),
                }),
            });
            highScoreSubmitBtn.textContent = 'SENT ✓';
        } catch {
            highScoreSubmitBtn.disabled = false;
            highScoreSubmitBtn.textContent = 'SEND';
            showToast("Couldn't send right now — try again later.");
        }
    });

    track?.('hidden_game_discovered');
    renderLobby();
    tick();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
