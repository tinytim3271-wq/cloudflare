import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFederalWithholding, computeFica, computePayPeriodTaxes } from './withholding.js';

test('Pub 15-T 2026 single weekly withholding is positive for mid wages', () => {
  const result = computeFederalWithholding({
    grossPay: 1000,
    payFrequency: 'Weekly',
    filingStatus: 'single',
    step2Checkbox: false,
  });
  assert.equal(result.taxYear, 2026);
  assert.ok(result.federalIncomeTax > 0);
  assert.ok(result.adjustedAnnualWage === 52000);
});

test('FICA respects social security wage base remainder', () => {
  const low = computeFica({ grossPay: 1000, ytdSocialSecurityWages: 0 });
  assert.equal(low.socialSecurity, 62);
  assert.equal(low.medicare, 14.5);
  const capped = computeFica({ grossPay: 1000, ytdSocialSecurityWages: 184500 });
  assert.equal(capped.socialSecurity, 0);
});

test('1099 skips employment tax withholding with full field shape', () => {
  const taxes = computePayPeriodTaxes({ taxStatus: '1099 Contractor', payFrequency: 'Weekly', w4FilingStatus: 'single' }, 800);
  assert.equal(taxes.federal, 0);
  assert.equal(taxes.socialSecurity, 0);
  assert.equal(taxes.net, 800);
  assert.equal(taxes.is1099, true);
  assert.equal(taxes.pretax, 0);
  assert.equal(taxes.socialSecurityWages, 0);
  assert.equal(taxes.adjustedAnnualWage, 0);
  assert.equal(taxes.filingStatus, 'single');
  assert.equal(taxes.employerSocialSecurity, 0);
  assert.equal(taxes.employerMedicare, 0);
});
