export function customersWithSelected(customers = [], selected = '') {
  const records = Array.isArray(customers) ? customers : [];
  const selectedName = String(selected || '');
  if (!selectedName || records.some(customer => customer?.name === selectedName)) return records;
  return [{ name: selectedName }, ...records];
}

export function customLaborDraft(id, laborRate) {
  return {
    id,
    type: 'labor',
    description: '',
    descriptionPlaceholder: 'Custom labor',
    hours: 1,
    laborRate: Number(laborRate) || 0,
  };
}

export function estimateEditorDescription(line = {}, normalizedDescription = '') {
  const placeholder = String(line.descriptionPlaceholder || '');
  return {
    value: placeholder ? String(line.description || '') : String(normalizedDescription || ''),
    placeholder,
  };
}
