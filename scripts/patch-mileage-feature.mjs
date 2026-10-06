#!/usr/bin/env node
/**
 * One-shot surgical patch for travel mileage in src/runtime/legacy.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src/runtime/legacy.js');
let s = fs.readFileSync(file, 'utf8');
const before = s;

function mustReplace(label, search, replacement, { all = false } = {}) {
  if (all) {
    if (!s.includes(search)) throw new Error(`Missing (${label}): ${search.slice(0, 80)}`);
    s = s.split(search).join(replacement);
    return;
  }
  const i = s.indexOf(search);
  if (i < 0) throw new Error(`Missing (${label}): ${search.slice(0, 120)}`);
  s = s.slice(0, i) + replacement + s.slice(i + search.length);
}

if (!s.includes("from '../modules/mileage.js'") && !s.includes('from "../modules/mileage.js"')) {
  mustReplace(
    'import mileage',
    "import { chatTime, cleanEmail } from '../modules/chat/utils.js';",
    "import { chatTime, cleanEmail } from '../modules/chat/utils.js';\nimport * as Mileage from '../modules/mileage.js';",
  );
}

mustReplace(
  'defaults mileageRate',
  'laborRate: 165, invoiceFooter:',
  'laborRate: 165, mileageRate: 0.68, invoiceFooter:',
);

mustReplace(
  'settings labor field v1',
  '<label>Default labor rate<input name="laborRate" type="number" step=".01" value="${Number(profile.laborRate)}"/></label><label class="full">Invoice footer',
  '<label>Default labor rate<input name="laborRate" type="number" step=".01" value="${Number(profile.laborRate)}"/></label><label>Mileage rate ($/mi)<input name="mileageRate" type="number" min="0" step=".01" value="${Number(profile.mileageRate ?? 0.68)}"/></label><label class="full">Invoice footer',
);

mustReplace(
  'settings labor field v2',
  '<label>Default labor rate<input name="laborRate" type="number" min="0" step=".01" value="${Number(profile.laborRate)}"/></label><label>Brand color',
  '<label>Default labor rate<input name="laborRate" type="number" min="0" step=".01" value="${Number(profile.laborRate)}"/></label><label>Mileage rate ($/mi)<input name="mileageRate" type="number" min="0" step=".01" value="${Number(profile.mileageRate ?? 0.68)}"/></label><label>Brand color',
);

mustReplace(
  'save mileageRate',
  'laborRate: Math.max(0, Number(data.laborRate) || 0), invoiceFooter: data.invoiceFooter.trim()',
  'laborRate: Math.max(0, Number(data.laborRate) || 0), mileageRate: Math.max(0, Number(data.mileageRate) || 0.68), invoiceFooter: data.invoiceFooter.trim()',
);

const openNewNeedle = '</section></div><div class="modal-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary">${icon("plus", 15)} Create work order</button></div></form>`); bindNewOrderEstimator();';
if (!s.includes('new-calculate-mileage')) {
  mustReplace(
    'openNew mileage UI',
    openNewNeedle,
    '</section>${Mileage.newOrderMileageMarkup({ rate: Mileage.normalizeMileageRate(typeof shopProfile === "function" ? shopProfile().mileageRate : 0.68), shopAddress: typeof shopProfile === "function" ? shopProfile().address : "" })}</div><div class="modal-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary">${icon("plus", 15)} Create work order</button></div></form>`); bindNewOrderEstimator(); bindWorkOrderMileage("#new-form");',
  );
}

const openNewOrderAssign = 'const estimate = readNewOrderEstimate(), id = `RO-${Math.max(1040, ...state.orders.map(x => Number(x.id.split("-")[1]) || 0)) + 1}`, order = { id, customer: customerName, phone: data.phone, vehicle: data.vehicle, vin: String(data.vin || "").trim().toUpperCase() || "VIN pending", complaint: data.complaint, status: data.status, priority: data.priority, tech: data.tech, bay: data.bay, mobile: data.bay === "Mobile", promise: data.promise, total: estimate.total, scheduled: "Unscheduled", notes: "New intake. Diagnosis pending.", labor: estimate.labor, laborHours: estimate.laborHours, parts: estimate.parts, tax: estimate.tax, estimate: { ...estimate, generatedAt: now(), summary: `Preliminary estimate for ${data.vehicle}. Verify vehicle condition, part fitment, and customer authorization before repair.` } };';
if (!s.includes('tripMilesOneWay: Number(data.tripMilesOneWay)') && !s.includes('applyMileageToOrder(order')) {
  mustReplace(
    'openNew order mileage fields',
    openNewOrderAssign,
    'const estimate = readNewOrderEstimate(), id = `RO-${Math.max(1040, ...state.orders.map(x => Number(x.id.split("-")[1]) || 0)) + 1}`; let order = { id, customer: customerName, phone: data.phone, vehicle: data.vehicle, vin: String(data.vin || "").trim().toUpperCase() || "VIN pending", complaint: data.complaint, status: data.status, priority: data.priority, tech: data.tech, bay: data.bay, mobile: data.bay === "Mobile", promise: data.promise, total: estimate.total, scheduled: "Unscheduled", notes: "New intake. Diagnosis pending.", labor: estimate.labor, laborHours: estimate.laborHours, parts: estimate.parts, tax: estimate.tax, jobAddress: String(data.jobAddress || "").trim(), tripMilesOneWay: Number(data.tripMilesOneWay) || 0, estimate: { ...estimate, generatedAt: now(), summary: `Preliminary estimate for ${data.vehicle}. Verify vehicle condition, part fitment, and customer authorization before repair.` } }; order = Mileage.applyMileageToOrder(order, { oneWayMiles: order.tripMilesOneWay, jobAddress: order.jobAddress, rate: shopMileageRate(), taxRate: state.taxSettings.rate });',
  );
}

const openOrderAside = '<label>Bay / assignment<select id="detail-bay"><option>Unassigned</option><option>Bay 1</option><option>Bay 2</option><option>Bay 3</option><option>Bay 4</option><option>Mobile</option></select></label>${jobClockControl}<section><h3>Activity</h3>';
if (!s.includes('id="mileage-panel"') && !s.includes('detail-job-address')) {
  mustReplace(
    'openOrder mileage panel',
    openOrderAside,
    '<label>Bay / assignment<select id="detail-bay"><option>Unassigned</option><option>Bay 1</option><option>Bay 2</option><option>Bay 3</option><option>Bay 4</option><option>Mobile</option></select></label>${jobClockControl}${Mileage.mileagePanelMarkup({ jobAddress: x.jobAddress || "", oneWayMiles: x.tripMilesOneWay || "", roundTrip: x.tripMiles || Mileage.roundTripMiles(x.tripMilesOneWay), rate: shopMileageRate(), charge: x.mileageCharge || Mileage.mileageCharge(x.tripMiles || Mileage.roundTripMiles(x.tripMilesOneWay), shopMileageRate()), shopAddress: shopProfile().address, canEdit: canManage })}<section><h3>Activity</h3>',
  );
}

const openOrderSaveStart = 'if (canManage) { const baySelect = document.querySelector("#detail-bay"); if (baySelect) baySelect.value = x.bay || "Unassigned"; document.querySelector("#save-order").onclick = async event => {';
if (!s.includes('bindWorkOrderMileage(".modal")')) {
  mustReplace(
    'openOrder bind mileage',
    openOrderSaveStart,
    'bindWorkOrderMileage(".modal"); if (canManage) { const baySelect = document.querySelector("#detail-bay"); if (baySelect) baySelect.value = x.bay || "Unassigned"; document.querySelector("#save-order").onclick = async event => {',
  );
}

const openOrderAssignFields = 'x.bay = document.querySelector("#detail-bay")?.value || x.bay; x.mobile = x.bay === "Mobile"; syncPayroll(x);';
if (!s.includes('detail-one-way-miles')) {
  // panel uses detail-one-way-miles; ensure save reads it
}
if (!s.includes('applyMileageToOrder(x,')) {
  mustReplace(
    'openOrder save mileage',
    openOrderAssignFields,
    'x.bay = document.querySelector("#detail-bay")?.value || x.bay; x.mobile = x.bay === "Mobile"; Object.assign(x, Mileage.applyMileageToOrder(x, { oneWayMiles: document.querySelector("#detail-one-way-miles")?.value, jobAddress: document.querySelector("#detail-job-address")?.value, rate: shopMileageRate(), taxRate: state.taxSettings.rate })); syncPayroll(x);',
  );
}

const ensureNeedle = 'async function ensureInvoiceForOrder(order) { if (!["completed", "invoiced"].includes(order.status)) return null; const existing = state.invoices.find(invoice => invoice.ro === order.id); if (existing) return existing; const number = invoiceNumberForOrder(order), estimate = order.estimate || {}, amount = Math.max(0, Number(order.total ?? estimate.total) || 0), tax = Math.max(0, Number(order.tax ?? estimate.tax) || 0), subtotal = Math.max(0, Number(estimate.subtotal) || Math.max(0, amount - tax)), issued = new Date(), due = new Date(issued); due.setDate(due.getDate() + 14); const invoice = { id: number, number, ro: order.id, customer: order.customer, vehicle: order.vehicle, amount, subtotal, tax, taxRate: Number(estimate.taxRate ?? state.taxSettings.rate) || 0, status: "sent", date: issued.toISOString().slice(0, 10), due: due.toISOString().slice(0, 10), lines: estimate.lines || [], createdAt: now() };';
if (!s.includes('Object.assign(order, Mileage.applyMileageToOrder(order, { rate: shopMileageRate()')) {
  mustReplace(
    'ensureInvoice mileage',
    ensureNeedle,
    'async function ensureInvoiceForOrder(order) { if (!["completed", "invoiced"].includes(order.status)) return null; const existing = state.invoices.find(invoice => invoice.ro === order.id); if (existing) return existing; Object.assign(order, Mileage.applyMileageToOrder(order, { rate: shopMileageRate(), taxRate: state.taxSettings.rate })); const number = invoiceNumberForOrder(order), estimate = order.estimate || {}, amount = Math.max(0, Number(order.total ?? estimate.total) || 0), tax = Math.max(0, Number(order.tax ?? estimate.tax) || 0), subtotal = Math.max(0, Number(estimate.subtotal) || Math.max(0, amount - tax)), issued = new Date(), due = new Date(issued); due.setDate(due.getDate() + 14); const invoice = { id: number, number, ro: order.id, customer: order.customer, vehicle: order.vehicle, amount, subtotal, tax, taxRate: Number(estimate.taxRate ?? state.taxSettings.rate) || 0, status: "sent", date: issued.toISOString().slice(0, 10), due: due.toISOString().slice(0, 10), lines: estimate.lines || [], createdAt: now() };',
  );
}

const helpers = `

function shopMileageRate() { return Mileage.normalizeMileageRate(shopProfile().mileageRate) }
function bindWorkOrderMileage(rootSelector) {
  const root = typeof rootSelector === "string" ? document.querySelector(rootSelector) : rootSelector;
  if (!root || root.dataset.mileageBound === "1") return;
  root.dataset.mileageBound = "1";
  const rate = () => shopMileageRate();
  const refresh = () => Mileage.refreshMileagePreview(root, { rate: rate() });
  root.querySelectorAll("#detail-one-way-miles, #new-one-way-miles, [name=tripMilesOneWay]").forEach(input => input.addEventListener("input", refresh));
  refresh();
  const calcButton = root.querySelector("#calculate-mileage, #new-calculate-mileage");
  const status = root.querySelector("#mileage-status, #new-mileage-status");
  calcButton?.addEventListener("click", async () => {
    const jobAddress = root.querySelector("#detail-job-address, [name=jobAddress]")?.value?.trim() || "";
    const shopAddress = shopProfile().address || "";
    if (!jobAddress) { toast("Enter the job site address first"); return }
    if (!shopAddress) { toast("Set the shop address in Settings before calculating mileage"); return }
    calcButton.disabled = true;
    if (status) status.textContent = "Calculating…";
    try {
      const result = await apiFetch("/mileage/calculate", { method: "POST", body: JSON.stringify({ from: shopAddress, to: jobAddress }) });
      const oneWay = Mileage.normalizeOneWayMiles(result?.oneWayMiles);
      const oneWayInput = root.querySelector("#detail-one-way-miles, #new-one-way-miles, [name=tripMilesOneWay]");
      if (oneWayInput) oneWayInput.value = String(oneWay);
      refresh();
      if (status) status.textContent = result?.source ? \`Calculated via \${result.source}\` : "Calculated";
      toast(\`Round trip \${Mileage.roundTripMiles(oneWay).toFixed(1)} mi @ $\${rate().toFixed(2)}/mi\`);
    } catch (error) {
      if (status) status.textContent = "";
      toast(error.message || "Could not calculate mileage. Enter one-way miles manually.");
    } finally {
      calcButton.disabled = false;
    }
  });
}
`;

if (!s.includes('function shopMileageRate()')) {
  // Insert helpers just before shopProfileDefaults so openNew can call shopMileageRate at runtime
  // Actually shopMileageRate uses shopProfile which is after defaults — insert after shopProfile function instead.
  const marker = 'function shopProfile() { const stored = state.shopSettingsRecords.find(item => item.id === "profile") || {}, themeMode = ["device", "light", "dark"].includes(stored.themeMode) ? stored.themeMode : "device"; return { ...shopProfileDefaults, ...stored, logoUrl: safeHttpUrl(stored.logoUrl) || shopProfileDefaults.logoUrl, brandColor: safeHexColor(stored.brandColor, shopProfileDefaults.brandColor), accentColor: safeHexColor(stored.accentColor, shopProfileDefaults.accentColor), themeMode, coupons: normalizedCoupons(stored.coupons), defaultVendor: String(stored.defaultVendor || ""), defaultVendorByKind: stored.defaultVendorByKind && typeof stored.defaultVendorByKind === "object" ? stored.defaultVendorByKind : {} } }';
  const i = s.indexOf(marker);
  if (i < 0) throw new Error('Missing shopProfile function body for helper insert');
  s = s.slice(0, i + marker.length) + helpers + s.slice(i + marker.length);
}

if (s === before) {
  console.log('No changes (already patched?)');
} else {
  fs.writeFileSync(file, s);
  console.log('Patched', file, 'delta', s.length - before.length);
}
