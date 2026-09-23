import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function b64urlFromBytes(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function b64urlFromJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function signJwt(header, payload, privateKey) {
  const encodedHeader = b64urlFromJson(header);
  const encodedPayload = b64urlFromJson(payload);
  const body = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(body),
  );
  return `${body}.${b64urlFromBytes(new Uint8Array(signature))}`;
}

function mockUserDb() {
  const sessions = [];
  const user = {
    id: 'user-1',
    email: 'owner@example.test',
    shop_id: 'shop-1',
    role: 'admin',
    name: 'Owner',
    enabled: 1,
  };
  return {
    sessions,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (/SELECT id, email, shop_id, role, name, enabled FROM users/.test(sql)) return user;
              assert.fail(`Unexpected first() query: ${sql}`);
            },
            async run() {
              if (/INSERT INTO sessions/.test(sql)) {
                sessions.push(args);
                return;
              }
              assert.fail(`Unexpected run() query: ${sql}`);
            },
          };
        },
      };
    },
  };
}

test('google auth start requires production oauth configuration', async (t) => {
  t.mock.method(console, 'error', () => {});
  const response = await worker.fetch(new Request('https://app.example.test/api/auth/google/start'), {});
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /AUTH_GOOGLE_CLIENT_ID/);
});

test('google auth start redirects to Google and stores oauth state cookie', async (t) => {
  t.mock.method(console, 'error', () => {});
  const env = {
    AUTH_GOOGLE_CLIENT_ID: 'google-client-id',
    AUTH_GOOGLE_CLIENT_SECRET: 'google-client-secret',
    AUTH_GOOGLE_REDIRECT_URI: 'https://app.example.test/api/auth/google/callback',
  };
  const response = await worker.fetch(new Request('https://app.example.test/api/auth/google/start?returnTo=%2Fdashboard'), env);
  assert.equal(response.status, 302);
  const redirect = new URL(response.headers.get('location'));
  assert.equal(redirect.origin, 'https://accounts.google.com');
  assert.equal(redirect.pathname, '/o/oauth2/v2/auth');
  assert.equal(redirect.searchParams.get('client_id'), env.AUTH_GOOGLE_CLIENT_ID);
  assert.equal(redirect.searchParams.get('redirect_uri'), env.AUTH_GOOGLE_REDIRECT_URI);
  assert.equal(redirect.searchParams.get('scope'), 'openid email profile');
  assert.ok(redirect.searchParams.get('state'));
  const cookie = response.headers.get('set-cookie') || '';
  assert.match(cookie, /mechpro_google_oauth_state=/);
  assert.match(cookie, /HttpOnly/);
});

test('google auth callback creates an app session and clears oauth state cookie', async (t) => {
  t.mock.method(console, 'error', () => {});
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  publicJwk.kid = 'google-key-1';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  const env = {
    DB: mockUserDb(),
    AUTH_GOOGLE_CLIENT_ID: 'google-client-id',
    AUTH_GOOGLE_CLIENT_SECRET: 'google-client-secret',
    AUTH_GOOGLE_REDIRECT_URI: 'https://app.example.test/api/auth/google/callback',
  };
  const start = await worker.fetch(new Request('https://app.example.test/api/auth/google/start?returnTo=%2Fdispatch'), env);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const oauthCookie = (start.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(state);
  assert.ok(oauthCookie.startsWith('mechpro_google_oauth_state='));

  const idToken = await signJwt(
    { alg: 'RS256', typ: 'JWT', kid: 'google-key-1' },
    {
      iss: 'https://accounts.google.com',
      aud: env.AUTH_GOOGLE_CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 600,
      email: 'owner@example.test',
      email_verified: true,
      name: 'Owner',
    },
    keyPair.privateKey,
  );

  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ id_token: idToken });
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [publicJwk] });
    assert.fail(`Unexpected fetch url: ${url}`);
  });

  const callback = await worker.fetch(new Request(`https://app.example.test/api/auth/google/callback?code=test-code&state=${encodeURIComponent(state)}`, {
    headers: { Cookie: oauthCookie },
  }), env);
  assert.equal(callback.status, 302);
  assert.equal(new URL(callback.headers.get('location')).pathname, '/dispatch');
  const setCookie = callback.headers.get('set-cookie') || '';
  assert.match(setCookie, /mechpro_session=/);
  assert.match(setCookie, /mechpro_google_oauth_state=;/);
  assert.equal(env.DB.sessions.length, 1);
});
