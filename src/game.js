/**
 * game.js — hidden RPG-ish bug-squashing game built around the Kit Chan
 * rig. Discovered via the Konami code. Fully client-side (localStorage),
 * except an optional high-score ping to Discord after 15+ minutes of
 * active play.
 *
 * Click a bug to send Kit Chan to squash it (walk -> guard -> idle).
 * Deploy robots to squash bugs automatically. Currency: "Commits".
 */
import * as THREE from 'three';
import { buildKitChanCharacter } from './kit-chan-character.js';
import { buildBug, buildRobot } from './game-critters.js';
import { track } from './analytics.js';

const STORAGE_KEY = 'kitchan-bugsquash-v2';
const HIGHSCORE_ENDPOINT = 'https://llm-bff-psi.vercel.app/api/game-highscore';
const PLAYTIME_THRESHOLD_SEC = 15 * 60;
const CRUNCH_DURATION_MS = 8000;
const CRUNCH_COOLDOWN_MS = 30000;

const FLOOR_RADIUS = 1.6;
const MAX_BUGS = 7;
const BUG_SPAWN_INTERVAL_MS = [2500, 5500]; // [min, max] random
const ARRIVE_RADIUS = 0.16;
const WALK_SPEED = 0.9; // units/sec
const ATTACK_TICK_MS = 500;

const RANKS = [
    { at: 0, title: 'Intern' },
    { at: 50, title: 'Junior Dev' },
    { at: 300, title: 'Software Engineer' },
    { at: 1000, title: 'Senior Engineer' },
    { at: 3000, title: 'Staff Engineer' },
    { at: 10000, title: 'Principal Engineer' },
    { at: 25000, title: 'Code Minion Overlord' },
];

function defaultState() {
    return {
        commits: 0,
        totalEarned: 0,
        totalSquashed: 0,
        clickLevel: 0,     // "Sharper Reflexes" — player attack power
        duckLevel: 0,      // "Rubber Duck" — small player damage/reward bonus
        hasCoffeeBreak: false,
        robotLevel: 0,     // number of deployed robots
        hasCrunchMode: false,
        crunchActiveUntil: 0,
        crunchCooldownUntil: 0,
        playSeconds: 0,
        highScoreSubmitted: false,
    };
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState();
        return Object.assign(defaultState(), JSON.parse(raw));
    } catch {
        return defaultState();
    }
}
function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function costFor(baseCost, level) {
    return Math.ceil(baseCost * Math.pow(1.15, level));
}
function currentRank(totalEarned) {
    let rank = RANKS[0].title;
    for (const r of RANKS) if (totalEarned >= r.at) rank = r.title;
    return rank;
}
function playerDamage(state) {
    return 1 + state.clickLevel * 1;
}
function playerRewardBonus(state) {
    return state.duckLevel * 0.5;
}
function robotDamage() {
    return 1;
}
function globalMultiplier(state, now) {
    return state.crunchActiveUntil > now ? 3 : 1;
}
function passiveRate(state) {
    return state.hasCoffeeBreak ? 1 : 0;
}
function formatNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return Math.floor(n).toString();
}
function randRange([a, b]) { return a + Math.random() * (b - a); }
function randomFloorPoint() {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * FLOOR_RADIUS * 0.85;
    return new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r);
}

const UPGRADES = [
    {
        id: 'reflexes',
        name: 'Sharper Reflexes',
        desc: '+1 squash damage',
        level: (s) => s.clickLevel,
        cost: (s) => costFor(10, s.clickLevel),
        visible: () => true,
        buy: (s) => { s.clickLevel += 1; },
    },
    {
        id: 'duck',
        name: 'Rubber Duck',
        desc: '+0.5 bonus Commits per squash',
        level: (s) => s.duckLevel,
        cost: (s) => costFor(25, s.duckLevel),
        visible: () => true,
        buy: (s) => { s.duckLevel += 1; },
    },
    {
        id: 'coffee',
        name: 'Coffee Break',
        desc: 'Unlocks passive income — +1 Commit/sec, even mid-nap',
        oneTime: true,
        owned: (s) => s.hasCoffeeBreak,
        cost: () => 50,
        visible: () => true,
        buy: (s) => { s.hasCoffeeBreak = true; },
    },
    {
        id: 'robot',
        name: 'Deploy a Robot',
        desc: 'A new helper bot auto-squashes bugs for you',
        level: (s) => s.robotLevel,
        cost: (s) => costFor(150, s.robotLevel),
        visible: () => true,
        buy: (s) => { s.robotLevel += 1; },
    },
    {
        id: 'crunch',
        name: 'Crunch Mode',
        desc: 'Unlocks an activatable power move — 3x income for 8s (30s cooldown)',
        oneTime: true,
        owned: (s) => s.hasCrunchMode,
        cost: () => 750,
        visible: () => true,
        buy: (s) => { s.hasCrunchMode = true; },
    },
];

