import test from 'node:test';
import assert from 'node:assert/strict';
import { coalesceFrame } from './perf.js';

test('coalesceFrame collapses same-tick calls into one callback', async () => {
  let calls = 0;
  const run = coalesceFrame(() => {
    calls += 1;
  });
  run();
  run();
  run();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 1);
});
