/**
 * Register feature modules here before the legacy SPA loads.
 *
 * Platform modules wire the three repo surfaces together:
 *   - src/ (web PWA bundle)
 *   - desktop/ (Electron shell via window.mechproDesktop)
 *   - worker/ (Workers API + D1/R2/Workers AI; see src/shared/config.js)
 */
import './platform/index.js';

export function registerModules() {
  // Future domain modules (dispatch, shop ops, AI, etc.) register here.
}

registerModules();
