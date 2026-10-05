/** Standard IRS-style shop travel mileage (to and from the job). */
export const DEFAULT_MILEAGE_RATE = 0.68;

export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function roundMiles(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

export function normalizeMileageRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_MILEAGE_RATE;
}

export function normalizeOneWayMiles(value) {
  const miles = Number(value);
  if (!Number.isFinite(miles) || miles <= 0) return 0;
  return roundMiles(miles);
}

export function roundTripMiles(oneWayMiles) {
  return roundMiles(normalizeOneWayMiles(oneWayMiles) * 2);
}

export function mileageCharge(miles, rate = DEFAULT_MILEAGE_RATE) {
  return roundMoney(roundMiles(miles) * normalizeMileageRate(rate));
}

export function mileageLineItem(miles, rate = DEFAULT_MILEAGE_RATE) {
  const tripMiles = roundMiles(miles);
  const perMile = normalizeMileageRate(rate);
  const total = mileageCharge(tripMiles, perMile);
  return {
    service: 'Travel mileage (to and from job)',
    notes: `${tripMiles.toFixed(1)} miles @ $${perMile.toFixed(2)}/mi`,
    explanation: `${tripMiles.toFixed(1)} round-trip miles billed at $${perMile.toFixed(2)} per mile`,
    hours: 0,
    laborRate: 0,
    labor: 0,
    parts: total,
    total,
    kind: 'mileage',
    miles: tripMiles,
    rate: perMile,
  };
}

export function stripMileageLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).filter((line) => line?.kind !== 'mileage');
}

/**
 * Rebuild estimate totals with a standard round-trip mileage line item.
 * @param {object} estimate
 * @param {number} tripMiles round-trip miles
 * @param {number} rate dollars per mile
 * @param {number} taxRatePercent e.g. 8.25
 */
export function applyMileageToEstimate(estimate = {}, tripMiles = 0, rate = DEFAULT_MILEAGE_RATE, taxRatePercent = 8.25) {
  const baseLines = stripMileageLines(estimate.lines);
  const miles = roundMiles(tripMiles);
  const perMile = normalizeMileageRate(rate);
  const lines = miles > 0 ? [...baseLines, mileageLineItem(miles, perMile)] : [...baseLines];
  const labor = roundMoney(lines.reduce((sum, line) => sum + (Number(line.labor) || 0), 0));
  const laborHours = roundMoney(lines.reduce((sum, line) => sum + (Number(line.hours) || 0), 0));
  const parts = roundMoney(lines.reduce((sum, line) => sum + (Number(line.parts) || 0), 0));
  const feeAmount = Array.isArray(estimate.fees)
    ? estimate.fees.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0)
    : (baseLines.length ? 12 : 0);
  const fees = feeAmount
    ? (Array.isArray(estimate.fees) && estimate.fees.length
      ? estimate.fees
      : [{ description: 'Shop supplies', amount: feeAmount }])
    : [];
  const taxRate = Number(taxRatePercent);
  const safeRate = Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : 8.25;
  const discountAmount = roundMoney(estimate.discountAmount ?? baseLines.reduce((sum, line) => sum + (Number(line.discountAmount) || 0), 0));
  const subtotal = roundMoney(labor + parts - discountAmount + feeAmount);
  const tax = roundMoney(subtotal * (safeRate / 100));
  const total = roundMoney(subtotal + tax);
  return {
    ...estimate,
    lines,
    labor,
    laborHours,
    parts,
    fees,
    subtotal,
    tax,
    taxRate: safeRate,
    total,
    mileageMiles: miles,
    mileageRate: perMile,
    mileageCharge: mileageCharge(miles, perMile),
  };
}

/**
 * Apply trip mileage fields onto a work order and its estimate/invoice totals.
 */