const PANEL_HTML = `
<div id="kc-game-backdrop">
  <div id="kc-game-panel">
    <button id="kc-game-close" aria-label="Close">&times;</button>
    <div class="kc-header">
      <div class="kc-title">BUG SQUASH</div>
      <div class="kc-rank"></div>
    </div>
    <div id="kc-stage-wrap">
      <canvas id="kc-stage-canvas"></canvas>
      <div id="kc-stage-toast"></div>
    </div>
    <div class="kc-commits">
      <span id="kc-commits-value">0</span> Commits
      <div class="kc-rate"></div>
    </div>
    <button id="kc-crunch-btn" style="display:none;">CRUNCH MODE</button>
    <div class="kc-upgrades" id="kc-upgrades"></div>
    <div id="kc-highscore-invite" style="display:none;">
      <p>You've been at this for 15+ minutes. Want to send your high score to Bradley?</p>
      <input id="kc-name-input" type="text" placeholder="Name (optional)" maxlength="40">
      <button id="kc-highscore-submit">SEND HIGH SCORE</button>
      <button id="kc-highscore-dismiss">NOT NOW</button>
    </div>
  </div>
</div>
`;

let launched = false;

function launchGame() {
    if (launched) return;
    launched = true;
    track?.('hidden_game_discovered');

    const container = document.createElement('div');
    container.innerHTML = PANEL_HTML;
    document.body.appendChild(container);

    const backdrop = document.getElementById('kc-game-backdrop');
    const closeBtn = document.getElementById('kc-game-close');
    const canvas = document.getElementById('kc-stage-canvas');
    const stageWrap = document.getElementById('kc-stage-wrap');
    const stageToast = document.getElementById('kc-stage-toast');
    const commitsValueEl = document.getElementById('kc-commits-value');
    const rateEl = document.querySelector('.kc-rate');
    const rankEl = document.querySelector('.kc-rank');
    const crunchBtn = document.getElementById('kc-crunch-btn');
    const upgradesEl = document.getElementById('kc-upgrades');
    const highScoreInvite = document.getElementById('kc-highscore-invite');
    const nameInput = document.getElementById('kc-name-input');
    const highScoreSubmitBtn = document.getElementById('kc-highscore-submit');
    const highScoreDismissBtn = document.getElementById('kc-highscore-dismiss');

    let state = loadState();

    // ---- Three.js scene: wide, zoomed-out, follows the character ----
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 30);
    const CAMERA_OFFSET = new THREE.Vector3(0, 2.6, 3.2);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambient = new THREE.AmbientLight(0xffffff, 1.9);
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.4);
    dirLight.position.set(2, 3.5, 2);
    scene.add(ambient, dirLight);

    const ground = new THREE.Mesh(
        new THREE.CircleGeometry(FLOOR_RADIUS, 40),
        new THREE.MeshStandardMaterial({ color: 0x101c28, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Ring to visually mark the play area, matches the site's accent color.
    const ringGeo = new THREE.RingGeometry(FLOOR_RADIUS - 0.02, FLOOR_RADIUS, 48);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    scene.add(ring);

    // A couple of simple desk/plant props for flavor, matching the site's room aesthetic.
    function addProp(x, z, geo, color, y = 0) {
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
        mesh.position.set(x, y, z);
        scene.add(mesh);
        return mesh;
    }
    addProp(-1.25, -0.9, new THREE.BoxGeometry(0.3, 0.22, 0.18), 0x6b5640, 0.11);
    addProp(1.2, 1.0, new THREE.ConeGeometry(0.12, 0.3, 8), 0x3a6b4a, 0.15);
    addProp(1.2, 1.0, new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), 0x8a6f55, 0.04);

    const character = buildKitChanCharacter({ hoodieColor: 0x7C93A6 });
    scene.add(character.root);

    function resizeStage() {
        const w = stageWrap.clientWidth;
        const h = stageWrap.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    resizeStage();
    window.addEventListener('resize', resizeStage);

    function updateCamera() {
        const target = character.root.position.clone().add(CAMERA_OFFSET);
        camera.position.lerp(target, 0.08);
        const lookAt = character.root.position.clone().add(new THREE.Vector3(0, 0.35, 0));
        camera.lookAt(lookAt);
    }
    // Snap camera to start position immediately so the first frame isn't a swoop from origin.
    camera.position.copy(character.root.position.clone().add(CAMERA_OFFSET));
    camera.lookAt(character.root.position.clone().add(new THREE.Vector3(0, 0.35, 0)));

    // ---- Toast / talking sync ----
    let toastTimer = null;
    function showToast(msg, ms = 1800) {
        stageToast.textContent = msg;
        stageToast.classList.add('kc-stage-toast-show');
        character.setTalking(true);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            stageToast.classList.remove('kc-stage-toast-show');
            character.setTalking(false);
        }, ms);
    }

    // ---- Bugs ----
    /** @type {Array<{entity: ReturnType<typeof buildBug>, pos: THREE.Vector3, claimedBy: 'player'|'robot'|null, dead: boolean}>} */
    const bugs = [];
    function spawnBug() {
        if (bugs.length >= MAX_BUGS || !launched) return;
        const tough = Math.random() < 0.2;
        const entity = buildBug({ hp: tough ? 2 + Math.floor(Math.random() * 2) : 1 });
        const pos = randomFloorPoint();
        entity.root.position.copy(pos);
        scene.add(entity.root);
        bugs.push({ entity, pos, claimedBy: null, dead: false });
        scheduleNextSpawn();
    }
    let spawnTimer = null;
    function scheduleNextSpawn() {
        clearTimeout(spawnTimer);
        spawnTimer = setTimeout(spawnBug, randRange(BUG_SPAWN_INTERVAL_MS));
    }

    function removeBug(bug) {
        bug.dead = true;
        scene.remove(bug.entity.root);
        const idx = bugs.indexOf(bug);
        if (idx !== -1) bugs.splice(idx, 1);
    }

    function awardCommits(amount, now) {
        const total = amount * globalMultiplier(state, now);
        state.commits += total;
        state.totalEarned += total;
        return total;
    }

    // ---- Player targeting/combat ----
    let playerTarget = null; // bug object
    let playerAttackTimer = 0;
    let squashStreak = 0;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const meshes = bugs.map(b => b.entity.root).flatMap(g => g.children.length ? g.children : [g]);
        const hits = raycaster.intersectObjects(meshes, true);
        if (hits.length === 0) return;
        let hitRoot = hits[0].object;
        while (hitRoot.parent && !bugs.some(b => b.entity.root === hitRoot)) hitRoot = hitRoot.parent;
        const bug = bugs.find(b => b.entity.root === hitRoot);
        if (bug && bug.claimedBy !== 'robot') {
            if (playerTarget && playerTarget !== bug) playerTarget.claimedBy = null;
            playerTarget = bug;
            bug.claimedBy = 'player';
        }
    });

    function updatePlayer(dtMs, now) {
        if (!playerTarget || playerTarget.dead) {
            playerTarget = null;
            if (character.getPose() !== 'guard') character.setPose('idle');
            return;
        }
        const toTarget = playerTarget.pos.clone().sub(character.root.position);
        toTarget.y = 0;
        const dist = toTarget.length();

        if (dist > ARRIVE_RADIUS) {
            character.setPose('walk');
            toTarget.normalize();
            character.root.position.addScaledVector(toTarget, WALK_SPEED * (dtMs / 1000));
            character.root.rotation.y = Math.atan2(toTarget.x, toTarget.z);
            playerAttackTimer = 0;
        } else {
            character.setPose('guard', { persistent: true });
            character.root.rotation.y = Math.atan2(toTarget.x, toTarget.z);
            playerAttackTimer += dtMs;
            if (playerAttackTimer >= ATTACK_TICK_MS) {
                playerAttackTimer = 0;
                playerTarget.entity.hp -= playerDamage(state);
                if (playerTarget.entity.hp <= 0) {
                    const earned = awardCommits(1 + playerRewardBonus(state), now);
                    state.totalSquashed += 1;
                    squashStreak += 1;
                    showToast(`+${earned.toFixed(1)} Commits!`);
                    if (squashStreak % 10 === 0) {
                        character.setPose('wave');
                        showToast(`${squashStreak} squash streak! 🎉`, 2200);
                    }
                    removeBug(playerTarget);
                    playerTarget = null;
                    character.setPose('idle');
                }
            }
        }
    }

    // ---- Robots ----
    /** @type {Array<{entity: ReturnType<typeof buildRobot>, target: any, attackTimer: number}>} */
    const robots = [];
    function syncRobotCount() {
        while (robots.length < state.robotLevel) {
            const entity = buildRobot();
            entity.root.position.copy(randomFloorPoint());
            scene.add(entity.root);
            robots.push({ entity, target: null, attackTimer: 0 });
        }
    }

    function updateRobot(robot, dtMs, now) {
        if (!robot.target || robot.target.dead) {
            robot.target = bugs.find(b => !b.claimedBy) || null;
            if (robot.target) robot.target.claimedBy = 'robot';
            robot.attackTimer = 0;
            if (!robot.target) return;
        }
        const toTarget = robot.target.pos.clone().sub(robot.entity.root.position);
        toTarget.y = 0;
        const dist = toTarget.length();
        if (dist > ARRIVE_RADIUS) {
            toTarget.normalize();
            robot.entity.root.position.addScaledVector(toTarget, WALK_SPEED * 0.8 * (dtMs / 1000));
            robot.entity.root.rotation.y = Math.atan2(toTarget.x, toTarget.z);
        } else {
            robot.attackTimer += dtMs;
            if (robot.attackTimer >= ATTACK_TICK_MS * 1.3) {
                robot.attackTimer = 0;
                robot.entity.playZap();
                robot.target.entity.hp -= robotDamage() * globalMultiplier(state, now);
                if (robot.target.entity.hp <= 0) {
                    awardCommits(0.5, now);
                    state.totalSquashed += 1;
                    removeBug(robot.target);
                    robot.target = null;
                }
            }
        }
    }

    // ---- Ambient idle flavor (coffee-break sit) when nothing else is happening ----
    let ambientTimer = null;
    function scheduleAmbient() {
        clearTimeout(ambientTimer);
        ambientTimer = setTimeout(() => {
            const busy = playerTarget || character.getPose() === 'guard' || character.getPose() === 'wave';
            if (!busy && state.hasCoffeeBreak && Math.random() < 0.5) {
                character.setPose('sit', { persistent: true });
                setTimeout(() => {
                    if (character.getPose() === 'sit') character.setPose('idle');
                }, 3500);
            }
            scheduleAmbient();
        }, 8000 + Math.random() * 6000);
    }
    scheduleAmbient();

    // ---- Game loop ----
    let lastTick = performance.now();
    let saveCounter = 0;
    let rafId = null;
    function tick() {
        try {
            const now = performance.now();
            const dtMs = Math.min(now - lastTick, 6 * 60 * 60 * 1000);
            const dt = dtMs / 1000;
            lastTick = now;

            const rate = passiveRate(state);
            if (rate > 0) {
                const earned = rate * globalMultiplier(state, now) * dt;
                state.commits += earned;
                state.totalEarned += earned;
            }
            if (state.crunchActiveUntil && state.crunchActiveUntil <= now) state.crunchActiveUntil = 0;

            if (!document.hidden) {
                state.playSeconds += dt;
                if (state.playSeconds >= PLAYTIME_THRESHOLD_SEC && !state.highScoreSubmitted && highScoreInvite.style.display === 'none') {
                    highScoreInvite.style.display = 'block';
                }
            }

            syncRobotCount();
            const t = now / 1000;
            bugs.forEach(b => b.entity.update(t));
            robots.forEach(r => { r.entity.update(t); updateRobot(r, dtMs, now); });
            updatePlayer(dtMs, now);

            character.update();
            updateCamera();
            renderer.render(scene, camera);
            renderUI(now);

            saveCounter += dt;
            if (saveCounter > 5) { saveCounter = 0; saveState(state); }
        } catch (err) {
            console.error('[kc-game] tick error (continuing):', err);
        }
        rafId = requestAnimationFrame(tick);
    }

    function renderUI(now) {
        commitsValueEl.textContent = formatNum(state.commits);
        rankEl.textContent = currentRank(state.totalEarned);
        const rate = passiveRate(state);
        const mult = globalMultiplier(state, now);
        rateEl.textContent = rate > 0 ? `+${(rate * mult).toFixed(1)}/sec` : '';

        if (state.hasCrunchMode) {
            crunchBtn.style.display = 'block';
            const onCooldown = state.crunchCooldownUntil > now;
            const active = state.crunchActiveUntil > now;
            crunchBtn.disabled = onCooldown;
            crunchBtn.textContent = active
                ? `CRUNCHING… ${Math.ceil((state.crunchActiveUntil - now) / 1000)}s`
                : onCooldown
                    ? `COOLDOWN ${Math.ceil((state.crunchCooldownUntil - now) / 1000)}s`
                    : 'CRUNCH MODE';
        }
        renderUpgrades();
    }

    let lastUpgradeSignature = '';
    function renderUpgrades() {
        const visible = UPGRADES.filter(u => u.visible(state));
        const signature = visible.map(u => `${u.id}:${u.owned ? u.owned(state) : u.level(state)}:${Math.floor(state.commits)}`).join('|');
        if (signature === lastUpgradeSignature) return;
        lastUpgradeSignature = signature;

        upgradesEl.innerHTML = visible.map(u => {
            const owned = u.oneTime ? u.owned(state) : false;
            const cost = u.cost(state);
            const affordable = state.commits >= cost;
            const levelLabel = u.oneTime ? (owned ? 'OWNED' : `${cost} Commits`) : `Lv.${u.level(state)} — ${cost} Commits`;
            return `
                <div class="kc-upgrade ${owned ? 'kc-owned' : ''}">
                    <div class="kc-upgrade-info">
                        <div class="kc-upgrade-name">${u.name}</div>
                        <div class="kc-upgrade-desc">${u.desc}</div>
                    </div>
                    <button class="kc-upgrade-buy" data-id="${u.id}" ${owned || !affordable ? 'disabled' : ''}>
                        ${owned ? '✓' : levelLabel}
                    </button>
                </div>`;
        }).join('');

        upgradesEl.querySelectorAll('.kc-upgrade-buy').forEach(btn => {
            btn.addEventListener('click', () => {
                const upgrade = UPGRADES.find(u => u.id === btn.dataset.id);
                if (!upgrade) return;
                const cost = upgrade.cost(state);
                if (state.commits < cost) return;
                state.commits -= cost;
                upgrade.buy(state);
                lastUpgradeSignature = '';
                showToast(`${upgrade.name} acquired!`);
                saveState(state);
            });
        });
    }

    crunchBtn.addEventListener('click', () => {
        const now = performance.now();
        if (state.crunchCooldownUntil > now) return;
        state.crunchActiveUntil = now + CRUNCH_DURATION_MS;
        state.crunchCooldownUntil = now + CRUNCH_DURATION_MS + CRUNCH_COOLDOWN_MS;
        showToast('Crunch mode engaged — 3x income!', 2200);
    });

    closeBtn.addEventListener('click', () => {
        saveState(state);
        cancelAnimationFrame(rafId);
        clearTimeout(ambientTimer);
        clearTimeout(spawnTimer);
        window.removeEventListener('resize', resizeStage);
        renderer.dispose();
        container.remove();
        launched = false;
    });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeBtn.click(); });

    highScoreDismissBtn.addEventListener('click', () => { highScoreInvite.style.display = 'none'; });
    highScoreSubmitBtn.addEventListener('click', async () => {
        highScoreSubmitBtn.disabled = true;
        highScoreSubmitBtn.textContent = 'SENDING…';
        try {
            await fetch(HIGHSCORE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: (nameInput.value || 'Anonymous').slice(0, 40),
                    score: Math.floor(state.totalEarned),
                    rank: currentRank(state.totalEarned),
                    playMinutes: Math.round(state.playSeconds / 60),
                }),
            });
            state.highScoreSubmitted = true;
            saveState(state);
            highScoreInvite.innerHTML = '<p>Sent! Thanks for playing. 🎉</p>';
        } catch {
            highScoreSubmitBtn.disabled = false;
            highScoreSubmitBtn.textContent = 'SEND HIGH SCORE';
            showToast("Couldn't send right now — try again later.");
        }
    });

    // Kick things off.
    syncRobotCount();
    scheduleNextSpawn();
    spawnBug();
    setTimeout(() => spawnBug(), 400);
    tick();
}

function initKonamiListener() {
    const sequence = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
    let idx = 0;
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (key === sequence[idx]) {
            idx++;
            if (idx === sequence.length) { idx = 0; launchGame(); }
        } else {
            idx = key === sequence[0] ? 1 : 0;
        }
    });
    console.log('%cEvery code minion has a secret.', 'color:#00d2ff;font-size:14px;font-weight:bold;');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKonamiListener);
} else {
    initKonamiListener();
}
