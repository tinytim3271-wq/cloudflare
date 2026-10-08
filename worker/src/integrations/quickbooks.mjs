const AUTHORIZATION_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const API_BASE_URLS = Object.freeze({
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
});
const ACCOUNTING_SCOPE = "com.intuit.quickbooks.accounting";
const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;
const EXPIRY_SKEW_MS = 60 * 1000;

export class QuickBooksError extends Error {
  constructor(message, { code = "QUICKBOOKS_ERROR", status = 0 } = {}) {
    super(message);
    this.name = "QuickBooksError";
    this.code = code;
    this.status = status;
  }
}

function requiredString(value, name, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw new QuickBooksError(`${name} is required`, { code: "INVALID_INPUT" });
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new QuickBooksError(`${name} exceeds ${maxLength} characters`, {
      code: "INVALID_INPUT",
    });
  }
  return normalized;
}

function optionalString(value, name, maxLength) {
  if (value == null || value === "") return undefined;
  return requiredString(value, name, maxLength);
}

function boundedNumber(value, name, { min = 0, max = 999_999_999_999 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new QuickBooksError(`${name} must be a number between ${min} and ${max}`, {
      code: "INVALID_INPUT",
    });
  }
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function isoDate(value, name) {
  if (value == null || value === "") return undefined;
  const date = requiredString(value, name, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new QuickBooksError(`${name} must be an ISO date (YYYY-MM-DD)`, {
      code: "INVALID_INPUT",
    });
  }
  return date;
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function resolveConfig(env = {}) {
  const environment = env.INTUIT_ENVIRONMENT || "production";
  if (!Object.hasOwn(API_BASE_URLS, environment)) {
    throw new QuickBooksError("INTUIT_ENVIRONMENT must be sandbox or production", {
      code: "QUICKBOOKS_UNCONFIGURED",
    });
  }
  return {
    clientId: requiredString(env.INTUIT_CLIENT_ID, "INTUIT_CLIENT_ID", 255),
    clientSecret: requiredString(env.INTUIT_CLIENT_SECRET, "INTUIT_CLIENT_SECRET", 1024),
    redirectUri: requiredString(env.INTUIT_REDIRECT_URI, "INTUIT_REDIRECT_URI", 2048),
    environment,
    apiBaseUrl: API_BASE_URLS[environment],
  };
}

function assertFunction(value, name) {
  if (typeof value !== "function") {
    throw new QuickBooksError(`${name} callback is required`, {
      code: "QUICKBOOKS_UNCONFIGURED",
    });
  }
  return value;
}

function randomBase64Url(cryptoImpl, byteLength) {
  const bytes = new Uint8Array(byteLength);
  cryptoImpl.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function sha256Base64Url(cryptoImpl, value) {
  const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function basicAuthorization(clientId, clientSecret) {
  const bytes = new TextEncoder().encode(`${clientId}:${clientSecret}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function apiError(data, status) {
  const fault = data?.Fault;
  const detail = fault?.Error?.[0]?.Detail || fault?.Error?.[0]?.Message;
  const safeDetail = typeof detail === "string" ? detail.slice(0, 500) : "";
  return new QuickBooksError(
    safeDetail ? `QuickBooks request failed: ${safeDetail}` : `QuickBooks request failed (${status})`,
    { code: "QUICKBOOKS_API_ERROR", status },
  );
}

function tokenMetadata(tokens) {
  return compact({
    realmId: tokens.realmId,
    expiresAt: tokens.expiresAt,
    refreshExpiresAt: tokens.refreshExpiresAt,
    scope: tokens.scope,
  });
}

function normalizeTokenResponse(data, previous, realmId, now) {
  const accessToken = requiredString(data?.access_token, "QuickBooks access token", 8192);
  const refreshToken =
    optionalString(data?.refresh_token, "QuickBooks refresh token", 8192) ||
    previous?.refreshToken;
  if (!refreshToken) {
    throw new QuickBooksError("QuickBooks did not provide a refresh token", {
      code: "QUICKBOOKS_TOKEN_ERROR",
    });
  }
  return {
    accessToken,
    refreshToken,
    tokenType: optionalString(data.token_type, "QuickBooks token type", 50) || "bearer",
    scope: optionalString(data.scope, "QuickBooks scope", 1000) || previous?.scope,
    expiresAt: now + boundedNumber(data.expires_in ?? 3600, "expires_in", { min: 1 }) * 1000,
    refreshExpiresAt:
      data.x_refresh_token_expires_in == null
        ? previous?.refreshExpiresAt
        : now +
          boundedNumber(data.x_refresh_token_expires_in, "x_refresh_token_expires_in", {
            min: 1,
          }) *
            1000,
    realmId: requiredString(realmId || previous?.realmId, "QuickBooks realmId", 255),
  };
}

function callbackValues(callback) {
  if (callback instanceof URL || typeof callback === "string") {
    const url = callback instanceof URL ? callback : new URL(callback);
    return {
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      realmId: url.searchParams.get("realmId"),
      error: url.searchParams.get("error"),
    };
  }
  if (!callback || typeof callback !== "object") {
    throw new QuickBooksError("OAuth callback parameters are required", {
      code: "INVALID_INPUT",
    });
  }
  return callback;
}

export function normalizeQuickBooksCustomer(customer) {
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) {
    throw new QuickBooksError("customer must be an object", { code: "INVALID_INPUT" });
  }
  const displayName = requiredString(
    customer.displayName || customer.name || customer.companyName,
    "customer.displayName",
    500,
  );
  const address = customer.billingAddress || customer.address;
  const payload = compact({
    DisplayName: displayName,
    GivenName: optionalString(customer.givenName || customer.firstName, "customer.givenName", 100),
    FamilyName: optionalString(customer.familyName || customer.lastName, "customer.familyName", 100),
    CompanyName: optionalString(customer.companyName, "customer.companyName", 500),
    PrimaryEmailAddr: customer.email
      ? { Address: requiredString(customer.email, "customer.email", 100) }
      : undefined,
    PrimaryPhone: customer.phone
      ? { FreeFormNumber: requiredString(customer.phone, "customer.phone", 30) }
      : undefined,
    BillAddr: address
      ? compact({
          Line1: optionalString(address.line1, "customer.billingAddress.line1", 500),
          Line2: optionalString(address.line2, "customer.billingAddress.line2", 500),
          City: optionalString(address.city, "customer.billingAddress.city", 255),
          CountrySubDivisionCode: optionalString(
            address.region || address.state,
            "customer.billingAddress.region",
            255,
          ),
          PostalCode: optionalString(address.postalCode, "customer.billingAddress.postalCode", 30),
          Country: optionalString(address.country, "customer.billingAddress.country", 255),
        })
      : undefined,
  });
  if (payload.BillAddr && Object.keys(payload.BillAddr).length === 0) delete payload.BillAddr;
  return payload;
}

export function normalizeQuickBooksInvoice(invoice) {
  if (!invoice || typeof invoice !== "object" || Array.isArray(invoice)) {
    throw new QuickBooksError("invoice must be an object", { code: "INVALID_INPUT" });
  }
  const customerId = requiredString(
    invoice.quickBooksCustomerId || invoice.customerId,
    "invoice.quickBooksCustomerId",
    255,
  );
  if (!Array.isArray(invoice.lines) || invoice.lines.length === 0 || invoice.lines.length > 1000) {
    throw new QuickBooksError("invoice.lines must contain 1 to 1000 lines", {
      code: "INVALID_INPUT",
    });
  }
  return compact({
    CustomerRef: { value: customerId },
    DocNumber: optionalString(invoice.number || invoice.docNumber, "invoice.number", 21),
    TxnDate: isoDate(invoice.date || invoice.txnDate, "invoice.date"),
    DueDate: isoDate(invoice.dueDate, "invoice.dueDate"),
    PrivateNote: optionalString(invoice.note, "invoice.note", 4000),
    Line: invoice.lines.map((line, index) => {
      if (!line || typeof line !== "object") {
        throw new QuickBooksError(`invoice.lines[${index}] must be an object`, {
          code: "INVALID_INPUT",
        });
      }
      const quantity = boundedNumber(line.quantity ?? line.qty ?? 1, `invoice.lines[${index}].quantity`);
      const unitPrice = boundedNumber(line.unitPrice, `invoice.lines[${index}].unitPrice`);
      const amount = boundedNumber(
        line.amount ?? quantity * unitPrice,
        `invoice.lines[${index}].amount`,
      );
      return compact({
        Amount: amount,
        DetailType: "SalesItemLineDetail",
        Description: optionalString(line.description, `invoice.lines[${index}].description`, 4000),
        SalesItemLineDetail: compact({
          ItemRef: line.quickBooksItemId
            ? {
                value: requiredString(
                  line.quickBooksItemId,
                  `invoice.lines[${index}].quickBooksItemId`,
                  255,
                ),
              }
            : undefined,
          Qty: quantity,
          UnitPrice: unitPrice,
        }),
      });
    }),
  });
}

export function normalizeQuickBooksPayment(payment) {
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) {
    throw new QuickBooksError("payment must be an object", { code: "INVALID_INPUT" });
  }
  const invoiceId = optionalString(
    payment.quickBooksInvoiceId || payment.invoiceId,
    "payment.quickBooksInvoiceId",
    255,
  );
  return compact({
    CustomerRef: {
      value: requiredString(
        payment.quickBooksCustomerId || payment.customerId,
        "payment.quickBooksCustomerId",
        255,
      ),
    },
    TotalAmt: boundedNumber(payment.amount ?? payment.totalAmount, "payment.amount"),
    TxnDate: isoDate(payment.date || payment.txnDate, "payment.date"),
    PaymentRefNum: optionalString(payment.reference || payment.paymentRefNum, "payment.reference", 21),
    PrivateNote: optionalString(payment.note, "payment.note", 4000),
    Line: invoiceId
      ? [
          {
            Amount: boundedNumber(payment.amount ?? payment.totalAmount, "payment.amount"),
            LinkedTxn: [{ TxnId: invoiceId, TxnType: "Invoice" }],
          },
        ]
      : undefined,
  });
}

export function createQuickBooksIntegration({
  env = {},
  fetch: fetchImpl = globalThis.fetch,
  crypto: cryptoImpl = globalThis.crypto,
  loadTokens,
  saveTokens,
  saveState,
  loadState,
  deleteState,
  saveSyncMetadata,
  now = () => Date.now(),
  stateTtlMs = DEFAULT_STATE_TTL_MS,
} = {}) {
  async function tokenRequest(parameters, previous, realmId) {
    const config = resolveConfig(env);
    assertFunction(fetchImpl, "fetch");
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: basicAuthorization(config.clientId, config.clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(parameters),
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw new QuickBooksError(`QuickBooks token request failed (${response.status})`, {
        code: "QUICKBOOKS_TOKEN_ERROR",
        status: response.status,
      });
    }
    const tokens = normalizeTokenResponse(data, previous, realmId, now());
    await assertFunction(saveTokens, "saveTokens")({ ...tokens });
    return tokens;
  }

  async function getAuthorizationUrl({ state: suppliedState } = {}) {
    const config = resolveConfig(env);
    const persistState = assertFunction(saveState, "saveState");
    if (
      !cryptoImpl ||
      typeof cryptoImpl.getRandomValues !== "function" ||
      typeof cryptoImpl.subtle?.digest !== "function"
    ) {
      throw new QuickBooksError("Web Crypto is required for OAuth state and PKCE", {
        code: "QUICKBOOKS_UNCONFIGURED",
      });
    }
    const state = suppliedState
      ? requiredString(suppliedState, "state", 512)
      : randomBase64Url(cryptoImpl, 32);
    const codeVerifier = randomBase64Url(cryptoImpl, 64);
    const codeChallenge = await sha256Base64Url(cryptoImpl, codeVerifier);
    await persistState(state, {
      codeVerifier,
      createdAt: now(),
      redirectUri: config.redirectUri,
    });
    const url = new URL(AUTHORIZATION_URL);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      scope: ACCOUNTING_SCOPE,
      redirect_uri: config.redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return { authorizationUrl: url.toString(), state };
  }

  async function exchangeCallback(callback) {
    const config = resolveConfig(env);
    const values = callbackValues(callback);
    if (values.error) {
      throw new QuickBooksError("QuickBooks authorization was denied", {
        code: "QUICKBOOKS_AUTH_DENIED",
      });
    }
    const state = requiredString(values.state, "OAuth state", 512);
    const persisted = await assertFunction(loadState, "loadState")(state);
    if (
      !persisted ||
      typeof persisted !== "object" ||
      !Number.isFinite(persisted.createdAt) ||
      now() - persisted.createdAt < 0 ||
      now() - persisted.createdAt > stateTtlMs
    ) {
      throw new QuickBooksError("OAuth state is invalid or expired", {
        code: "QUICKBOOKS_INVALID_STATE",
      });
    }
    if (persisted.redirectUri && persisted.redirectUri !== config.redirectUri) {
      throw new QuickBooksError("OAuth redirect URI does not match the saved state", {
        code: "QUICKBOOKS_INVALID_STATE",
      });
    }
    if (deleteState) await deleteState(state);
    const parameters = {
      grant_type: "authorization_code",
      code: requiredString(values.code, "authorization code", 4096),
      redirect_uri: config.redirectUri,
    };
    if (persisted.codeVerifier) {
      parameters.code_verifier = requiredString(persisted.codeVerifier, "PKCE verifier", 512);
    }
    const tokens = await tokenRequest(
      parameters,
      undefined,
      requiredString(values.realmId, "QuickBooks realmId", 255),
    );
    return tokenMetadata(tokens);
  }

  async function refreshTokens(existingTokens) {
    const existing =
      existingTokens || (await assertFunction(loadTokens, "loadTokens")());
    if (!existing || typeof existing !== "object") {
      throw new QuickBooksError("QuickBooks is not connected", {
        code: "QUICKBOOKS_NOT_CONNECTED",
      });
    }
    const refreshToken = requiredString(
      existing.refreshToken,
      "stored QuickBooks refresh token",
      8192,
    );
    const tokens = await tokenRequest(
      { grant_type: "refresh_token", refresh_token: refreshToken },
      existing,
      existing.realmId,
    );
    return tokenMetadata(tokens);
  }

  async function usableTokens(forceRefresh = false) {
    const existing = await assertFunction(loadTokens, "loadTokens")();
    if (!existing || typeof existing !== "object") {
      throw new QuickBooksError("QuickBooks is not connected", {
        code: "QUICKBOOKS_NOT_CONNECTED",
      });
    }
    if (
      forceRefresh ||
      !existing.accessToken ||
      !Number.isFinite(existing.expiresAt) ||
      existing.expiresAt <= now() + EXPIRY_SKEW_MS
    ) {
      await refreshTokens(existing);
      const refreshed = await loadTokens();
      if (!refreshed?.accessToken) {
        throw new QuickBooksError("Saved QuickBooks tokens could not be loaded", {
          code: "QUICKBOOKS_TOKEN_ERROR",
        });
      }
      return refreshed;
    }
    return existing;
  }

  async function qboCreate(entityName, payload) {
    const config = resolveConfig(env);
    assertFunction(fetchImpl, "fetch");
    let tokens = await usableTokens();
    const request = async () => {
      const realmId = requiredString(tokens.realmId, "stored QuickBooks realmId", 255);
      const url = new URL(
        `/v3/company/${encodeURIComponent(realmId)}/${entityName}`,
        config.apiBaseUrl,
      );
      url.searchParams.set("minorversion", "75");
      return fetchImpl(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${requiredString(tokens.accessToken, "stored access token", 8192)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    };
    let response = await request();
    if (response.status === 401) {
      await refreshTokens(tokens);
      tokens = await loadTokens();
      response = await request();
    }
    const data = await readJson(response);
    if (!response.ok) throw apiError(data, response.status);
    return { data, realmId: tokens.realmId };
  }

  async function sync(type, localId, payload, responseKey) {
    const { data, realmId } = await qboCreate(type.toLowerCase(), payload);
    const remote = data?.[responseKey];
    const quickBooksId = requiredString(remote?.Id, `QuickBooks ${type} ID`, 255);
    const metadata = {
      provider: "quickbooks",
      entityType: type.toLowerCase(),
      localId: optionalString(localId, "localId", 255),
      quickBooksId,
      realmId,
      syncedAt: new Date(now()).toISOString(),
    };
    if (saveSyncMetadata) await saveSyncMetadata({ ...metadata });
    return { entity: remote, syncMetadata: metadata };
  }

  return Object.freeze({
    getAuthorizationUrl,
    exchangeCallback,
    refreshTokens,
    syncCustomer: (customer) =>
      sync("Customer", customer?.id, normalizeQuickBooksCustomer(customer), "Customer"),
    syncInvoice: (invoice) =>
      sync("Invoice", invoice?.id, normalizeQuickBooksInvoice(invoice), "Invoice"),
    syncPayment: (payment) =>
      sync("Payment", payment?.id, normalizeQuickBooksPayment(payment), "Payment"),
  });
}

export const QUICKBOOKS_ENDPOINTS = Object.freeze({
  authorization: AUTHORIZATION_URL,
  token: TOKEN_URL,
  ...API_BASE_URLS,
});
