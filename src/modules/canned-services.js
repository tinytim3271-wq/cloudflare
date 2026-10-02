/**
 * Starter canned-job menu. Shops can edit every field after it is copied
 * onto their service list. Shop notes stay off the customer estimate.
 */

export const CANNED_MENU = [
  {
    id: 'menu-conventional-oil',
    sort: 1,
    channel: 'van',
    name: 'Conventional Oil Change',
    menuPrice: 54.95,
    description: 'Includes up to 5 quarts conventional oil, standard oil filter, drain-plug washer if needed, fluid-level check, and tire-pressure check.',
    marginNote: 'Protects margin through a five-quart cap and standard filter; extra oil or specialty filters are add-ons.',
  },
  {
    id: 'menu-synthetic-oil',
    sort: 2,
    channel: 'van',
    name: 'Full Synthetic Oil Change',
    menuPrice: 74.95,
    description: 'Includes up to 5 quarts full-synthetic oil, standard filter, drain-plug washer if needed, fluid-level check, and tire-pressure check.',
    marginNote: "Matches the local dealer's advertised $74.95 and stays near Costa/Midas while controlling oil-capacity and filter costs.",
  },
  {
    id: 'menu-front-pads',
    sort: 3,
    channel: 'van',
    name: 'Front Brake Pad Replacement',
    menuPrice: 219.95,
    description: 'Includes front ceramic/semi-metallic pads, hardware where supplied, pad replacement, bracket cleaning, contact-point lubrication, brake inspection, and road test; rotors excluded.',
    marginNote: 'Standard pad selection and no rotor guarantee keep parts predictable; seized hardware or rotor replacement is separately quoted.',
  },
  {
    id: 'menu-rear-pads',
    sort: 4,
    channel: 'van',
    name: 'Rear Brake Pad Replacement',
    menuPrice: 209.95,
    description: 'Includes rear pads, supplied hardware, bracket cleaning, lubrication, brake inspection, and road test; rotors excluded.',
    marginNote: 'Rear jobs generally require less labor and material than fronts; electronic parking-brake service or seized components may add cost.',
  },
  {
    id: 'menu-brake-flush',
    sort: 5,
    channel: 'van',
    name: 'Brake Fluid Flush',
    menuPrice: 79.95,
    description: 'Includes removal/exchange of old brake fluid, fresh DOT 3/4 fluid, four-wheel bleed, leak check, and pedal check.',
    marginNote: 'Fluid consumption is capped at approximately one quart; ABS bleed procedures or damaged bleeders are extra.',
  },
  {
    id: 'menu-battery',
    sort: 6,
    channel: 'van',
    name: 'Battery Swap',
    menuPrice: 219.95,
    description: 'Includes a standard 3-year flooded battery, installation, terminal cleaning/protection, charging-system test, and battery reset when supported.',
    marginNote: 'Price assumes common group-size batteries; AGM/EFB batteries, battery registration, and difficult-access batteries preserve profitability through an upgrade charge.',
  },
  {
    id: 'menu-wipers',
    sort: 7,
    channel: 'van',
    name: 'Wiper Blades',
    menuPrice: 39.95,
    description: 'Includes two standard beam or hybrid blades, installation, washer-fluid check, and windshield wipe test.',
    marginNote: "The price is below KBB's roughly $53-$64 installed benchmark while allowing a normal markup on mid-grade blades.",
  },
  {
    id: 'menu-engine-filter',
    sort: 8,
    channel: 'van',
    name: 'Engine Air Filter',
    menuPrice: 39.95,
    description: 'Includes one standard engine air filter, installation, airbox inspection, and intake-area cleanup.',
    marginNote: 'Standard filter coverage keeps parts cost controlled; specialty or multiple-filter applications are exceptions.',
  },
  {
    id: 'menu-cabin-filter',
    sort: 9,
    channel: 'van',
    name: 'Cabin Air Filter',
    menuPrice: 59.95,
    description: 'Includes one standard cabin/pollen filter, installation, housing cleanup, and HVAC airflow check.',
    marginNote: "It undercuts McGavock's $69.95 starting price; difficult glovebox/cowl access and premium carbon filters are the main cost risks.",
  },
  {
    id: 'menu-serpentine',
    sort: 10,
    channel: 'van',
    name: 'Serpentine Belt',
    menuPrice: 139.95,
    description: 'Includes one standard serpentine belt, removal/installation, pulley and tensioner inspection, belt-routing verification, and run test.',
    marginNote: "Close to Turbo Mo's $140 local menu price, with profit protected by excluding tensioners, idlers, and damaged pulleys.",
  },
  {
    id: 'menu-rotation',
    sort: 11,
    channel: 'van',
    name: 'Tire Rotation',
    menuPrice: 29.95,
    description: 'All four tires rotated to pattern, lug torque check, pressures set.',
    marginNote: 'Pairs with oil (bundle free/half-off); alone covers short labor plus a trip share.',
  },
  {
    id: 'menu-nostart',
    sort: 12,
    channel: 'van',
    name: 'No-Start Diagnostic',
    menuPrice: 99.95,
    description: 'Battery load test, starter draw, alternator charging test; written go/no-go on those three.',
    marginNote: 'In the local $75-$150 diagnostic band; credit toward the same-visit repair if approved.',
  },
  {
    id: 'menu-fuel-treatment',
    sort: 13,
    channel: 'van',
    name: 'Fuel System Treatment / DI Injector Clean',
    menuPrice: 149.95,
    description: 'DI-safe induction or on-car cleaner plus tank additive, idle/road check. Not injector R&R.',
    marginNote: 'Chemical cost is low; labor and the DI-specific product carry the profit.',
  },
  {
    id: 'menu-callout',
    sort: 14,
    channel: 'van',
    name: 'Call-Out / No-Access Fee',
    menuPrice: 49.95,
    description: "Customer no-show, locked/inaccessible vehicle, or job can't start through no fault of yours.",
    marginNote: "Covers a Lubbock drive without sticker shock; waive on a same-day reschedule if the trip wasn't wasted far.",
  },
  {
    id: 'menu-brake-job',
    sort: 15,
    channel: 'shop',
    name: 'Full Brake Job With Rotors',
    menuPrice: 899.95,
    description: 'Includes all four standard rotors, all four ceramic/semi-metallic pad sets, hardware where supplied, bracket cleaning/lubrication, brake inspection, and road test.',
    marginNote: "This sits in the Lubbock market's roughly $600-$1,200 all-four range while leaving room for normal parts markup; calipers, hubs, premium trucks, and seized hardware are excluded.",
  },
  {
    id: 'menu-coolant',
    sort: 16,
    channel: 'shop',
    name: 'Coolant Flush',
    menuPrice: 159.95,
    description: 'Includes cooling-system drain/flush, up to approximately two gallons of OEM-spec coolant and distilled-water mixture, reservoir service, leak inspection, refill, and temperature check.',
    marginNote: "Consistent with independent-shop estimates around $100-$180 and KBB's broader $131-$209 range; specialty coolant, extra capacity, and bleeding complications are add-ons.",
  },
  {
    id: 'menu-transmission',
    sort: 17,
    channel: 'shop',
    name: 'Transmission Service',
    menuPrice: 299.95,
    description: 'Includes transmission pan drain, filter and gasket where serviceable, up to six quarts OEM-spec ATF, fluid-level correction, leak inspection, and shift-quality check.',
    marginNote: "Undercuts McGavock's $399.95 starting price while covering a proper service rather than a low-priced labor-only flush; sealed units, extra fluid, and machine exchanges are separately priced.",
  },
  {
    id: 'menu-differential',
    sort: 18,
    channel: 'shop',
    name: 'Differential Fluid Service',
    menuPrice: 129.95,
    description: 'Includes one differential drain-and-fill, up to three quarts synthetic gear oil, limited-slip additive when required, plug inspection, leak check, and cleanup.',
    marginNote: "Slightly above Turbo Mo's $105 local menu price but includes fluid and materials; AWD vehicles, two differentials, covers, and gasket replacement require an upgrade.",
  },
  {
    id: 'menu-v6-tuneup',
    sort: 19,
    channel: 'shop',
    name: 'V6 Tune-Up With Plugs and Coils',
    menuPrice: 849.95,
    description: 'Includes six OEM-spec iridium/platinum spark plugs, six OE-quality ignition coils, dielectric grease, plug-gap verification, ignition-system scan, code clearing, and road test.',
    marginNote: 'Targets the common 2026 V6 combined range of approximately $600-$1,000 while preserving margin on coils; transverse V6 intake-manifold removal, OEM-only coils, and luxury applications require a revised quote.',
  },
].map(item => ({
  ...item,
  catalog: true,
  laborHours: 0,
  partsPrice: item.menuPrice,
  discount: 0,
}));

