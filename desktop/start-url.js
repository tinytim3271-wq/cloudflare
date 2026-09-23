'use strict';

const DEFAULT_DESKTOP_APP_URL = 'https://www.yourcarguy806.com/';

/**
 * Resolve what the Electron shell should load.
 * Production desktop must use the hosted HTTPS app so /api auth and cookies are same-origin.
 * Local asset mode (smoke tests / offline UI checks) keeps loadFile via file://.
 */
function resolveDesktopStart(options = {}) {
  const argv = options.argv || process.argv;
  const env = options.env || process.env;
  const useLocalAssets = argv.includes('--smoke-test')
    || argv.includes('--local-assets')
    || env.MECHPRO_DESKTOP_LOCAL === '1';
  const remoteUrl = String(env.MECHPRO_DESKTOP_URL || DEFAULT_DESKTOP_APP_URL).trim() || DEFAULT_DESKTOP_APP_URL;
  return {
    useLocalAssets,
    remoteUrl: remoteUrl.endsWith('/') ? remoteUrl : `${remoteUrl}/`,
  };
}

module.exports = {
  DEFAULT_DESKTOP_APP_URL,
  resolveDesktopStart,
};
