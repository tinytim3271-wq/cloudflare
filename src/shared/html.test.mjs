import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, escapeAttr } from './html.js';

test('escapeHtml encodes markup-sensitive characters', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtml(`Tom & "Jerry"`), 'Tom &amp; &quot;Jerry&quot;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('escapeAttr encodes attribute-sensitive characters', () => {
  assert.equal(escapeAttr('a&b'), 'a&amp;b');
  assert.equal(escapeAttr('say "hi"'), 'say &quot;hi&quot;');
  assert.equal(escapeAttr("it's"), 'it&#39;s');
  assert.equal(escapeAttr('<x>'), '&lt;x>');
});
