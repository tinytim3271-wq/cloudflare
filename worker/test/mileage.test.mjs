import test from 'node:test';
import assert from 'node:assert/strict';
import { drivingMiles, geocodeAddress } from '../src/index.js';

function mockGeocodeDb() {
  const cache = new Map();
  let nextAvailableAt = 0;
  return {
    prepare(sql) {
      const statement = (args = []) => ({
        async first() {
          if (/UPDATE geocode_request_pacing/.test(sql)) {
            const [nextAt, now] = args;
            if (nextAvailableAt > now) return null;
            nextAvailableAt = nextAt;
            return { id: 1 };
          }
          if (/SELECT next_available_at/.test(sql)) return { next_available_at: nextAvailableAt };
          if (/SELECT latitude, longitude, label/.test(sql)) {
            const [key, now] = args;
            const entry = cache.get(key);
            return entry?.expires_at > now ? entry : null;
          }
          return null;
        },
        async run() {
          if (/INSERT INTO geocode_cache/.test(sql)) {
            const [key, latitude, longitude, label, expires_at] = args;
            cache.set(key, { latitude, longitude, label, expires_at });
          }
        },
      });
      return {
        ...statement(),
        bind(...args) {
          return statement(args);
        },
      };
    },
  };
}

test('geocodeAddress caches normalized addresses across requests', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(JSON.stringify([{ lat: '30.1', lon: '-97.2', display_name: 'Austin, Texas' }]));
  };

  try {
    const env = { DB: mockGeocodeDb() };
    assert.deepEqual(await geocodeAddress('  Austin   Texas ', env), {
      lat: 30.1,
      lon: -97.2,
      label: 'Austin, Texas',
    });
    assert.deepEqual(await geocodeAddress('austin texas', env), {
      lat: 30.1,
      lon: -97.2,
      label: 'Austin, Texas',
    });
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('geocodeAddress paces concurrent uncached addresses through shared D1 state', async () => {
  const originalFetch = globalThis.fetch;
  const requestTimes = [];
  globalThis.fetch = async () => {
    requestTimes.push(Date.now());
    return new Response(JSON.stringify([{ lat: '30.1', lon: '-97.2' }]));
  };

  try {
    const env = { DB: mockGeocodeDb() };
    await Promise.all([
      geocodeAddress('Austin, Texas', env),
      geocodeAddress('Dallas, Texas', env),
    ]);
    requestTimes.sort((a, b) => a - b);
    assert.equal(requestTimes.length, 2);
    assert.ok(requestTimes[1] - requestTimes[0] >= 950);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
