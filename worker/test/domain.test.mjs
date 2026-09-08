import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTaxReport,
  canReadEntity,
  canWriteEntity,
  normalizeEntityPayload,
  normalizeEntityType,
  openInvoiceBalance,
  redactEmployee,
  validShopId,
  validVin,
} from '../src/domain.mjs';
import { constantTimeEqual, decryptSecret, encryptSecret, hmacHex } from '../src/security.mjs';

test('entity RBAC preserves payroll and employee protections', () => {
  assert.equal(canReadEntity('payrollentries', 'technician'), false);
  assert.equal(canWriteEntity('employees', 'technician'), false);
  assert.equal(canWriteEntity('orders', 'technician'), true);
  assert.deepEqual(redactEmployee({ name: 'A', payRate: 42, phone: 'x' }, 'technician'), { name: 'A' });
});

test('VIN and shop identifiers are validated', () => {
  assert.equal(validVin('1HGCM82633A004352'), true);
  assert.equal(validVin('1HGCM82633I004352'), false);
  assert.equal(validShopId('main-shop'), true);
  assert.equal(validShopId('../shop'), false);
});

test('legacy entity aliases remain compatible', () => {
  assert.equal(normalizeEntityType('bookings'), 'appointments');
  assert.deepEqual(normalizeEntityPayload('bookings', {
    id: '1',
    customer_id: '42',
    employee_id: '7',
    booking_date: '2026-09-08T14:30:00Z',
    service_type: 'brakes',
  }), {
    id: '1',
    customer_id: '42',
    employee_id: '7',
    booking_date: '2026-09-08T14:30:00Z',
    service_type: 'brakes',
    customerId: '42',
    employeeId: '7',
    customer: 'Customer #42',
    vehicle: 'Vehicle pending',
    service: 'brakes',
    date: '2026-09-08',
    time: '14:30',
    tech: 'Employee #7',
    notes: '',
    status: 'scheduled',
    createdAt: undefined,
    updatedAt: undefined,
  });
});

test('invoice balance and tax report account for completed payments', () => {
  const payments = [
    { invoiceNumber: 'INV-1', customer: 'A', amount: 54.13, receivedAt: '2026-09-01T12:00:00Z', status: 'completed' },
    { invoiceNumber: 'INV-1', customer: 'A', amount: 10, receivedAt: '2026-09-02T12:00:00Z', status: 'pending' },
  ];
  assert.equal(openInvoiceBalance(108.25, payments), 54.12);
  assert.deepEqual(buildTaxReport(payments, [{ number: 'INV-1', amount: 108.25 }], 8.25, '2026-09-01', '2026-09-30').totals, {
    gross: 54.13,
    taxable: 50,
    tax: 4.13,
  });
});

test('integration secrets round-trip through AES-GCM', async () => {
  const encrypted = await encryptSecret('whsec_example', 'local-test-key');
  assert.notEqual(encrypted.ciphertext, 'whsec_example');
  assert.equal(await decryptSecret(encrypted.ciphertext, encrypted.iv, 'local-test-key'), 'whsec_example');
  assert.equal(constantTimeEqual(await hmacHex('key', 'payload'), await hmacHex('key', 'payload')), true);
  assert.equal(constantTimeEqual('abc', 'abd'), false);
});
