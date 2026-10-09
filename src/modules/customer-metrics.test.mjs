import assert from 'node:assert/strict';
import test from 'node:test';
import { customerLifetimeSpend } from './customer-metrics.js';

test('linked invoices override a stale persisted customer spend aggregate', () => {
  const customer = { name: 'Import Integrity Customer', spend: 269.99 };
  const invoices = [
    { number: 'INV-IMPORT-100', customer: customer.name, amount: 149.99, status: 'paid' },
    { number: 'INV-OTHER', customer: 'Another Customer', amount: 120, status: 'paid' },
  ];

  assert.equal(customerLifetimeSpend(customer, invoices), 149.99);
});

test('legacy customer spend remains available when no invoices are linked', () => {
  assert.equal(customerLifetimeSpend({ name: 'Legacy Customer', spend: 2834.17 }, []), 2834.17);
});

test('linked invoice sums are rounded to currency precision', () => {
  const customer = { name: 'Ada', spend: 0 };
  assert.equal(customerLifetimeSpend(customer, [
    { customer: 'Ada', amount: 0.1 },
    { customer: 'Ada', amount: 0.2 },
  ]), 0.3);
});
