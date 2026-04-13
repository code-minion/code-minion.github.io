/**
 * analytics.js
 * Wrapper for Umami Cloud analytics to track custom events securely.
 * Falls back to no-op if Umami is blocked by adblockers.
 */

export function track(eventName, data = {}) {
    try {
        if (window.umami && typeof window.umami.track === 'function') {
            window.umami.track(eventName, data);
            console.log(`[Analytics] Tracked: ${eventName}`, data);
        }
    } catch (e) {
        // Silently fail if tracking is blocked
    }
}
