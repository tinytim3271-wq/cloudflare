import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOMER_SEARCH_DEBOUNCE_MS,
  CUSTOMER_SEARCH_MIN_LENGTH,
  likelyDuplicateCustomers,
  localCustomerMatches,
  shouldSearchCustomers,
} from './customer-intake.js';

const customers = [
  { id: 'customer-1', name: 'Isaac Gallardo', phone: '(555) 111-2222', email: 'isaac@example.com' },
  { id: 'customer-2', name: 'Gail Isaacson', phone: '555-999-1000', email: 'gail@example.com' },
];
const vehicles = [
  { id: 'vehicle-1', customerId: 'customer-1', year: 2022, make: 'Ford', model: 'F-150' },
];

test('live customer search starts only at three trimmed characters', () => {
  assert.equal(CUSTOMER_SEARCH_MIN_LENGTH, 3);
  assert.equal(CUSTOMER_SEARCH_DEBOUNCE_MS, 275);
  assert.equal(shouldSearchCustomers(' g '), false);
  assert.equal(shouldSearchCustomers(' ga '), false);
  assert.equal(shouldSearchCustomers(' gal '), true);
});

test('local fallback partially matches any name token in either order', () => {
  assert.deepEqual(localCustomerMatches('gall', customers, vehicles).map(item => item.id), ['customer-1']);
  assert.deepEqual(localCustomerMatches('gall isa', customers, vehicles).map(item => item.id), ['customer-1']);
  assert.deepEqual(localCustomerMatches('isa gall', customers, vehicles).map(item => item.id), ['customer-1']);
  assert.equal(localCustomerMatches('ga', customers, vehicles).length, 0);
  assert.equal(localCustomerMatches('gall', customers, vehicles)[0].recentVehicle.label, '2022 Ford F-150');
});

test('likely duplicate detection normalizes phone and email', () => {
  assert.deepEqual(
    likelyDuplicateCustomers({ phone: '555-111-2222' }, customers, vehicles).map(item => item.id),
    ['customer-1'],
  );
  assert.deepEqual(
    likelyDuplicateCustomers({ email: ' ISAAC@EXAMPLE.COM ' }, customers, vehicles).map(item => item.id),
    ['customer-1'],
  );
  assert.equal(
    likelyDuplicateCustomers(
      { phone: '555-111-2222' },
      [...customers, { ...customers[0] }],
      vehicles,
    ).length,
    1,
  );
});
