import test from 'node:test';
import assert from 'node:assert/strict';
import { ANTHROPIC_CONSOLE_URL, SHOP_AI_PROMPT, shopAiPanelHtml, shopAiStatusLabel } from './shop-ai-settings.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

test('status label shows the included Cloudflare AI or the masked Claude key', () => {
  assert.equal(shopAiStatusLabel({ hasKey: false }), 'Using Cloudflare AI (included)');
  assert.equal(shopAiStatusLabel({ hasKey: true, maskedKey: '\u2022\u2022\u2022\u20221234' }), 'Using Claude with your key \u2022\u2022\u2022\u20221234');
});

test('panel shows the upgrade prompt, console link, and status', () => {
  const html = shopAiPanelHtml({ loaded: true, hasKey: false }, { canManage: true, escapeHtml });
  assert.ok(html.includes(escapeHtml(SHOP_AI_PROMPT)));
  assert.ok(html.includes(`href="${ANTHROPIC_CONSOLE_URL}"`));
  assert.match(html, /console\.anthropic\.com/);
  assert.match(html, /Using Cloudflare AI \(included\)/);
  assert.match(html, /id="shop-ai-key-form"/);
  assert.doesNotMatch(html, /shop-ai-remove-key/);
});

test('panel for a saved key offers replace/remove and never renders a key value', () => {
  const html = shopAiPanelHtml({ loaded: true, hasKey: true, maskedKey: '\u2022\u2022\u2022\u2022WXYZ', status: 'active' }, { canManage: true, escapeHtml });
  assert.match(html, /Using Claude with your key \u2022\u2022\u2022\u2022WXYZ/);
  assert.match(html, /Replace key/);
  assert.match(html, /id="shop-ai-remove-key"/);
  assert.doesNotMatch(html, /value="sk-ant/);
});

test('non-admins see status only, and key errors are surfaced', () => {
  const html = shopAiPanelHtml({ loaded: true, hasKey: true, maskedKey: '\u2022\u2022\u2022\u20221234', status: 'key_error', lastError: 'Your Anthropic account is out of credits.' }, { canManage: false, escapeHtml });
  assert.doesNotMatch(html, /shop-ai-key-form/);
  assert.match(html, /Only shop owners and admins/);
  assert.match(html, /out of credits/);
  assert.match(html, /role="alert"/);
});