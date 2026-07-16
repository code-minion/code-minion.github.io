import test from "node:test";
import assert from "node:assert/strict";
import { ChatError, suggestionForRetryHint } from "../src/llm-client.js";

// Regression coverage for the chat widget's error UX: visitors used to see a
// raw "[ERROR]: <exception message>" line no matter what went wrong. Now the
// backend tags each error with a retryHint and the frontend appends a
// targeted next step. These tests pin down that mapping.

test("suggestionForRetryHint: 'refresh' tells the visitor to reload", () => {
  assert.match(suggestionForRetryHint("refresh"), /refresh/i);
});

test("suggestionForRetryHint: 'wait' tells the visitor to retry shortly", () => {
  assert.match(suggestionForRetryHint("wait"), /few seconds/i);
});

test("suggestionForRetryHint: 'later' and 'none' add no extra suggestion (message already covers it)", () => {
  assert.equal(suggestionForRetryHint("later"), "");
  assert.equal(suggestionForRetryHint("none"), "");
});

test("suggestionForRetryHint: unknown/undefined hints default to no suggestion", () => {
  assert.equal(suggestionForRetryHint(undefined), "");
  assert.equal(suggestionForRetryHint("something-new"), "");
});

test("ChatError carries a message and retryHint like a normal Error", () => {
  const err = new ChatError("Something broke", "refresh");
  assert.equal(err.message, "Something broke");
  assert.equal(err.retryHint, "refresh");
  assert.ok(err instanceof Error);
});

test("ChatError defaults retryHint to 'none' when not given", () => {
  const err = new ChatError("Something broke");
  assert.equal(err.retryHint, "none");
});