export function applyMileageToOrder(order = {}, { oneWayMiles, jobAddress, rate, taxRate } = {}) {
  const next = { ...order };
  const oneWay = oneWayMiles === undefined ? normalizeOneWayMiles(order.tripMilesOneWay) : normalizeOneWayMiles(oneWayMiles);
  const tripMiles = roundTripMiles(oneWay);
  const perMile = normalizeMileageRate(rate ?? order.mileageRate);
  const taxRatePercent = taxRate ?? order.estimate?.taxRate ?? 8.25;
  if (jobAddress !== undefined) next.jobAddress = String(jobAddress || '').trim();
  next.tripMilesOneWay = oneWay;
  next.tripMiles = tripMiles;
  next.mileageRate = perMile;
  next.mileageCharge = mileageCharge(tripMiles, perMile);

  const baseEstimate = order.estimate && typeof order.estimate === 'object'
    ? order.estimate
    : {
      lines: [],
      labor: Number(order.labor) || 0,
      laborHours: Number(order.laborHours) || 0,
      parts: Math.max(0, (Number(order.parts) || 0) - (Number(order.mileageCharge) || 0)),
      fees: [],
      subtotal: Math.max(0, (Number(order.total) || 0) - (Number(order.tax) || 0) - (Number(order.mileageCharge) || 0)),
      tax: Number(order.tax) || 0,
      taxRate: taxRatePercent,
      total: Number(order.total) || 0,
    };

  // If there are no service lines, preserve non-mileage money as a single labor/parts snapshot.
  if (!stripMileageLines(baseEstimate.lines).length) {
    const priorCharge = Number(order.mileageCharge) || 0;
    const labor = Number(baseEstimate.labor ?? order.labor) || 0;
    const laborHours = Number(baseEstimate.laborHours ?? order.laborHours) || 0;
    const partsWithoutMileage = Math.max(0, (Number(baseEstimate.parts ?? order.parts) || 0) - priorCharge);
    const aggregateCharge = Math.max(
      0,
      Number(order.total) > 0
        ? Number(order.total) - (Number(order.tax) || 0) - priorCharge
        : (Number(baseEstimate.subtotal) || 0) - priorCharge,
    );
    const aggregateOnly = !labor && !partsWithoutMileage && aggregateCharge > 0;
    const preservedParts = partsWithoutMileage || (aggregateOnly ? aggregateCharge : 0);
    const preserveAggregateTax = aggregateOnly
      && taxRate === undefined
      && order.estimate?.taxRate == null
      && !(Number(order.tax) > 0);
    const effectiveTaxRate = preserveAggregateTax ? 0 : taxRatePercent;
    const synthetic = {
      ...baseEstimate,
      lines: labor || partsWithoutMileage
        ? [{
          service: 'Repair services',
          hours: laborHours,
          laborRate: laborHours ? roundMoney(labor / laborHours) : 0,
          labor,
          parts: partsWithoutMileage,
          total: roundMoney(labor + partsWithoutMileage),
        }]
        : aggregateOnly
        ? [{
          service: 'Imported charges',
          hours: 0,
          laborRate: 0,
          labor: 0,
          parts: aggregateCharge,
          total: aggregateCharge,
        }]
        : [],
      fees: baseEstimate.fees || [],
      labor,
      laborHours,
      parts: preservedParts,
    };
    const estimate = applyMileageToEstimate(synthetic, tripMiles, perMile, effectiveTaxRate);
    next.estimate = estimate;
    next.labor = estimate.labor;
    next.laborHours = estimate.laborHours;
    next.parts = estimate.parts;
    next.tax = estimate.tax;
    next.total = estimate.total;
    return next;
  }

  const estimate = applyMileageToEstimate(baseEstimate, tripMiles, perMile, taxRatePercent);
  next.estimate = estimate;
  next.labor = estimate.labor;
  next.laborHours = estimate.laborHours;
  next.parts = estimate.parts;
  next.tax = estimate.tax;
  next.total = estimate.total;
  return next;
}

