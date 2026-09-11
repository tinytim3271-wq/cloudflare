/**
 * Shared HTML escaping helpers for safe string interpolation into markup.
 */

const HTML_ESCAPES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

/** Escape text for HTML element bodies. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Escape text for double-quoted HTML attribute values. */
export function escapeAttr(value) {
  return String(value ?? '').replace(/[&<"']/g, (char) => HTML_ESCAPES[char]);
}
