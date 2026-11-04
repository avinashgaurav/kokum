// Offline test for the CLI shim (no model call). Run: node --test evals/harness/claude-cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

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

test('spawn throwing at once (NUL byte in an argument) resolves ok: false and is logged once', async () => {
  const r = await callClaude({ system: 'bad\0arg', messages: [{ role: 'user', content: 'hi' }], label: 'nul-arg' });
  assert.equal(r.ok, false);
  const recs = CALL_LOG.filter((c) => c.label === 'nul-arg');
  assert.equal(recs.length, 1);
  assert.equal(recs[0].is_error, true);
  assert.match(recs[0].result_head, /could not run the claude CLI/);
});

test('a CLI that exits at once with large stdin resolves via close with ok: false and no unhandled error', async () => {
  const unhandled = [];
  const onErr = (e) => unhandled.push(e);
  process.on('uncaughtException', onErr);
  process.on('unhandledRejection', onErr);
  const prev = process.env.EVAL_CLAUDE_BIN;
  // /bin/false on Linux (CI); macOS only has /usr/bin/false.
  process.env.EVAL_CLAUDE_BIN = existsSync('/bin/false') ? '/bin/false' : '/usr/bin/false';
  try {
    const big = 'x'.repeat(8 * 1024 * 1024);
    const r = await callClaude({ system: 'x', messages: [{ role: 'user', content: big }], label: 'false-bin' });
    await new Promise((res) => setTimeout(res, 50));
    assert.equal(r.ok, false);
    const recs = CALL_LOG.filter((c) => c.label === 'false-bin');
    assert.equal(recs.length, 1);
    assert.equal(recs[0].exit, 1, 'resolved by close with the exit code, not by the error path');
    assert.equal(recs[0].is_error, true);
    assert.deepEqual(unhandled, []);
  } finally {
    process.env.EVAL_CLAUDE_BIN = prev;
    process.off('uncaughtException', onErr);
    process.off('unhandledRejection', onErr);
  }
});
