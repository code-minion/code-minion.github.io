import { test } from 'node:test';
import assert from 'node:assert/strict';

test('sendMessage rejects an oversized prompt before any network call', async () => {
    const { sendMessage, ChatError, MAX_PROMPT_CHARS } = await import(`../src/llm-client.js?oversized=${Date.now()}`);
    let fetched = false;
    const original = globalThis.fetch;
    globalThis.fetch = () => {
        fetched = true;
        throw new Error('fetch should not run');
    };
    try {
        await assert.rejects(
            () => sendMessage('A'.repeat(MAX_PROMPT_CHARS + 1), [], 'chat-test', true),
            (err) => {
                assert.ok(err instanceof ChatError);
                assert.equal(err.retryHint, 'input');
                assert.match(err.message, /oversized prompt/);
                return true;
            },
        );
        assert.equal(fetched, false);
        assert.equal(MAX_PROMPT_CHARS, 4000);
    } finally {
        globalThis.fetch = original;
    }
});

function useLocalTurnstileBypass() {
    globalThis.window = { location: { hostname: '127.0.0.1' } };
}

test('sendMessage accepts a prompt at the BFF limit and sends a Turnstile token', async () => {
    useLocalTurnstileBypass();
    const { sendMessage, MAX_PROMPT_CHARS } = await import(`../src/llm-client.js?atlimit=${Date.now()}`);
    const original = globalThis.fetch;
    let posted;
    globalThis.fetch = async (_url, init) => {
        posted = JSON.parse(init.body);
        assert.equal(posted.prompt.length, MAX_PROMPT_CHARS);
        return new Response(JSON.stringify({ response: 'ok', finishReason: 'STOP', sessionToken: 'sess-1' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };
    try {
        const result = await sendMessage('B'.repeat(MAX_PROMPT_CHARS), [], 'chat-test', true);
        assert.equal(result.reply, 'ok');
        assert.equal(result.sessionReady, true);
        assert.equal(posted.turnstileToken, 'LOCALHOST_DEV_BYPASS');
        assert.equal(Object.hasOwn(posted, 'sessionToken'), false);
        assert.notEqual(posted.turnstileToken, null);
    } finally {
        globalThis.fetch = original;
    }
});

test('a stored sessionToken is sent instead of another Turnstile token', async () => {
    useLocalTurnstileBypass();
    const { sendMessage } = await import(`../src/llm-client.js?session=${Date.now()}`);
    const original = globalThis.fetch;
    const posted = [];
    globalThis.fetch = async (_url, init) => {
        posted.push(JSON.parse(init.body));
        return new Response(JSON.stringify({
            response: 'ok',
            finishReason: 'STOP',
            sessionToken: 'sess-kept',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
        await sendMessage('first', [], 'chat-session', true);
        await sendMessage('second', [], 'chat-session', false);
        assert.equal(posted[0].turnstileToken, 'LOCALHOST_DEV_BYPASS');
        assert.equal(Object.hasOwn(posted[0], 'sessionToken'), false);
        assert.equal(posted[1].sessionToken, 'sess-kept');
        assert.equal(Object.hasOwn(posted[1], 'turnstileToken'), false);
    } finally {
        globalThis.fetch = original;
    }
});
