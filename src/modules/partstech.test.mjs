import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapPartstechQuoteItemToEstimateLine,
  partstechConnectionStatus,
  partstechPanelHtml,
} from './partstech.js';

test('partstech fails closed when credentials missing', () => {
  assert.equal(partstechConnectionStatus(null).connected, false);
  assert.equal(partstechConnectionStatus({ userId: 'u' }).status, 'not_connected');
  assert.equal(partstechConnectionStatus({
    userId: 'u', userKey: 'uk', partnerId: 'p', partnerKey: 'pk',
  }).connected, true);
});

test('quote items map to estimate part lines', () => {
  const line = mapPartstechQuoteItemToEstimateLine({
    partNumber: 'BP123', brand: 'ACDelco', price: 42.5, quantity: 2, description: 'Brake pad',
  }, 0);
  assert.equal(line.type, 'part');
  assert.equal(line.total, 85);
  assert.equal(line.source, 'partstech');
  assert.equal(line.partNumber, 'BP123');
});

test('panel shows not connected without inventing results', () => {
  const html = partstechPanelHtml({}, { escapeHtml: v => String(v ?? ''), icon: () => '' });
  assert.match(html, /not connected/i);
  assert.match(html, /disabled/);
});
