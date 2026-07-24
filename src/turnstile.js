/**
 * turnstile.js — Cloudflare Turnstile widget manager
 *
 * Usage:
 *   import { prefetchTurnstileToken, getTurnstileToken } from './turnstile.js';
 *   prefetchTurnstileToken();               // fire-and-forget, warm up a token early
 *   const token = await getTurnstileToken(); // wait for it when actually sending
 */

// ⚠️ Replace this value with your Cloudflare Turnstile SITE KEY from the dashboard.
// Never put the Secret Key here — that belongs only in Vercel env vars.
const TURNSTILE_SITE_KEY = '0x4AAAAAAC0uqHgTVbTJsHiU';

const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;

let widgetId = null;
// The in-flight/resolved token fetch. Kept warm so a prefetch started early
// (e.g. when the chat panel opens) is reused by the eventual getTurnstileToken()
// call instead of starting a fresh, slower fetch right when the user hits send.
let pendingTokenPromise = null;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Injects the Cloudflare Turnstile script if not already loaded.
 */
function loadTurnstileScript() {
    return new Promise((resolve) => {
        if (window.turnstile) return resolve();
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        document.head.appendChild(script);
    });
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
        widgetId = window.turnstile.render('#cf-turnstile-container', {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token) => {
                container.style.display = 'none'; // Hide once done
                resolve(token);
            },
            'error-callback': () => {
                container.style.display = 'none';
                reject(new Error('Turnstile widget failed'));
            },
            'expired-callback': () => {
                container.style.display = 'none';
                reject(new Error('Turnstile token expired'));
            },
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
        pendingTokenPromise = startTokenFetch();
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
