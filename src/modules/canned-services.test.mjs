import assert from 'node:assert/strict';
import test from 'node:test';
import { CANNED_MENU, cannedServiceGroups, estimateLineFromService, missingCannedServices } from './canned-services.js';

test('the starter menu has the van and shop prices', () => {
  assert.equal(CANNED_MENU.length, 19);
  assert.equal(CANNED_MENU.filter(item => item.channel === 'van').length, 14);
  assert.equal(CANNED_MENU.filter(item => item.channel === 'shop').length, 5);
  const price = name => CANNED_MENU.find(item => item.name === name).menuPrice;
  assert.equal(price('Conventional Oil Change'), 54.95);
  assert.equal(price('Full Synthetic Oil Change'), 74.95);
  assert.equal(price('Call-Out / No-Access Fee'), 49.95);
  assert.equal(price('Full Brake Job With Rotors'), 899.95);
  assert.equal(price('V6 Tune-Up With Plugs and Coils'), 849.95);
  assert.ok(CANNED_MENU.every(item => item.partsPrice === item.menuPrice && item.laborHours === 0 && item.catalog === true));
});

test('a shop that already edited or removed a job is not overwritten', () => {
  assert.equal(missingCannedServices([], []).length, 19);
  const edited = [{ id: 'menu-wipers', name: 'Wiper Blades', menuPrice: 44 }];
  const missing = missingCannedServices(edited, []);
  assert.equal(missing.some(item => item.id === 'menu-wipers'), false);
  assert.equal(missing.length, 18);
  const renamed = [{ id: 'service-custom', name: 'Tire Rotation', menuPrice: 20 }];
  assert.equal(missingCannedServices(renamed, []).some(item => item.name === 'Tire Rotation'), false);
  assert.equal(missingCannedServices([], ['menu-battery']).some(item => item.id === 'menu-battery'), false);
  assert.deepEqual(missingCannedServices([{ id: 'menu-battery', name: 'Battery Swap' }], CANNED_MENU.map(item => item.id)), []);
});

test('estimate lines use the menu price and leave the shop note off the customer copy', () => {
  const line = estimateLineFromService(CANNED_MENU.find(item => item.id === 'menu-synthetic-oil'));
  assert.deepEqual(line, {
    service: 'Full Synthetic Oil Change',
    notes: CANNED_MENU.find(item => item.id === 'menu-synthetic-oil').description,
    hours: 0,
    parts: 74.95,
    discount: 0,
  });
  assert.equal(line.notes.includes('Costa'), false);
  const custom = estimateLineFromService({ name: 'Custom', description: 'Inspect', laborHours: 1.5, partsPrice: 40, discount: 10 });
  assert.equal(custom.hours, 1.5);
  assert.equal(custom.parts, 40);
  assert.equal(custom.discount, 10);
});

test('jobs group into van and shop menus', () => {
  const groups = cannedServiceGroups(CANNED_MENU);
  assert.deepEqual(groups.map(group => group.id), ['van', 'shop']);
  assert.equal(groups[0].items[0].name, 'Conventional Oil Change');
  assert.equal(groups[1].items.at(-1).name, 'V6 Tune-Up With Plugs and Coils');
});
