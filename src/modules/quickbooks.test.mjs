import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQboIdempotencyKey,
  mapCustomerToQbo,
  mapInvoiceToQbo,
  mapPaymentToQbo,
  quickbooksConnectionStatus,
} from './quickbooks.js';

test('quickbooks fails closed until tokens exist', () => {
  assert.equal(quickbooksConnectionStatus(null).connected, false);
  assert.equal(quickbooksConnectionStatus({ realmId: '1' }).connected, false);
  assert.equal(quickbooksConnectionStatus({
    realmId: '123', refreshToken: 'rt',
  }).connected, true);
});

test('idempotency keys are stable and maps validate', () => {
  assert.equal(
    buildQboIdempotencyKey('shop', 'invoice', 'INV-1'),
    'shop|invoice|INV-1|upsert',
  );
  const customer = mapCustomerToQbo({ name: 'Pat', email: 'pat@example.com' });
  assert.equal(customer.DisplayName, 'Pat');
  const invoice = mapInvoiceToQbo({
    number: 'INV-1',
    lines: [{ description: 'Labor', total: 100, quantity: 1, unitPrice: 100 }],
  }, '55');
  assert.equal(invoice.CustomerRef.value, '55');
  assert.equal(invoice.Line.length, 1);
  const payment = mapPaymentToQbo({ amount: 100, id: 'p1' }, '55', '9');
  assert.equal(payment.TotalAmt, 100);
  assert.equal(payment.Line[0].LinkedTxn[0].TxnId, '9');
});

test('mapping rejects incomplete payloads instead of faking', () => {
  assert.throws(() => mapCustomerToQbo({}), /name/i);
  assert.throws(() => mapInvoiceToQbo({ lines: [] }, '1'), /line/i);
  assert.throws(() => mapPaymentToQbo({ amount: 0 }, '1'), /amount/i);
});
