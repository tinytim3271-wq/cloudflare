/**
 * MechPro unified entry — browser PWA and Electron desktop share this bundle.
 * Order: shared config + platform modules → home helpers → legacy SPA.
 */
import { cloudflareConfig, storageKeys } from './shared/config.js';
import { escapeAttr, escapeHtml } from './shared/html.js';
import './modules/register.js';
import './runtime/home.js';

window.__MECHPRO_CONFIG__ = { cloudflare: cloudflareConfig, storage: storageKeys };
window.__MECHPRO_HTML__ = { escapeAttr, escapeHtml };

const bootstrapHooks = {
  beforeLegacyAppMount: () => {},
  afterLegacyAppMount: () => {},
  registerFeatureModule: () => {},
};

window.__MECHPRO_BOOTSTRAP__ = Object.freeze({ ...bootstrapHooks });
window.__MECHPRO_BOOTSTRAP__.beforeLegacyAppMount();
await import('./runtime/legacy.js');
window.__MECHPRO_BOOTSTRAP__.afterLegacyAppMount();
