/**
 * llm-client.js — Frontend API client for the LLM BFF
 *
 * Supports multi-turn conversation history and a system prompt injected
 * server-side as a Gemini systemInstruction.
 */

import { getTurnstileToken } from './turnstile.js';

const BFF_URL = import.meta.env.VITE_BFF_CHAT_URL || 'https://llm-bff-psi.vercel.app/api/chat';

// Max conversation turns to keep in history before declaring context exhausted.
// Each turn = 1 user message + 1 model reply.
// Gemini's flash models have a large context window, but we cap conservatively to
// keep costs reasonable and ensure a clean UX signal when it ends.
const MAX_TURNS = 20;

let cachedSessionToken = null;

/**
 * A chat-facing error that carries a `retryHint` alongside its message, so the
 * UI can suggest the *right* recovery action instead of a generic "try again":
 *   'refresh' — reloading the page will fix it (stale session/verification)
 *   'wait'    — a transient hiccup; trying again shortly is enough
 *   'later'   — a real backend problem; the owner's already been notified
 *   'input'   — the visitor needs to change what they typed
 *   'none'    — nothing actionable to add
 */
export class ChatError extends Error {
    constructor(message, retryHint = 'none') {
        super(message);
        this.name = 'ChatError';
        this.retryHint = retryHint;
    }
}

/**
 * Maps a retryHint to a short, human suggestion to append after the base
 * error message. Pure function — no DOM/network access — so it's easy to unit test.
 */
export function suggestionForRetryHint(retryHint) {
    switch (retryHint) {
        case 'refresh':
            return ' Try refreshing the page.';
        case 'wait':
            return ' Give it a few seconds and try again.';
        case 'later':
            return '';
        default:
            return '';
    }
}

/**
 * Sends a prompt with conversation history to the BFF.
 * @param {string} prompt — The user's latest message
 * @param {Array}  history — [{role:'user'|'model', text:string}, ...]
 * @param {string} chatId
 * @param {boolean} isFirstMessage — When true, sends immediately without waiting
 *   on Turnstile (the BFF grants one free pass per chatId for a genuine first
 *   message). Every message after that must carry a verified token.
 * @returns {Promise<{reply: string, finishReason: string}>}
 */
export async function sendMessage(prompt, history = [], chatId = null, isFirstMessage = false) {
    if (!prompt?.trim()) throw new ChatError('Prompt cannot be empty', 'input');

    let turnstileToken = null;

    // Only fetch Turnstile if we don't have a valid session token yet. The very
    // first message of a conversation skips this entirely — the BFF lets it
    // through on a one-time free pass so the visitor isn't kept waiting before
    // their first reply. A background prefetch (started when the chat opened)
    // is usually already warm by the time message #2 needs a real token.
    if (!cachedSessionToken && !isFirstMessage) {
        try {
            turnstileToken = await getTurnstileToken();
        } catch (turnstileErr) {
            throw new ChatError(
                "I couldn't verify your session in time. Please try again in a moment.",
                'wait'
            );
        }
    }

    let res;
    try {
        res = await fetch(BFF_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                turnstileToken,
                sessionToken: cachedSessionToken,
                history,
                chatId
            }),
        });
    } catch (networkErr) {
        // fetch() itself threw — the BFF was unreachable (offline, DNS, CORS
        // preflight failure, etc.), not something the BFF told us about.
        throw new ChatError(
            "I couldn't reach Bradley's AI backend. Please check your connection and try refreshing the page.",
            'refresh'
        );
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // If session expired or failed, clear token so next attempt retries Turnstile
        cachedSessionToken = null;
        throw new ChatError(err.error || `BFF returned ${res.status}`, err.retryHint || 'none');
    }

    const data = await res.json();

    // Cache the new session token for subsequent messages
    if (data.sessionToken) {
        cachedSessionToken = data.sessionToken;
    }

    return { reply: data.response, finishReason: data.finishReason };
}

export { MAX_TURNS };
