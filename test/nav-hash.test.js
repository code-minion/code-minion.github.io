import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionFromHash } from '../src/nav-hash.js';

test('sectionFromHash accepts the home scene fragments', () => {
    for (const section of ['home', 'projects', 'skills', 'experience', 'contact']) {
        assert.equal(sectionFromHash('#' + section), section);
        assert.equal(sectionFromHash(section.toUpperCase()), section);
    }
});

test('sectionFromHash ignores empty, unknown, and non-scene fragments', () => {
    assert.equal(sectionFromHash(''), null);
    assert.equal(sectionFromHash('#'), null);
    assert.equal(sectionFromHash('#cv'), null);
    assert.equal(sectionFromHash('#nope'), null);
    assert.equal(sectionFromHash(null), null);
});
