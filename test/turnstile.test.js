import { test } from 'node:test';
import assert from 'node:assert/strict';

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function installDom({ hostname = 'example.com' } = {}) {
    const scripts = [];
    const head = {
        appendChild(el) {
            scripts.push(el);
            return el;
        },
    };
    const body = {
        appendChild(el) {
            this.child = el;
            return el;
        },
    };

    globalThis.window = globalThis;
    globalThis.window.location = { hostname };
    globalThis.window.turnstile = undefined;

    globalThis.document = {
        head,
        body,
        getElementById: () => null,
        querySelector: (sel) => {
            if (sel === `script[src="${TURNSTILE_SCRIPT_SRC}"]`) {
                return scripts.find((s) => s.src === TURNSTILE_SCRIPT_SRC && !s._removed) || null;
            }
            if (sel === '.chat-input-area') return null;
            return null;
        },
        createElement: (tag) => {
            const el = {
                tagName: tag,
                id: '',
                src: '',
                async: false,
                defer: false,
                onload: null,
                onerror: null,
                style: {},
                dataset: {},
                children: [],
                _removed: false,
                addEventListener(type, fn) {
                    this._listeners = this._listeners || {};
                    this._listeners[type] = this._listeners[type] || [];
                    this._listeners[type].push(fn);
                },
                remove() {
                    this._removed = true;
                    const idx = scripts.indexOf(this);
                    if (idx !== -1) scripts.splice(idx, 1);
                },
            };
            return el;
        },
    };

    return { scripts, head };
}

async function loadTurnstileModule() {
    return import(`../src/turnstile.js?test=${Date.now()}-${Math.random()}`);
}

test('shouldHoldInputForTurnstile only while a prefetch is in flight after the first turn', async () => {
    installDom({ hostname: 'localhost' });
    const { shouldHoldInputForTurnstile } = await loadTurnstileModule();

    assert.equal(shouldHoldInputForTurnstile(0, 'pending'), false);
    assert.equal(shouldHoldInputForTurnstile(2, 'pending'), true);
    assert.equal(shouldHoldInputForTurnstile(2, 'failed'), false);
    assert.equal(shouldHoldInputForTurnstile(2, 'ready'), false);
    assert.equal(shouldHoldInputForTurnstile(2, 'idle'), false);
    assert.equal(shouldHoldInputForTurnstile(0, 'failed'), false);
});

test('localhost bypass still returns a token without loading Turnstile', async () => {
    const { scripts } = installDom({ hostname: 'localhost' });
    const { prefetchTurnstileToken, getTurnstileToken } = await loadTurnstileModule();

    await prefetchTurnstileToken();
    const token = await getTurnstileToken();
    assert.equal(token, 'LOCALHOST_DEV_BYPASS');
    assert.equal(scripts.length, 0);
});

test('127.0.0.1 bypass matches localhost', async () => {
    installDom({ hostname: '127.0.0.1' });
    const { getTurnstileToken } = await loadTurnstileModule();
    assert.equal(await getTurnstileToken(), 'LOCALHOST_DEV_BYPASS');
});

test('a failed prefetch is not cached, so a later send can retry', async () => {
    const { scripts } = installDom({ hostname: 'example.com' });
    const { prefetchTurnstileToken, getTurnstileToken } = await loadTurnstileModule();

    const first = prefetchTurnstileToken();
    assert.equal(scripts.length, 1);
    scripts[0].onerror();
    await assert.rejects(first, /Turnstile script failed to load/);
    assert.equal(scripts.length, 0, 'failed script tag is removed so a retry can inject a fresh one');

    const second = prefetchTurnstileToken();
    assert.equal(scripts.length, 1, 'a new fetch starts after a cached rejection is cleared');
    window.turnstile = {
        render(_sel, opts) {
            queueMicrotask(() => opts.callback('token-from-retry'));
            return 'widget-1';
        },
        remove() {},
    };
    scripts[0].onload();
    assert.equal(await second, 'token-from-retry');

    const token = await getTurnstileToken();
    assert.equal(token, 'token-from-retry');
});

test('getTurnstileToken retries after a previous prefetch rejection', async () => {
    const { scripts } = installDom({ hostname: 'example.com' });
    const { prefetchTurnstileToken, getTurnstileToken } = await loadTurnstileModule();

    const first = prefetchTurnstileToken();
    scripts[0].onerror();
    await assert.rejects(first);

    const pending = getTurnstileToken();
    window.turnstile = {
        render(_sel, opts) {
            queueMicrotask(() => opts.callback('fresh-token'));
            return 'widget-2';
        },
        remove() {},
    };
    scripts[0].onload();
    assert.equal(await pending, 'fresh-token');
});
