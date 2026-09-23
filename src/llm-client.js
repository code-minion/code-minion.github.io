/**
 * llm-client.js — Frontend API client for the LLM BFF
 *
 * Supports multi-turn conversation history and a system prompt injected
 * server-side as a Gemini systemInstruction.
 */

import { getTurnstileToken } from './turnstile.js';

const BFF_URL = import.meta.env?.VITE_BFF_CHAT_URL || 'https://llm-bff-psi.vercel.app/api/chat';

// Max conversation turns to keep in history before declaring context exhausted.
// Each turn = 1 user message + 1 model reply.
// Gemini's flash models have a large context window, but we cap conservatively to
// keep costs reasonable and ensure a clean UX signal when it ends.
const MAX_TURNS = 20;

// The chat BFF rejects prompts longer than this with
// 400 {"error":"Invalid or oversized prompt","retryHint":"input"}.
// 4000 is accepted; 4001 is not. Keep the client check in step with that.
const MAX_PROMPT_CHARS = 4000;

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
 * The live BFF requires a Turnstile token on every chat POST that does not
 * already carry a server sessionToken — including the first message. A null
 * token is a 401. `isFirstMessage` is accepted so existing callers keep
 * working; it no longer skips verification.
 * @param {string} prompt — The user's latest message
 * @param {Array}  history — [{role:'user'|'model', text:string}, ...]
 * @param {string} chatId
 * @param {boolean} [_isFirstMessage] — unused; verification follows the session
 * @returns {Promise<{reply: string, finishReason: string, sessionReady: boolean}>}
 */
export async function sendMessage(prompt, history = [], chatId = null, _isFirstMessage = false) {
    void _isFirstMessage;
    const text = prompt?.trim() ?? '';
    if (!text) throw new ChatError('Prompt cannot be empty', 'input');
    if (text.length > MAX_PROMPT_CHARS) {
        throw new ChatError('Invalid or oversized prompt', 'input');
    }

    // Omit absent tokens. JSON null is not a token, and the BFF rejects it.
    const body = { prompt: text, history, chatId };
    if (cachedSessionToken) {
        body.sessionToken = cachedSessionToken;
    } else {
        try {
            body.turnstileToken = await getTurnstileToken();
        } catch {
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
            body: JSON.stringify(body),
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

    return { reply: data.response, finishReason: data.finishReason, sessionReady: Boolean(cachedSessionToken) };
}

export { MAX_TURNS, MAX_PROMPT_CHARS };
