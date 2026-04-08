/**
 * turnstile.js — Cloudflare Turnstile widget manager
 *
 * Usage:
 *   import { getTurnstileToken } from './turnstile.js';
 *   const token = await getTurnstileToken();
 *   // pass token to BFF with your prompt
 */

// ⚠️ Replace this value with your Cloudflare Turnstile SITE KEY from the dashboard.
// Never put the Secret Key here — that belongs only in Vercel env vars.
const TURNSTILE_SITE_KEY = '0x4AAAAAAC0uqHgTVbTJsHiU';

let widgetId = null;

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
 * Returns a fresh Turnstile token, ready to be sent to the BFF.
 * Each token is one-time use — will fetch a new one on every call.
 */
export async function getTurnstileToken() {
    // Dev bypass: on localhost, skip the Cloudflare widget entirely.
    // The BFF accepts this sentinel token when the request comes from localhost.
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'LOCALHOST_DEV_BYPASS';
    }

    await loadTurnstileScript();

    // Find or create the hidden container div for the widget
    let container = document.getElementById('cf-turnstile-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'cf-turnstile-container';
        // Make it explicitly visible! In "Managed" mode, Cloudflare may decide 
        // to render a physical checkbox. If it's offscreen, it hangs forever.
        container.style.display = 'flex';
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
    }

    return new Promise((resolve, reject) => {
        widgetId = window.turnstile.render('#cf-turnstile-container', {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token) => resolve(token),
            'error-callback': () => reject(new Error('Turnstile widget failed')),
            'expired-callback': () => reject(new Error('Turnstile token expired')),
        });
    });
}
