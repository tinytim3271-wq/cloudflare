/**
 * IRS Publication 15-T (2026) Percentage Method for automated payroll.
 * Tables: STANDARD and Step-2-checkbox schedules.
 */

const PERIODS_PER_YEAR = {
  Weekly: 52,
  Biweekly: 26,
  Semimonthly: 24,
  Monthly: 12,
  Quarterly: 4,
  Semiannually: 2,
  Annually: 1,
};

/** @typedef {{ min: number, max: number, base: number, rate: number }} Bracket */

/** @type {Record<string, Bracket[]>} */
export const PUB_15T_2026_STANDARD = {
  married_joint: [
    { min: 0, max: 19300, base: 0, rate: 0 },
    { min: 19300, max: 44100, base: 0, rate: 0.1 },
    { min: 44100, max: 120100, base: 2480, rate: 0.12 },
    { min: 120100, max: 230700, base: 11600, rate: 0.22 },
    { min: 230700, max: 422850, base: 35932, rate: 0.24 },
    { min: 422850, max: 531750, base: 82048, rate: 0.32 },
    { min: 531750, max: 788000, base: 116896, rate: 0.35 },
    { min: 788000, max: Infinity, base: 206583.5, rate: 0.37 },
  ],
  single: [
    { min: 0, max: 7500, base: 0, rate: 0 },
    { min: 7500, max: 19900, base: 0, rate: 0.1 },
    { min: 19900, max: 57900, base: 1240, rate: 0.12 },
    { min: 57900, max: 113200, base: 5800, rate: 0.22 },
    { min: 113200, max: 209275, base: 17966, rate: 0.24 },
    { min: 209275, max: 263725, base: 41024, rate: 0.32 },
    { min: 263725, max: 648100, base: 58448, rate: 0.35 },
    { min: 648100, max: Infinity, base: 192979.25, rate: 0.37 },
  ],
  head_of_household: [
    { min: 0, max: 15550, base: 0, rate: 0 },
    { min: 15550, max: 33250, base: 0, rate: 0.1 },
    { min: 33250, max: 83000, base: 1770, rate: 0.12 },
    { min: 83000, max: 121250, base: 7740, rate: 0.22 },
    { min: 121250, max: 217300, base: 16155, rate: 0.24 },
    { min: 217300, max: 271750, base: 39207, rate: 0.32 },
    { min: 271750, max: 656150, base: 56631, rate: 0.35 },
    { min: 656150, max: Infinity, base: 191171, rate: 0.37 },
  ],
};

/** @type {Record<string, Bracket[]>} */
export const PUB_15T_2026_STEP2 = {
  married_joint: [
    { min: 0, max: 16100, base: 0, rate: 0 },
    { min: 16100, max: 28500, base: 0, rate: 0.1 },
    { min: 28500, max: 66500, base: 1240, rate: 0.12 },
    { min: 66500, max: 121800, base: 5800, rate: 0.22 },
    { min: 121800, max: 217875, base: 17966, rate: 0.24 },
    { min: 217875, max: 272325, base: 41024, rate: 0.32 },
    { min: 272325, max: 400450, base: 58448, rate: 0.35 },
    { min: 400450, max: Infinity, base: 103291.75, rate: 0.37 },
  ],
  single: [
    { min: 0, max: 8050, base: 0, rate: 0 },
    { min: 8050, max: 14250, base: 0, rate: 0.1 },
    { min: 14250, max: 33250, base: 620, rate: 0.12 },
    { min: 33250, max: 60900, base: 2900, rate: 0.22 },
    { min: 60900, max: 108938, base: 8983, rate: 0.24 },
    { min: 108938, max: 136163, base: 20512, rate: 0.32 },
    { min: 136163, max: 328350, base: 29224, rate: 0.35 },
    { min: 328350, max: Infinity, base: 96489.63, rate: 0.37 },
  ],
  head_of_household: [
    { min: 0, max: 12075, base: 0, rate: 0 },
    { min: 12075, max: 20925, base: 0, rate: 0.1 },
    { min: 20925, max: 45800, base: 885, rate: 0.12 },
    { min: 45800, max: 64925, base: 3870, rate: 0.22 },
    { min: 64925, max: 112950, base: 8077.5, rate: 0.24 },
    { min: 112950, max: 140175, base: 19603.5, rate: 0.32 },
    { min: 140175, max: 332375, base: 28315.5, rate: 0.35 },
    { min: 332375, max: Infinity, base: 95585.5, rate: 0.37 },
  ],
};

export const SS_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;
export const SS_WAGE_BASE_2026 = 184500;

