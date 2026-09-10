export const DEFAULT_PAGES_ORIGIN = 'https://mechpro-dispatch.pages.dev';

export function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export function isApiRequest(request) {
  return isApiPath(new URL(request.url).pathname);
}

export function pagesProxyUrl(requestUrl, pagesOrigin = DEFAULT_PAGES_ORIGIN) {
  const incoming = new URL(requestUrl);
  const origin = String(pagesOrigin || DEFAULT_PAGES_ORIGIN).replace(/\/$/, '');
  return new URL(`${incoming.pathname}${incoming.search}`, origin).href;
}
