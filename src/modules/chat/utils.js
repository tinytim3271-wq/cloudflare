export function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function chatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
