const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_INPUT_BYTES = 32_000;
const MAX_ITEMS = 100;
const MAX_STRING_LENGTH = 500;

export class PartsProviderError extends Error {
  constructor(provider, operation, message, options = {}) {
    super(`${provider} ${operation}: ${message}`, options);
    this.name = 'PartsProviderError';
    this.provider = provider;
    this.operation = operation;
    if (options.status) this.status = options.status;
  }
}

export const PARTS_PROVIDER_REGISTRY = Object.freeze({
  partstech: Object.freeze({
    id: 'partstech',
    provider: 'PartsTech',
    envPrefix: 'PARTSTECH',
  }),
  nexpart: Object.freeze({
    id: 'nexpart',
    provider: 'Nexpart',
    envPrefix: 'NEXPART',
  }),
});

const OPERATIONS = Object.freeze({
  status: 'GET',
  search: 'POST',
  quote: 'POST',
  order: 'POST',
});

function cleanText(value, maxLength = MAX_STRING_LENGTH) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function validatePartsUrl(value, label = 'provider URL') {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new TypeError(`${label} must be a valid URL`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHost(url.hostname))) {
    throw new TypeError(`${label} must use HTTPS (HTTP is allowed only for localhost)`);
  }
  url.username = '';
  url.password = '';
  return url;
}

function boundedTimeout(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 100), 30_000) : DEFAULT_TIMEOUT_MS;
}

function providerSpec(provider) {
  const id = cleanText(provider, 30).toLowerCase();
  const spec = PARTS_PROVIDER_REGISTRY[id];
  if (!spec) throw new TypeError(`Unknown parts provider: ${provider}`);
  return spec;
}

function providerConfig(env, spec) {
  const prefix = spec.envPrefix;
  const apiKey = env?.[`${prefix}_API_KEY`] || env?.[`${prefix}_TOKEN`] || '';
  const username = env?.[`${prefix}_USERNAME`] || '';
  const password = env?.[`${prefix}_PASSWORD`] || '';
  const paths = Object.fromEntries(Object.keys(OPERATIONS).map((operation) => [
    operation,
    env?.[`${prefix}_${operation.toUpperCase()}_PATH`] || '',
  ]));
  return {
    baseUrl: env?.[`${prefix}_BASE_URL`] || env?.[`${prefix}_API_BASE_URL`] || '',
    punchoutUrl: env?.[`${prefix}_PUNCHOUT_URL`] || env?.[`${prefix}_PUNCH_OUT_URL`] || '',
    apiKey,
    username,
    password,
    authHeader: cleanText(env?.[`${prefix}_AUTH_HEADER`] || 'Authorization', 80),
    authScheme: cleanText(env?.[`${prefix}_AUTH_SCHEME`] ?? 'Bearer', 40),
    paths,
    methods: Object.fromEntries(Object.entries(OPERATIONS).map(([operation, defaultMethod]) => [
      operation,
      cleanText(env?.[`${prefix}_${operation.toUpperCase()}_METHOD`] || defaultMethod, 8).toUpperCase(),
    ])),
    hasCredential: Boolean(apiKey || (username && password)),
  };
}

export function getPartsProviderStatus(env = {}) {
  return Object.fromEntries(Object.values(PARTS_PROVIDER_REGISTRY).map((spec) => {
    const config = providerConfig(env, spec);
    let configurationError = null;
    for (const [value, label] of [
      [config.baseUrl, `${spec.provider} base URL`],
      [config.punchoutUrl, `${spec.provider} punch-out URL`],
    ]) {
      if (!value) continue;
      try {
        validatePartsUrl(value, label);
      } catch (error) {
        configurationError ||= error.message;
      }
    }
    return [spec.id, {
      provider: spec.provider,
      configured: Boolean(config.baseUrl && config.hasCredential && !configurationError),
      hasPunchout: Boolean(config.punchoutUrl && !configurationError),
      operations: Object.fromEntries(Object.keys(OPERATIONS).map((operation) => [
        operation,
        Boolean(config.baseUrl && config.hasCredential && config.paths[operation] && !configurationError),
      ])),
      configurationError,
    }];
  }));
}

function boundedValue(value, depth = 0) {
  if (depth > 6) throw new TypeError('parts request is nested too deeply');
  if (typeof value === 'string') return cleanText(value);
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((item) => boundedValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, MAX_ITEMS).map(([key, item]) => [
      cleanText(key, 80),
      boundedValue(item, depth + 1),
    ]));
  }
  if (value === null || ['number', 'boolean'].includes(typeof value)) return value;
  return undefined;
}

export function normalizePartsInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('parts request input must be an object');
  }
  const normalized = boundedValue(input);
  if (JSON.stringify(normalized).length > MAX_INPUT_BYTES) {
    throw new TypeError(`parts request exceeds ${MAX_INPUT_BYTES} bytes`);
  }
  return normalized;
}

