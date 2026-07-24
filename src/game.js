/**
 * game.js — hidden incremental game built around the Kit Chan 3D rig.
 * Discovered via the Konami code. Fully client-side (localStorage), except
 * an optional high-score ping to Discord after 15+ minutes of active play.
 *
 * Currency: "Commits". Click to earn; spend on upgrades that unlock the
 * rig's walk/sit/guard poses as flavor + passive income + burst multiplier.
 */
import * as THREE from 'three';
import { buildKitChanCharacter } from './kit-chan-character.js';
import { track } from './analytics.js';

const STORAGE_KEY = 'kitchan-idle-game-v1';
const HIGHSCORE_ENDPOINT = 'https://llm-bff-psi.vercel.app/api/game-highscore';
const PLAYTIME_THRESHOLD_SEC = 15 * 60;
const CRUNCH_DURATION_MS = 8000;
const CRUNCH_COOLDOWN_MS = 30000;

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
        clickLevel: 0,
        duckLevel: 0,
        standingDeskLevel: 0,
        hasCoffeeBreak: false,
        hasPairBot: false,
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
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // localStorage unavailable (private mode, quota) — game still works
        // for this session, it just won't persist.
    }
}

function costFor(baseCost, level) {
    return Math.ceil(baseCost * Math.pow(1.15, level));
}

function currentRank(totalEarned) {
    let rank = RANKS[0].title;
    for (const r of RANKS) {
        if (totalEarned >= r.at) rank = r.title;
    }
    return rank;
}

function clickPowerFor(state) {
    return 1 + state.clickLevel * 1 + state.duckLevel * 0.5;
}

function passiveRateFor(state) {
    return (state.hasCoffeeBreak ? 1 : 0) + state.standingDeskLevel * 1;
}

function globalMultiplierFor(state, now) {
    let mult = state.hasPairBot ? 1.5 : 1;
    if (state.crunchActiveUntil > now) mult *= 3;
    return mult;
}

const UPGRADES = [
    {
        id: 'keyboard',
        name: 'Better Keyboard',
        desc: '+1 Commit per click',
        baseCost: 10,
        level: (s) => s.clickLevel,
        cost: (s) => costFor(10, s.clickLevel),
        visible: () => true,
        buy: (s) => { s.clickLevel += 1; },
    },
    {
        id: 'duck',
        name: 'Rubber Duck',
        desc: '+0.5 Commits per click',
        baseCost: 25,
        level: (s) => s.duckLevel,
        cost: (s) => costFor(25, s.duckLevel),
        visible: () => true,
        buy: (s) => { s.duckLevel += 1; },
    },
    {
        id: 'coffee',
        name: 'Coffee Break',
        desc: 'Unlocks passive income — +1 Commit/sec, even away from keyboard',
        baseCost: 50,
        oneTime: true,
        owned: (s) => s.hasCoffeeBreak,
        cost: () => 50,
        visible: () => true,
        buy: (s) => { s.hasCoffeeBreak = true; },
    },
    {
        id: 'standingDesk',
        name: 'Standing Desk',
        desc: '+1 Commit/sec passive income',
        baseCost: 100,
        level: (s) => s.standingDeskLevel,
        cost: (s) => costFor(100, s.standingDeskLevel),
        visible: (s) => s.hasCoffeeBreak,
        buy: (s) => { s.standingDeskLevel += 1; },
    },
    {
        id: 'pairBot',
        name: 'Pair Programming Bot',
        desc: 'Unlocks the walk cycle — +50% to ALL income, permanently',
        baseCost: 300,
        oneTime: true,
        owned: (s) => s.hasPairBot,
        cost: () => 300,
        visible: () => true,
        buy: (s) => { s.hasPairBot = true; },
    },
    {
        id: 'crunch',
        name: 'Crunch Mode',
        desc: 'Unlocks an activatable guard stance — 3x income for 8s (30s cooldown)',
        baseCost: 750,
        oneTime: true,
        owned: (s) => s.hasCrunchMode,
        cost: () => 750,
        visible: () => true,
        buy: (s) => { s.hasCrunchMode = true; },
    },
];

function formatNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return Math.floor(n).toString();
}

const PANEL_HTML = `
<div id="kc-game-backdrop">
  <div id="kc-game-panel">
    <button id="kc-game-close" aria-label="Close">&times;</button>
    <div class="kc-header">
      <div class="kc-title">CODE MINION: IDLE</div>
      <div class="kc-rank"></div>
    </div>
    <div id="kc-stage-wrap">
      <canvas id="kc-stage-canvas"></canvas>
    </div>
    <div class="kc-commits">
      <span id="kc-commits-value">0</span> Commits
      <div class="kc-rate"></div>
    </div>
    <button id="kc-click-btn">COMMIT CODE</button>
    <button id="kc-crunch-btn" style="display:none;">CRUNCH MODE</button>
    <div class="kc-upgrades" id="kc-upgrades"></div>
    <div id="kc-highscore-invite" style="display:none;">
      <p>You've been at this for 15+ minutes. Want to send your high score to Bradley?</p>
      <input id="kc-name-input" type="text" placeholder="Name (optional)" maxlength="40">
      <button id="kc-highscore-submit">SEND HIGH SCORE</button>
      <button id="kc-highscore-dismiss">NOT NOW</button>
    </div>
    <div id="kc-toast"></div>
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
    const commitsValueEl = document.getElementById('kc-commits-value');
    const rateEl = document.querySelector('.kc-rate');
    const rankEl = document.querySelector('.kc-rank');
    const clickBtn = document.getElementById('kc-click-btn');
    const crunchBtn = document.getElementById('kc-crunch-btn');
    const upgradesEl = document.getElementById('kc-upgrades');
    const toastEl = document.getElementById('kc-toast');
    const highScoreInvite = document.getElementById('kc-highscore-invite');
    const nameInput = document.getElementById('kc-name-input');
    const highScoreSubmitBtn = document.getElementById('kc-highscore-submit');
    const highScoreDismissBtn = document.getElementById('kc-highscore-dismiss');

    let state = loadState();

    // ---- Three.js stage ----
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(0, 0.55, 1.7);
    camera.lookAt(0, 0.45, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambient = new THREE.AmbientLight(0xffffff, 1.8);
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
    dirLight.position.set(1.2, 2, 1.5);
    scene.add(ambient, dirLight);

    const ground = new THREE.Mesh(
        new THREE.CircleGeometry(0.7, 32),
        new THREE.MeshStandardMaterial({ color: 0x0f1a26, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const character = buildKitChanCharacter({ hoodieColor: 0x7C93A6 });
    scene.add(character.root);

    function resizeStage() {
        const wrap = document.getElementById('kc-stage-wrap');
        const size = wrap.clientWidth;
        renderer.setSize(size, size);
        camera.aspect = 1;
        camera.updateProjectionMatrix();
    }
    resizeStage();
    window.addEventListener('resize', resizeStage);

    // ---- Ambient flavor pose cycling (walk/sit) when nothing else is active ----
    let ambientTimer = null;
    function scheduleAmbient() {
        clearTimeout(ambientTimer);
        const activePose = character.getPose();
        if (activePose === 'wave' || activePose === 'guard') {
            ambientTimer = setTimeout(scheduleAmbient, 500);
            return;
        }
        const canWalk = state.hasPairBot;
        const canSit = state.hasCoffeeBreak;
        if (!canWalk && !canSit) {
            character.setPose('idle');
            ambientTimer = setTimeout(scheduleAmbient, 2000);
            return;
        }
        const pick = canWalk && canSit ? (Math.random() < 0.5 ? 'walk' : 'sit') : (canWalk ? 'walk' : 'sit');
        character.setPose(pick, { persistent: true });
        ambientTimer = setTimeout(() => {
            character.setPose('idle');
            ambientTimer = setTimeout(scheduleAmbient, 6000 + Math.random() * 4000);
        }, 4000 + Math.random() * 2000);
    }
    scheduleAmbient();

    // ---- Game loop ----
    let lastTick = performance.now();
    let saveCounter = 0;
    let rafId = null;
    function tick() {
        try {
            const now = performance.now();
            // Capped generously (not to a fraction of a second) — "Coffee Break"
            // is explicitly meant to earn Commits while the tab is backgrounded,
            // and rAF only fires again once it's foregrounded, so the elapsed
            // gap has to be honored, not truncated away. The cap only guards
            // against absurd single-frame jumps (system clock changes, a
            // suspended laptop for days), not normal tab-switching.
            const dt = Math.min((now - lastTick) / 1000, 6 * 60 * 60);
            lastTick = now;

            const mult = globalMultiplierFor(state, now);
            const passiveRate = passiveRateFor(state);
            if (passiveRate > 0) {
                const earned = passiveRate * mult * dt;
                state.commits += earned;
                state.totalEarned += earned;
            }

            if (state.crunchActiveUntil && state.crunchActiveUntil <= now) {
                state.crunchActiveUntil = 0;
            }

            if (!document.hidden) {
                state.playSeconds += dt;
                if (state.playSeconds >= PLAYTIME_THRESHOLD_SEC && !state.highScoreSubmitted && highScoreInvite.style.display === 'none') {
                    highScoreInvite.style.display = 'block';
                }
            }

            character.update();
            renderer.render(scene, camera);
            renderUI(now);

            saveCounter += dt;
            if (saveCounter > 5) {
                saveCounter = 0;
                saveState(state);
            }
        } catch (err) {
            console.error('[kc-game] tick error (continuing):', err);
        }
        rafId = requestAnimationFrame(tick);
    }

    function renderUI(now) {
        commitsValueEl.textContent = formatNum(state.commits);
        rankEl.textContent = currentRank(state.totalEarned);
        const passiveRate = passiveRateFor(state);
        const mult = globalMultiplierFor(state, now);
        rateEl.textContent = passiveRate > 0 ? `+${(passiveRate * mult).toFixed(1)}/sec` : '';

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

    let toastTimer = null;
    function showToast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('kc-toast-show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('kc-toast-show'), 1800);
    }

    clickBtn.addEventListener('click', () => {
        const now = performance.now();
        const mult = globalMultiplierFor(state, now);
        const earned = clickPowerFor(state) * mult;
        state.commits += earned;
        state.totalEarned += earned;
        character.setPose('wave');
    });

    crunchBtn.addEventListener('click', () => {
        const now = performance.now();
        if (state.crunchCooldownUntil > now) return;
        state.crunchActiveUntil = now + CRUNCH_DURATION_MS;
        state.crunchCooldownUntil = now + CRUNCH_DURATION_MS + CRUNCH_COOLDOWN_MS;
        character.setPose('guard', { persistent: true });
        setTimeout(() => {
            if (character.getPose() === 'guard') character.setPose('idle');
        }, CRUNCH_DURATION_MS);
        showToast('Crunch mode engaged — 3x income!');
    });

    closeBtn.addEventListener('click', () => {
        saveState(state);
        cancelAnimationFrame(rafId);
        clearTimeout(ambientTimer);
        window.removeEventListener('resize', resizeStage);
        renderer.dispose();
        container.remove();
        launched = false;
    });
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeBtn.click();
    });

    highScoreDismissBtn.addEventListener('click', () => {
        highScoreInvite.style.display = 'none';
    });
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

    tick();
}

function initKonamiListener() {
    const sequence = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
    let idx = 0;
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (key === sequence[idx]) {
            idx++;
            if (idx === sequence.length) {
                idx = 0;
                launchGame();
            }
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
