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

test('sendMessage accepts a prompt at the BFF limit', async () => {
    const { sendMessage, MAX_PROMPT_CHARS } = await import(`../src/llm-client.js?atlimit=${Date.now()}`);
    const original = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        assert.equal(body.prompt.length, MAX_PROMPT_CHARS);
        return new Response(JSON.stringify({ response: 'ok', finishReason: 'STOP' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };
    try {
        const result = await sendMessage('B'.repeat(MAX_PROMPT_CHARS), [], 'chat-test', true);
        assert.equal(result.reply, 'ok');
    } finally {
        globalThis.fetch = original;
    }
});