export function mileagePanelMarkup({
  jobAddress = '',
  oneWayMiles = '',
  roundTrip = 0,
  rate = DEFAULT_MILEAGE_RATE,
  charge = 0,
  shopAddress = '',
  canEdit = true,
} = {}) {
  const disabled = canEdit ? '' : 'disabled';
  return `<section class="mileage-panel" id="mileage-panel">
    <div class="mileage-panel-head">
      <div>
        <h3>Travel mileage</h3>
        <p>Round-trip (to and from the job) is billed at $${normalizeMileageRate(rate).toFixed(2)}/mi. Shop base: ${escapePlain(shopAddress || 'Set shop address in Settings')}.</p>
      </div>
      <div class="mileage-charge">${formatMoney(charge)}<small>${Number(roundTrip || 0).toFixed(1)} mi round trip</small></div>
    </div>
    <div class="form-grid mileage-fields">
      <label class="full">Job site address<input id="detail-job-address" name="jobAddress" value="${escapeAttr(jobAddress)}" placeholder="Customer / job site address" ${disabled}/></label>
      <label>One-way miles<input id="detail-one-way-miles" name="tripMilesOneWay" type="number" min="0" step="0.1" value="${oneWayMiles === '' || oneWayMiles == null ? '' : Number(oneWayMiles)}" ${disabled}/></label>
      <label>Round-trip miles<input id="detail-round-trip-miles" type="number" min="0" step="0.1" value="${Number(roundTrip || 0).toFixed(1)}" readonly/></label>
      <label>Mileage charge<input id="detail-mileage-charge" type="text" value="${formatMoney(charge)}" readonly/></label>
      ${canEdit ? `<div class="full mileage-actions"><button type="button" class="secondary" id="calculate-mileage">Calculate from addresses</button><span id="mileage-status"></span></div>` : ''}
    </div>
  </section>`;
}

export function newOrderMileageMarkup({ rate = DEFAULT_MILEAGE_RATE, shopAddress = '' } = {}) {
  return `<h3>Travel mileage</h3>
<section class="mileage-panel">
  <div class="mileage-panel-head">
    <div>
      <p>Standard billing: round-trip miles × $${normalizeMileageRate(rate).toFixed(2)}. Shop base: ${escapePlain(shopAddress || 'Set shop address in Settings')}.</p>
    </div>
    <div class="mileage-charge" id="new-mileage-charge">$0.00<small>0.0 mi round trip</small></div>
  </div>
  <div class="form-grid mileage-fields">
    <label class="full">Job site address<input name="jobAddress" placeholder="Customer / job site address"/></label>
    <label>One-way miles<input name="tripMilesOneWay" id="new-one-way-miles" type="number" min="0" step="0.1" value=""/></label>
    <label>Round-trip miles<input id="new-round-trip-miles" type="number" min="0" step="0.1" value="0.0" readonly/></label>
    <label>Mileage charge<input id="new-mileage-charge-input" type="text" value="$0.00" readonly/></label>
    <div class="full mileage-actions"><button type="button" class="secondary" id="new-calculate-mileage">Calculate from addresses</button><span id="new-mileage-status"></span></div>
  </div>
</section>`;
}

function formatMoney(value) {
  return `$${roundMoney(value).toFixed(2)}`;
}

function escapePlain(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapePlain(value).replace(/'/g, '&#39;');
}

export function refreshMileagePreview(root, { rate = DEFAULT_MILEAGE_RATE } = {}) {
  if (!root) return { oneWay: 0, roundTrip: 0, charge: 0 };
  const oneWayInput = root.querySelector('#detail-one-way-miles, #new-one-way-miles, [name="tripMilesOneWay"]');
  const oneWay = normalizeOneWayMiles(oneWayInput?.value);
  const roundTrip = roundTripMiles(oneWay);
  const charge = mileageCharge(roundTrip, rate);
  const roundTripInput = root.querySelector('#detail-round-trip-miles, #new-round-trip-miles');
  const chargeInput = root.querySelector('#detail-mileage-charge, #new-mileage-charge-input');
  const chargeBadge = root.querySelector('.mileage-charge, #new-mileage-charge');
  if (roundTripInput) roundTripInput.value = roundTrip.toFixed(1);
  if (chargeInput) chargeInput.value = formatMoney(charge);
  if (chargeBadge) chargeBadge.innerHTML = `${formatMoney(charge)}<small>${roundTrip.toFixed(1)} mi round trip</small>`;
  return { oneWay, roundTrip, charge };
}
