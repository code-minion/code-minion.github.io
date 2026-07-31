/**
 * konami-redirect.js — the only trace of the hidden game on the main page.
 * Enter the Konami code anywhere on the site and it navigates to the
 * dedicated fullscreen game page. Keeps the main bundle free of the game's
 * Three.js scene/weapon/enemy code entirely.
 */
const sequence = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
let idx = 0;

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === sequence[idx]) {
        idx++;
        if (idx === sequence.length) { idx = 0; window.location.href = './survivor.html'; }
    } else {
        idx = key === sequence[0] ? 1 : 0;
    }
});

console.log('%cEvery code minion has a secret.', 'color:#00d2ff;font-size:14px;font-weight:bold;');
