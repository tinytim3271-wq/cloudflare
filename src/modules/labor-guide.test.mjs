import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLaborGuideProvider,
  createManualLaborEntry,
  laborGuideConnectionStatus,
  mapMotorLaborOperationToEstimateLine,
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

test('motor via PartsTech is connected without inventing hours', () => {
  const status = laborGuideConnectionStatus({ provider: 'motor', viaPartstech: true });
  assert.equal(status.connected, true);
  const line = mapMotorLaborOperationToEstimateLine({
    operationId: 99, description: 'Replace pads', hours: 1.7,
  }, { laborRate: 165 }, 0);
  assert.equal(line.total, 280.5);
  assert.equal(line.laborGuide.provider, 'motor');
});
