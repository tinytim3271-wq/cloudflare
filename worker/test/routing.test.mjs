import test from 'node:test';
import assert from 'node:assert/strict';
import { isApiPath, isApiRequest, pagesProxyUrl } from '../src/routing.mjs';

test('API paths stay on the Worker route', () => {
  assert.equal(isApiPath('/api'), true);
  assert.equal(isApiPath('/api/healthz'), true);
  assert.equal(isApiPath('/api/auth/session'), true);
  assert.equal(isApiPath('/app'), false);
  assert.equal(isApiPath('/'), false);
  assert.equal(isApiPath('/login'), false);
  assert.equal(isApiRequest(new Request('https://www.yourcarguy806.com/api/healthz')), true);
  assert.equal(isApiRequest(new Request('https://www.yourcarguy806.com/')), false);
});

test('non-API requests proxy to the Pages origin', () => {
  assert.equal(
    pagesProxyUrl('https://www.yourcarguy806.com/login', 'https://mechpro-dispatch.pages.dev'),
    'https://mechpro-dispatch.pages.dev/login',
  );
  assert.equal(
    pagesProxyUrl('https://www.yourcarguy806.com/app?tab=home', 'https://mechpro-dispatch.pages.dev/'),
    'https://mechpro-dispatch.pages.dev/app?tab=home',
  );
});
