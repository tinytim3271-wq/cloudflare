import test from 'node:test';
import assert from 'node:assert/strict';
import { drivingMiles } from '../src/index.js';

test('drivingMiles accepts a valid zero-distance route', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ routes: [{ distance: 0 }] }));

  try {
    assert.equal(await drivingMiles({ lon: 0, lat: 0 }, { lon: 0, lat: 0 }), 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('drivingMiles rejects missing, non-finite, and negative route distances', async () => {
  const originalFetch = globalThis.fetch;

  try {
    for (const body of [
      '{"routes":[{}]}',
      '{"routes":[{"distance":null}]}',
      '{"routes":[{"distance":1e400}]}',
      '{"routes":[{"distance":-1}]}',
    ]) {
      globalThis.fetch = async () => new Response(body);
      await assert.rejects(
        drivingMiles({ lon: 0, lat: 0 }, { lon: 1, lat: 1 }),
        { status: 422 },
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