function buildHeaders(config) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers[config.authHeader] = config.authScheme
      ? `${config.authScheme} ${config.apiKey}`
      : String(config.apiKey);
  } else {
    headers.Authorization = `Basic ${btoa(`${config.username}:${config.password}`)}`;
  }
  return headers;
}

function operationUrl(config, spec, operation, input) {
  const base = validatePartsUrl(config.baseUrl, `${spec.provider} base URL`);
  const path = config.paths[operation].replace(/\{([a-zA-Z][\w]*)\}/g, (_, key) => {
    if (input[key] === undefined || input[key] === null || input[key] === '') {
      throw new TypeError(`Missing identifier for URL placeholder: ${key}`);
    }
    return encodeURIComponent(String(input[key]).slice(0, MAX_STRING_LENGTH));
  });
  const url = new URL(path.replace(/^\/+/, ''), `${base.toString().replace(/\/?$/, '/')}`);
  if (url.origin !== base.origin) {
    throw new TypeError(`${spec.provider} ${operation} path must be relative to its base URL`);
  }
  return url;
}

function boundedOutput(payload) {
  if (Array.isArray(payload)) return payload.slice(0, MAX_ITEMS).map((item) => boundedValue(item));
  if (!payload || typeof payload !== 'object') return payload;
  const copy = boundedValue(payload);
  for (const key of ['items', 'results', 'parts', 'quotes', 'orders']) {
    if (Array.isArray(copy[key])) copy[key] = copy[key].slice(0, MAX_ITEMS);
  }
  if (copy.data && typeof copy.data === 'object') {
    for (const key of ['items', 'results', 'parts']) {
      if (Array.isArray(copy.data[key])) copy.data[key] = copy.data[key].slice(0, MAX_ITEMS);
    }
  }
  return copy;
}

/**
 * Calls a configured PartsTech or Nexpart endpoint without assuming a vendor
 * contract. Configure `<PREFIX>_<OPERATION>_PATH` for status/search/quote/order;
 * paths may contain `{id}`, `{quoteId}`, or any input key as a URL-encoded
 * placeholder. GET sends remaining input as query parameters; other methods
 * send bounded JSON. Common JSON is returned in a provider-tagged envelope.
 */
export async function requestPartsProvider(env, provider, operation, input = {}, options = {}) {
  const spec = providerSpec(provider);
  const operationId = cleanText(operation, 20).toLowerCase();
  if (!OPERATIONS[operationId]) throw new TypeError(`Unsupported parts operation: ${operation}`);
  const config = providerConfig(env, spec);
  if (!config.baseUrl || !config.hasCredential) {
    throw new PartsProviderError(spec.provider, operationId, 'provider is not configured');
  }
  if (!config.paths[operationId]) {
    throw new PartsProviderError(spec.provider, operationId, 'operation endpoint is not configured');
  }
  const normalized = normalizePartsInput(input);
  let url;
  try {
    url = operationUrl(config, spec, operationId, normalized);
  } catch (error) {
    throw new PartsProviderError(spec.provider, operationId, error.message, { cause: error });
  }

  const method = config.methods[operationId];
  const init = {
    method,
    headers: buildHeaders(config),
    signal: options.signal || AbortSignal.timeout(boundedTimeout(options.timeoutMs ?? env?.PARTS_PROVIDER_TIMEOUT_MS)),
  };
  if (method === 'GET') {
    for (const [key, value] of Object.entries(normalized)) {
      if (value !== undefined && (typeof value !== 'object' || value === null)) {
        url.searchParams.set(key, String(value));
      }
    }
  } else {
    init.body = JSON.stringify(normalized);
  }

  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    throw new PartsProviderError(spec.provider, operationId, `request failed: ${error.message}`, { cause: error });
  }
  if (!response.ok) {
    throw new PartsProviderError(spec.provider, operationId, `request returned HTTP ${response.status}`, {
      status: response.status,
    });
  }
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new PartsProviderError(spec.provider, operationId, 'response was not valid JSON', { cause: error });
  }
  return {
    provider: spec.provider,
    operation: operationId,
    data: boundedOutput(payload),
  };
}

export function getPartsPunchoutUrl(env, provider) {
  const spec = providerSpec(provider);
  const config = providerConfig(env, spec);
  if (!config.punchoutUrl) return null;
  try {
    return validatePartsUrl(config.punchoutUrl, `${spec.provider} punch-out URL`).toString();
  } catch (error) {
    throw new PartsProviderError(spec.provider, 'punchout', error.message, { cause: error });
  }
}

export const getPartsStatus = (env, provider, input, options) =>
  requestPartsProvider(env, provider, 'status', input, options);
export const searchParts = (env, provider, input, options) =>
  requestPartsProvider(env, provider, 'search', input, options);
export const quoteParts = (env, provider, input, options) =>
  requestPartsProvider(env, provider, 'quote', input, options);
export const orderParts = (env, provider, input, options) =>
  requestPartsProvider(env, provider, 'order', input, options);
