import test from 'node:test';
import assert from 'node:assert/strict';
import {
  customLaborDraft,
  customersWithSelected,
  estimateEditorDescription,
} from './work-order-editor.js';

test('customer choices retain an order customer missing from the loaded customer list', () => {
  const customers = [{ name: 'Tebria Ingram' }];
  const choices = customersWithSelected(customers, 'Isaac Gallardo');

  assert.deepEqual(choices.map(customer => customer.name), ['Isaac Gallardo', 'Tebria Ingram']);
  assert.deepEqual(customers, [{ name: 'Tebria Ingram' }]);
  assert.equal(customersWithSelected(choices, 'Isaac Gallardo').length, 2);
});

test('custom labor starts empty with a placeholder and typed text is not prefixed', () => {
  const draft = customLaborDraft('labor-1', 140);
  const initial = estimateEditorDescription(draft, 'Labor');
  const typed = estimateEditorDescription({ ...draft, description: 'Diagnose vibration' }, 'Diagnose vibration');

  assert.deepEqual(initial, { value: '', placeholder: 'Custom labor' });
  assert.deepEqual(typed, { value: 'Diagnose vibration', placeholder: 'Custom labor' });
});
