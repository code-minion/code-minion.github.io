import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

test('chat and highscore BFF URLs default to production and allow Vite overrides', () => {
    const chat = readFileSync(join(root, 'src/llm-client.js'), 'utf8');
    const game = readFileSync(join(root, 'src/game.js'), 'utf8');
    const example = readFileSync(join(root, '.env.example'), 'utf8');

    assert.match(
        chat,
        /const BFF_URL = import\.meta\.env\.VITE_BFF_CHAT_URL \|\| 'https:\/\/llm-bff-psi\.vercel\.app\/api\/chat';/,
    );
    assert.match(
        game,
        /const HIGHSCORE_ENDPOINT = import\.meta\.env\.VITE_BFF_HIGHSCORE_URL \|\| 'https:\/\/llm-bff-psi\.vercel\.app\/api\/game-highscore';/,
    );
    assert.match(example, /VITE_BFF_CHAT_URL=http:\/\/127\.0\.0\.1:3000\/api\/chat/);
    assert.match(example, /VITE_BFF_HIGHSCORE_URL=http:\/\/127\.0\.0\.1:3000\/api\/game-highscore/);
});
