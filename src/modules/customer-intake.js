export const CUSTOMER_SEARCH_MIN_LENGTH = 3;
export const CUSTOMER_SEARCH_DEBOUNCE_MS = 275;
export const CUSTOMER_SEARCH_RESULT_LIMIT = 8;

export function normalizeCustomerSearch(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function shouldSearchCustomers(value) {
  return normalizeCustomerSearch(value).length >= CUSTOMER_SEARCH_MIN_LENGTH;
}

function matchesName(name, query) {
  const source = String(name || '').toLocaleLowerCase();
  return normalizeCustomerSearch(query).toLocaleLowerCase().split(' ').every(token => source.includes(token));
}

function vehicleLabel(vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
    || vehicle.vehicle
    || vehicle.description
    || 'Vehicle on file';
}

function enrichCustomer(customer, vehicles) {
  const linkedVehicles = vehicles
    .filter(vehicle => (
      (customer.id && vehicle.customerId === customer.id)
      || String(vehicle.customer || '').toLocaleLowerCase() === String(customer.name || '').toLocaleLowerCase()
    ))
    .map(vehicle => ({ ...vehicle, label: vehicleLabel(vehicle) }));
  return {
    ...customer,
    id: String(customer.id || customer.name || ''),
    vehicles: linkedVehicles,
    vehicleCount: linkedVehicles.length || Number(customer.vehicles || 0),
    recentVehicle: linkedVehicles[0] || null,
  };
}

export function localCustomerMatches(query, customers = [], vehicles = []) {
  if (!shouldSearchCustomers(query)) return [];
  return customers
    .filter(customer => matchesName(customer.name, query))
    .sort((left, right) => String(left.name).localeCompare(String(right.name)))
    .slice(0, CUSTOMER_SEARCH_RESULT_LIMIT)
    .map(customer => enrichCustomer(customer, vehicles));
}

export function likelyDuplicateCustomers({ phone = '', email = '' }, customers = [], vehicles = []) {
  const phoneDigits = String(phone || '').replace(/\D/g, '');
  const normalizedEmail = String(email || '').trim().toLocaleLowerCase();
  if (!phoneDigits && !normalizedEmail) return [];
  return customers
    .filter(customer => (
      (phoneDigits && String(customer.phone || '').replace(/\D/g, '') === phoneDigits)
      || (normalizedEmail && String(customer.email || '').trim().toLocaleLowerCase() === normalizedEmail)
    ))
    .slice(0, CUSTOMER_SEARCH_RESULT_LIMIT)
    .map(customer => enrichCustomer(customer, vehicles));
}
