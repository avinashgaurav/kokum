// Offline test for the CLI shim (no model call). Run: node --test evals/harness/claude-cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.EVAL_CLAUDE_BIN = 'kokum-eval-no-such-binary';
const { callClaude, CALL_LOG, default: Anthropic } = await import('./claude-cli.mjs');

test('a missing claude binary fails fast with ok: false instead of waiting out the timeout', async () => {
  const t0 = Date.now();
  const r = await callClaude({ system: 'x', messages: [{ role: 'user', content: 'hi' }], label: 'missing-bin' });
  assert.equal(r.ok, false);
  assert.equal(r.structured, null);
  assert.ok(Date.now() - t0 < 10_000, 'should not wait for the 300 s timeout');
  const rec = CALL_LOG.find((c) => c.label === 'missing-bin');
  assert.ok(rec, 'the failed call is logged');
  assert.equal(rec.is_error, true);
  assert.match(rec.result_head, /could not run the claude CLI/);
  assert.equal(CALL_LOG.filter((c) => c.label === 'missing-bin').length, 1, 'logged once, not twice');
});

test('the SDK stand-in turns that failure into an APIError', async () => {
  const client = new Anthropic({});
  await assert.rejects(
    client.messages.create({ model: 'm', system: 'x', messages: [{ role: 'user', content: 'hi' }] }),
    (e) => e instanceof Anthropic.APIError && /could not run the claude CLI/.test(e.message),
  );
});
