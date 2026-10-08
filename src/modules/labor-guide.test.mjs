import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEB_ESTIMATE_LABEL,
  averageLaborHours,
  buildLaborWebSearchQuery,
  createLaborGuideProvider,
  createManualLaborEntry,
  extractLaborHoursFromText,
  laborGuideConnectionStatus,
  mapMotorLaborOperationToEstimateLine,
  mapWebLaborEstimateToEstimateLine,
  summarizeWebLaborEstimate,
} from './labor-guide.js';

test('manual labor entry always works', () => {
  const line = createManualLaborEntry({ description: 'Diag', hours: 1.2, laborRate: 150 });
  assert.equal(line.type, 'labor');
  assert.equal(line.total, 180);
  assert.equal(line.source, 'manual');
});

test('motor provider fails closed when not connected', async () => {
  assert.equal(laborGuideConnectionStatus({ provider: 'motor' }).connected, false);
  const provider = createLaborGuideProvider('motor', {});
  await assert.rejects(() => provider.search('brakes'), /not connected/i);
});

test('ALLDATA and ShopKey are recognized book providers', () => {
  assert.equal(laborGuideConnectionStatus({ provider: 'alldata' }).provider, 'alldata');
  assert.equal(laborGuideConnectionStatus({ provider: 'alldata' }).connected, false);
  assert.equal(laborGuideConnectionStatus({ provider: 'alldata', apiKey: 'k' }).connected, true);
  assert.equal(laborGuideConnectionStatus({ provider: 'shopkey', username: 'u', password: 'p' }).connected, true);
  assert.equal(laborGuideConnectionStatus({ provider: 'manual' }).webFallbackEligible, true);
});

test('motor via PartsTech is connected without inventing hours', () => {
  const status = laborGuideConnectionStatus({ provider: 'motor', viaPartstech: true });
  assert.equal(status.connected, true);
  const line = mapMotorLaborOperationToEstimateLine({
    operationId: 99, description: 'Replace pads', hours: 1.7,
  }, { laborRate: 165 }, 0);
  assert.equal(line.total, 280.5);
  assert.equal(line.laborGuide.provider, 'motor');
});

test('web estimate lines are labeled not book time', () => {
  const line = mapWebLaborEstimateToEstimateLine({
    description: 'Front brake pads',
    averageHours: 1.8,
    sourceCount: 3,
    sources: [{ url: 'https://example.com/a', title: 'A' }],
  }, { laborRate: 100 }, 0);
  assert.equal(line.source, 'web_estimate');
  assert.match(line.description, /web estimate — not book time/i);
  assert.equal(line.laborGuide.notBookTime, true);
  assert.equal(line.laborGuide.sourceCount, 1);
  assert.equal(line.total, 180);
});

test('hour extraction averages real figures and invents nothing', () => {
  assert.deepEqual(extractLaborHoursFromText('no times here'), []);
  assert.equal(averageLaborHours([]), null);
  const stats = averageLaborHours(extractLaborHoursFromText('Book time 1.5 hours; shops quote 1.2-2.0 hrs'));
  assert.equal(stats.averageHours, 1.6);
  assert.equal(stats.minHours, 1.2);
  assert.equal(stats.maxHours, 2);
  const miss = summarizeWebLaborEstimate({ snippets: ['warranty info only'], sources: [] });
  assert.equal(miss.found, false);
  assert.equal(miss.message, 'no estimate found');
  assert.equal(miss.label, WEB_ESTIMATE_LABEL);
});

test('web search query includes vehicle and operation', () => {
  const query = buildLaborWebSearchQuery({
    year: 2022, make: 'Ford', model: 'F-150', engine: '5.0L', operation: 'front brake pads',
  });
  assert.match(query, /2022 Ford F-150/);
  assert.match(query, /front brake pads/);
  assert.match(query, /labor time/i);
});