export function missingCannedServices(existing = [], seededIds = []) {
  const present = new Set([
    ...(Array.isArray(seededIds) ? seededIds : []),
    ...existing.map(service => service?.id),
  ]);
  const names = new Set(existing.map(service => String(service?.name || '').trim().toLowerCase()).filter(Boolean));
  return CANNED_MENU.filter(item => !present.has(item.id) && !names.has(item.name.toLowerCase()));
}

export function cannedServiceGroups(services = []) {
  const groups = [
    { id: 'van', label: 'Van menu', items: [] },
    { id: 'shop', label: 'Shop menu', items: [] },
    { id: 'other', label: 'Other services', items: [] },
  ];
  const sorted = [...services].sort((left, right) => (Number(left.sort || 1000) - Number(right.sort || 1000)) || String(left.name || '').localeCompare(String(right.name || '')));
  for (const service of sorted) {
    const channel = service.channel === 'van' || service.channel === 'shop' ? service.channel : 'other';
    groups.find(group => group.id === channel).items.push(service);
  }
  return groups.filter(group => group.items.length);
}

/** Flat menu price becomes the estimate line. The shop note is not included. */
export function estimateLineFromService(service) {
  const menuPrice = Number(service?.menuPrice);
  const priced = service?.menuPrice != null && Number.isFinite(menuPrice);
  return {
    service: String(service?.name || ''),
    notes: String(service?.description || ''),
    hours: priced ? 0 : Math.max(0, Number(service?.laborHours) || 0),
    parts: priced ? Math.max(0, menuPrice) : Math.max(0, Number(service?.partsPrice) || 0),
    discount: Math.min(100, Math.max(0, Number(service?.discount) || 0)),
  };
}
