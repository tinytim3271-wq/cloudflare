/**
 * MechPro unified entry — browser PWA and Electron desktop share this bundle.
 * Order: shared config + platform modules → home helpers → legacy SPA.
 */
import { cloudflareConfig, storageKeys } from './shared/config.js';
import './modules/register.js';
import './runtime/home.js';

window.__MECHPRO_CONFIG__ = { cloudflare: cloudflareConfig, storage: storageKeys };
import './runtime/legacy.js';
