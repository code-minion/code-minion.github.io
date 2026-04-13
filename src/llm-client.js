/**
 * llm-client.js — Frontend API client for the LLM BFF
 *
 * Supports multi-turn conversation history and a system prompt injected
 * server-side as a Gemini systemInstruction.
 */

import { getTurnstileToken } from './turnstile.js';

const BFF_URL = 'https://llm-bff-psi.vercel.app/api/chat';

// Max conversation turns to keep in history before declaring context exhausted.
// Each turn = 1 user message + 1 model reply.
// Gemini 2.5 Flash has a large context window, but we cap conservatively to
// keep costs reasonable and ensure a clean UX signal when it ends.
const MAX_TURNS = 20;

let cachedSessionToken = null;

/**
 * Sends a prompt with conversation history to the BFF.
 * @param {string} prompt — The user's latest message
 * @param {Array}  history — [{role:'user'|'model', text:string}, ...]
 * @returns {Promise<{reply: string, finishReason: string}>}
 */
export async function sendMessage(prompt, history = [], chatId = null) {
    if (!prompt?.trim()) throw new Error('Prompt cannot be empty');

    let turnstileToken = null;
    
    // Only fetch Turnstile if we don't have a valid session token yet
    if (!cachedSessionToken) {
        turnstileToken = await getTurnstileToken();
    }

    const res = await fetch(BFF_URL, {
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

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // If session expired or failed, clear token so next attempt retries Turnstile
        cachedSessionToken = null;
        throw new Error(err.error || `BFF returned ${res.status}`);
    }

    const data = await res.json();
    
    // Cache the new session token for subsequent messages
    if (data.sessionToken) {
        cachedSessionToken = data.sessionToken;
    }

    return { reply: data.response, finishReason: data.finishReason };
}

export { MAX_TURNS };
