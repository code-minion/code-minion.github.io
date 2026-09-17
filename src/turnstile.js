/**
 * turnstile.js — Cloudflare Turnstile widget manager
 *
 * Usage:
 *   import { prefetchTurnstileToken, getTurnstileToken, shouldHoldInputForTurnstile } from './turnstile.js';
 *   prefetchTurnstileToken();               // fire-and-forget, warm up a token early
 *   const token = await getTurnstileToken(); // wait for it when actually sending
 *   // Hold the composer only while prefetchStatus === 'pending' after message #1.
 */

// ⚠️ Replace this value with your Cloudflare Turnstile SITE KEY from the dashboard.
// Never put the Secret Key here — that belongs only in Vercel env vars.
const TURNSTILE_SITE_KEY = '0x4AAAAAAC0uqHgTVbTJsHiU';

const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;
const SCRIPT_TIMEOUT_MS = 8000;
const WIDGET_TIMEOUT_MS = 10000;
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let widgetId = null;
// The in-flight/resolved token fetch. Kept warm so a prefetch started early
// (e.g. when the chat panel opens) is reused by the eventual getTurnstileToken()
// call instead of starting a fresh, slower fetch right when the user hits send.
let pendingTokenPromise = null;
let scriptLoadPromise = null;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Chat should only disable the composer while a token fetch is still in flight.
 * A failed or idle prefetch must not lock the visitor out — message #2+ still
 * goes through getTurnstileToken() at send time.
 */
export function shouldHoldInputForTurnstile(historyLength, prefetchStatus) {
    return historyLength > 0 && prefetchStatus === 'pending';
}

/**
 * Injects the Cloudflare Turnstile script if not already loaded.
 * Rejects on network/blocker errors and on timeout so a hung load cannot
 * leave the chat waiting forever.
 */
function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve();
    if (scriptLoadPromise) return scriptLoadPromise;

    scriptLoadPromise = new Promise((resolve, reject) => {
        let settled = false;
        let timeoutId;
        let scriptEl = null;

        const succeed = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            if (window.turnstile) {
                resolve();
            } else {
                scriptLoadPromise = null;
                scriptEl?.remove();
                reject(new Error('Turnstile script loaded without API'));
            }
        };
        const fail = (reason) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            scriptLoadPromise = null;
            scriptEl?.remove();
            reject(new Error(reason));
        };

        timeoutId = setTimeout(() => {
            fail('Turnstile script load timed out');
        }, SCRIPT_TIMEOUT_MS);

        const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);
        if (existing) {
            scriptEl = existing;
            existing.addEventListener('load', succeed);
            existing.addEventListener('error', () => fail('Turnstile script failed to load'));
            return;
        }

        const script = document.createElement('script');
        scriptEl = script;
        script.src = TURNSTILE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = succeed;
        script.onerror = () => fail('Turnstile script failed to load');
        document.head.appendChild(script);
    });

    return scriptLoadPromise;
}

/**
 * Renders (or re-renders) the widget once and resolves with a single-use token.
 */
function renderWidgetAndWait() {
    // Find or create the hidden container div for the widget
    let container = document.getElementById('cf-turnstile-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'cf-turnstile-container';
        // Hide by default, only show when rendering a challenge
        container.style.display = 'none';
        container.style.justifyContent = 'center';
        container.style.margin = '10px 0';

        const chatInputArea = document.querySelector('.chat-input-area');
        if (chatInputArea) {
            chatInputArea.parentElement.insertBefore(container, chatInputArea);
        } else {
            document.body.appendChild(container);
        }
    }

    // Re-render the widget to get a fresh single-use token
    if (widgetId !== null) {
        window.turnstile.remove(widgetId);
        widgetId = null;
    }

    container.style.display = 'flex'; // Show for challenge

    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn) => (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            container.style.display = 'none';
            fn(value);
        };

        const timeoutId = setTimeout(() => {
            finish(reject)(new Error('Turnstile widget timed out'));
        }, WIDGET_TIMEOUT_MS);

        widgetId = window.turnstile.render('#cf-turnstile-container', {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token) => finish(resolve)(token),
            'error-callback': () => finish(reject)(new Error('Turnstile widget failed')),
            'expired-callback': () => finish(reject)(new Error('Turnstile token expired')),
        });
    });
}

/**
 * Fetches a token, silently retrying a couple of times on transient widget
 * errors (network blips, a stale/expired render) before giving up — most of
 * what looks like a "high failure rate" is a single bad attempt, not a
 * persistent block, so a quiet retry clears it without bothering the visitor.
 */
async function fetchTokenWithRetry() {
    for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
        try {
            return await renderWidgetAndWait();
        } catch (e) {
            if (attempt === RETRY_ATTEMPTS) throw e;
            // Timeouts mean the challenge never came back — retrying the same
            // hung widget just stretches a dead-end. Leave retries for fast
            // widget errors (network blip, expired token).
            if (e?.message && String(e.message).includes('timed out')) throw e;
            await wait(RETRY_DELAY_MS);
        }
    }
}

function startTokenFetch() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return Promise.resolve('LOCALHOST_DEV_BYPASS');
    }
    return loadTurnstileScript().then(() => fetchTokenWithRetry());
}

/**
 * Kicks off fetching a token in the background without waiting for it.
 * Safe to call repeatedly — reuses the same in-flight/resolved fetch until
 * it's consumed by getTurnstileToken(). Call this as early as there's a
 * reasonable signal the visitor will chat (e.g. opening the chat panel), so
 * the token is likely already resolved by the time it's actually needed.
 */
export function prefetchTurnstileToken() {
    if (!pendingTokenPromise) {
        const wrapped = startTokenFetch().catch((err) => {
            // Don't cache a rejection — the next prefetch/send must be able to
            // start a fresh attempt instead of replaying a permanent failure.
            if (pendingTokenPromise === wrapped) {
                pendingTokenPromise = null;
            }
            throw err;
        });
        pendingTokenPromise = wrapped;
    }
    return pendingTokenPromise;
}

/**
 * Returns a fresh Turnstile token, reusing a prefetch already in flight if
 * there is one. Each token is one-time use, so consuming it clears the cache
 * and the next call starts a new fetch.
 */
export async function getTurnstileToken() {
    const promise = prefetchTurnstileToken();
    try {
        return await promise;
    } finally {
        pendingTokenPromise = null;
    }
}