function roundCents(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizeFilingStatus(status) {
  const s = String(status || 'single').toLowerCase().replace(/\s+/g, '_');
  if (s.includes('joint') || s === 'married') return 'married_joint';
  if (s.includes('head')) return 'head_of_household';
  return 'single';
}

/**
 * @param {number} adjustedAnnual
 * @param {Bracket[]} brackets
 */
function tentativeFromBrackets(adjustedAnnual, brackets) {
  const amount = Math.max(0, Number(adjustedAnnual) || 0);
  for (const row of brackets) {
    if (amount >= row.min && amount < row.max) {
      return roundCents(row.base + (amount - row.min) * row.rate);
    }
  }
  const last = brackets[brackets.length - 1];
  return roundCents(last.base + (amount - last.min) * last.rate);
}

/**
 * Worksheet 1A percentage method for one pay period.
 * @param {{
 *   grossPay: number,
 *   payFrequency?: string,
 *   filingStatus?: string,
 *   step2Checkbox?: boolean,
 *   otherIncomeAnnual?: number,
 *   deductionsAnnual?: number,
 *   dependentCreditsAnnual?: number,
 *   extraWithholding?: number,
 *   pretaxThisPeriod?: number,
 *   ytdSocialSecurityWages?: number,
 * }} opts
 */
export function computeFederalWithholding(opts) {
  const periods = PERIODS_PER_YEAR[opts.payFrequency || 'Weekly'] || 52;
  const pretax = Math.max(0, Number(opts.pretaxThisPeriod) || 0);
  const taxableWages = Math.max(0, (Number(opts.grossPay) || 0) - pretax);
  const adjustedPeriod = Math.max(0, (Number(opts.grossPay) || 0) - pretax);
  let adjustedAnnual = adjustedPeriod * periods;
  adjustedAnnual += Math.max(0, Number(opts.otherIncomeAnnual) || 0);
  adjustedAnnual -= Math.max(0, Number(opts.deductionsAnnual) || 0);
  const status = normalizeFilingStatus(opts.filingStatus);
  const tables = opts.step2Checkbox ? PUB_15T_2026_STEP2 : PUB_15T_2026_STANDARD;
  const brackets = tables[status] || tables.single;
  let tentativeAnnual = tentativeFromBrackets(adjustedAnnual, brackets);
  tentativeAnnual = Math.max(0, tentativeAnnual - Math.max(0, Number(opts.dependentCreditsAnnual) || 0));
  const periodFit = roundCents(tentativeAnnual / periods + Math.max(0, Number(opts.extraWithholding) || 0));
  return {
    taxYear: 2026,
    method: 'Pub 15-T 2026 Percentage Method',
    filingStatus: status,
    step2Checkbox: Boolean(opts.step2Checkbox),
    periodsPerYear: periods,
    adjustedAnnualWage: roundCents(adjustedAnnual),
    federalIncomeTax: periodFit,
    taxableWages: roundCents(taxableWages),
  };
}

/**
 * @param {{ grossPay: number, ytdSocialSecurityWages?: number }} opts
 */
export function computeFica(opts) {
  const gross = Math.max(0, Number(opts.grossPay) || 0);
  const ytd = Math.max(0, Number(opts.ytdSocialSecurityWages) || 0);
  const ssWage = Math.max(0, Math.min(gross, SS_WAGE_BASE_2026 - ytd));
  const socialSecurity = roundCents(ssWage * SS_RATE);
  const medicare = roundCents(gross * MEDICARE_RATE);
  return {
    socialSecurityWages: roundCents(ssWage),
    socialSecurity,
    medicare,
    employerSocialSecurity: socialSecurity,
    employerMedicare: medicare,
    socialSecurityWageBase: SS_WAGE_BASE_2026,
  };
}

/**
 * Full employee paycheck tax estimate.
 */
export function computePayPeriodTaxes(user, grossPay, ytd = {}) {
  const is1099 = String(user.taxStatus || '').includes('1099');
  const filingStatus = normalizeFilingStatus(user.w4FilingStatus || user.filingStatus || 'single');
  const pretax = Math.max(0, Number(user.pretaxDeductionPerPeriod) || 0);
  if (is1099) {
    return {
      gross: roundCents(grossPay),
      pretax: 0,
      federal: 0,
      socialSecurity: 0,
      medicare: 0,
      state: 0,
      employerSocialSecurity: 0,
      employerMedicare: 0,
      socialSecurityWages: 0,
      net: roundCents(grossPay),
      method: '1099 — no employment tax withholding',
      filingStatus,
      adjustedAnnualWage: 0,
      is1099: true,
    };
  }
  const fit = computeFederalWithholding({
    grossPay,
    payFrequency: user.payFrequency || 'Weekly',
    filingStatus: user.w4FilingStatus || user.filingStatus || 'single',
    step2Checkbox: Boolean(user.w4Step2Checkbox),
    otherIncomeAnnual: Number(user.w4OtherIncome) || 0,
    deductionsAnnual: Number(user.w4Deductions) || 0,
    dependentCreditsAnnual: Number(user.w4DependentCredits) || 0,
    extraWithholding: Number(user.w4ExtraWithholding) || 0,
    pretaxThisPeriod: pretax,
  });
  const fica = computeFica({
    grossPay: Math.max(0, grossPay - pretax),
    ytdSocialSecurityWages: ytd.socialSecurityWages || 0,
  });
  const stateRate = Number(user.stateWithholdingRate);
  const state = Number.isFinite(stateRate)
    ? roundCents(Math.max(0, grossPay - pretax) * (stateRate / 100))
    : 0;
  const federal = fit.federalIncomeTax;
  const net = Math.max(0, roundCents(grossPay - pretax - federal - fica.socialSecurity - fica.medicare - state));
  return {
    gross: roundCents(grossPay),
    pretax: roundCents(pretax),
    federal,
    socialSecurity: fica.socialSecurity,
    medicare: fica.medicare,
    state,
    employerSocialSecurity: fica.employerSocialSecurity,
    employerMedicare: fica.employerMedicare,
    socialSecurityWages: fica.socialSecurityWages,
    net,
    method: fit.method,
    filingStatus: fit.filingStatus,
    adjustedAnnualWage: fit.adjustedAnnualWage,
    is1099: false,
  };
}
