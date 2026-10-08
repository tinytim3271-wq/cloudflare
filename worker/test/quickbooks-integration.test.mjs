import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createQuickBooksIntegration,
  normalizeQuickBooksCustomer,
  normalizeQuickBooksInvoice,
  normalizeQuickBooksPayment,
} from "../src/integrations/quickbooks.mjs";

const ENV = Object.freeze({
  INTUIT_CLIENT_ID: "client-id",
  INTUIT_CLIENT_SECRET: "client-secret",
  INTUIT_REDIRECT_URI: "https://app.example.test/oauth/quickbooks/callback",
  INTUIT_ENVIRONMENT: "sandbox",
});

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stores(initialTokens) {
  let tokens = initialTokens;
  const states = new Map();
  const metadata = [];
  return {
    loadTokens: async () => tokens,
    saveTokens: async (next) => {
      tokens = next;
    },
    saveState: async (key, value) => states.set(key, value),
    loadState: async (key) => states.get(key),
    deleteState: async (key) => states.delete(key),
    saveSyncMetadata: async (value) => metadata.push(value),
    get tokens() {
      return tokens;
    },
    states,
    metadata,
  };
}

test("authorization URL persists state and a PKCE verifier without exposing secrets", async () => {
  const storage = stores();
  const client = createQuickBooksIntegration({
    env: ENV,
    ...storage,
    now: () => 1_000,
  });

  const result = await client.getAuthorizationUrl({ state: "state-123" });
  const url = new URL(result.authorizationUrl);
  const persisted = storage.states.get("state-123");

  assert.equal(result.state, "state-123");
  assert.equal(url.origin + url.pathname, "https://appcenter.intuit.com/connect/oauth2");
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("redirect_uri"), ENV.INTUIT_REDIRECT_URI);
  assert.equal(url.searchParams.get("scope"), "com.intuit.quickbooks.accounting");
  assert.equal(url.searchParams.get("state"), "state-123");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.ok(persisted.codeVerifier);
  assert.equal(persisted.createdAt, 1_000);
  assert.doesNotMatch(result.authorizationUrl, /client-secret/u);
  assert.equal("codeVerifier" in result, false);
});

test("callback exchanges code, consumes state, stores realm and tokens, and returns safe metadata", async () => {
  const storage = stores();
  storage.states.set("valid-state", {
    codeVerifier: "pkce-verifier",
    createdAt: 10_000,
    redirectUri: ENV.INTUIT_REDIRECT_URI,
  });
  let tokenRequest;
  const client = createQuickBooksIntegration({
    env: ENV,
    ...storage,
    now: () => 11_000,
    fetch: async (url, init) => {
      tokenRequest = { url: String(url), init };
      return jsonResponse({
        access_token: "access-one",
        refresh_token: "refresh-one",
        expires_in: 3600,
        x_refresh_token_expires_in: 8_640_000,
        token_type: "bearer",
      });
    },
  });

  const metadata = await client.exchangeCallback({
    code: "authorization-code",
    state: "valid-state",
    realmId: "company-42",
  });
  const body = new URLSearchParams(tokenRequest.init.body);

  assert.equal(tokenRequest.url, "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer");
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "authorization-code");
  assert.equal(body.get("code_verifier"), "pkce-verifier");
  assert.equal(storage.states.has("valid-state"), false);
  assert.equal(storage.tokens.refreshToken, "refresh-one");
  assert.equal(storage.tokens.realmId, "company-42");
  assert.deepEqual(metadata, {
    realmId: "company-42",
    expiresAt: 3_611_000,
    refreshExpiresAt: 8_640_011_000,
  });
  assert.equal("refreshToken" in metadata, false);
  assert.doesNotMatch(JSON.stringify(metadata), /refresh-one|client-secret/u);
});

test("refresh rotates stored tokens but never returns the refresh token", async () => {
  const storage = stores({
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: 1,
    realmId: "realm-1",
  });
  let requestBody;
  const client = createQuickBooksIntegration({
    env: ENV,
    ...storage,
    now: () => 50_000,
    fetch: async (_url, init) => {
      requestBody = new URLSearchParams(init.body);
      return jsonResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 1800,
      });
    },
  });

  const metadata = await client.refreshTokens();

  assert.equal(requestBody.get("grant_type"), "refresh_token");
  assert.equal(requestBody.get("refresh_token"), "old-refresh");
  assert.equal(storage.tokens.accessToken, "new-access");
  assert.equal(storage.tokens.refreshToken, "new-refresh");
  assert.equal(metadata.realmId, "realm-1");
  assert.equal("refreshToken" in metadata, false);
});

test("normalizers produce explicit bounded QBO payloads", () => {
  assert.deepEqual(
    normalizeQuickBooksCustomer({
      displayName: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.test",
      phone: "555-0100",
      billingAddress: { line1: "1 Engine Way", city: "London", postalCode: "N1" },
    }),
    {
      DisplayName: "Ada Lovelace",
      GivenName: "Ada",
      FamilyName: "Lovelace",
      PrimaryEmailAddr: { Address: "ada@example.test" },
      PrimaryPhone: { FreeFormNumber: "555-0100" },
      BillAddr: { Line1: "1 Engine Way", City: "London", PostalCode: "N1" },
    },
  );
  assert.deepEqual(
    normalizeQuickBooksInvoice({
      quickBooksCustomerId: "qbo-customer-1",
      number: "INV-7",
      date: "2026-10-08",
      lines: [
        {
          description: "Brake service",
          quantity: 2,
          unitPrice: 40,
          quickBooksItemId: "item-9",
        },
      ],
    }),
    {
      CustomerRef: { value: "qbo-customer-1" },
      DocNumber: "INV-7",
      TxnDate: "2026-10-08",
      Line: [
        {
          Amount: 80,
          DetailType: "SalesItemLineDetail",
          Description: "Brake service",
          SalesItemLineDetail: {
            ItemRef: { value: "item-9" },
            Qty: 2,
            UnitPrice: 40,
          },
        },
      ],
    },
  );
  assert.deepEqual(
    normalizeQuickBooksPayment({
      quickBooksCustomerId: "qbo-customer-1",
      quickBooksInvoiceId: "qbo-invoice-2",
      amount: 80,
      reference: "CARD-7",
    }),
    {
      CustomerRef: { value: "qbo-customer-1" },
      TotalAmt: 80,
      PaymentRefNum: "CARD-7",
      Line: [
        {
          Amount: 80,
          LinkedTxn: [{ TxnId: "qbo-invoice-2", TxnType: "Invoice" }],
        },
      ],
    },
  );
  assert.throws(
    () => normalizeQuickBooksCustomer({ displayName: "x".repeat(501) }),
    /exceeds 500 characters/u,
  );
});

test("sync methods use sandbox endpoints, normalized payloads, and persist QBO IDs", async () => {
  const storage = stores({
    accessToken: "access",
    refreshToken: "refresh",
    expiresAt: 9_999_999,
    realmId: "realm 7",
  });
  const requests = [];
  const responses = [
    { Customer: { Id: "c-1", DisplayName: "Shop Customer" } },
    { Invoice: { Id: "i-2", DocNumber: "INV-2" } },
    { Payment: { Id: "p-3", TotalAmt: 25 } },
  ];
  const client = createQuickBooksIntegration({
    env: ENV,
    ...storage,
    now: () => 100_000,
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse(responses.shift());
    },
  });

  const customer = await client.syncCustomer({ id: "local-c", displayName: "Shop Customer" });
  const invoice = await client.syncInvoice({
    id: "local-i",
    quickBooksCustomerId: "c-1",
    lines: [{ description: "Labor", quantity: 1, unitPrice: 25 }],
  });
  const payment = await client.syncPayment({
    id: "local-p",
    quickBooksCustomerId: "c-1",
    quickBooksInvoiceId: "i-2",
    amount: 25,
  });

  assert.match(
    requests[0].url,
    /^https:\/\/sandbox-quickbooks\.api\.intuit\.com\/v3\/company\/realm%207\/customer\?/u,
  );
  assert.deepEqual(JSON.parse(requests[0].init.body), { DisplayName: "Shop Customer" });
  assert.equal(JSON.parse(requests[1].init.body).CustomerRef.value, "c-1");
  assert.equal(JSON.parse(requests[2].init.body).Line[0].LinkedTxn[0].TxnId, "i-2");
  assert.equal(customer.syncMetadata.quickBooksId, "c-1");
  assert.equal(invoice.syncMetadata.quickBooksId, "i-2");
  assert.equal(payment.syncMetadata.quickBooksId, "p-3");
  assert.deepEqual(
    storage.metadata.map(({ quickBooksId }) => quickBooksId),
    ["c-1", "i-2", "p-3"],
  );
});

test("sync refreshes expired access and retries exactly once after a 401", async () => {
  const storage = stores({
    accessToken: "expired",
    refreshToken: "refresh-1",
    expiresAt: 1,
    realmId: "realm-1",
  });
  const calls = [];
  let refreshNumber = 0;
  const client = createQuickBooksIntegration({
    env: ENV,
    ...storage,
    now: () => 1_000_000,
    fetch: async (url, init) => {
      calls.push({ url: String(url), authorization: init.headers.Authorization });
      if (String(url).includes("/tokens/bearer")) {
        refreshNumber += 1;
        return jsonResponse({
          access_token: `access-${refreshNumber}`,
          refresh_token: `refresh-${refreshNumber + 1}`,
          expires_in: 3600,
        });
      }
      if (calls.filter((call) => call.url.includes("/customer")).length === 1) {
        return jsonResponse({ Fault: {} }, 401);
      }
      return jsonResponse({ Customer: { Id: "qbo-customer" } });
    },
  });

  const result = await client.syncCustomer({ id: "local-1", displayName: "Retry Customer" });
  const apiCalls = calls.filter((call) => call.url.includes("/customer"));

  assert.equal(refreshNumber, 2);
  assert.equal(apiCalls.length, 2);
  assert.equal(apiCalls[0].authorization, "Bearer access-1");
  assert.equal(apiCalls[1].authorization, "Bearer access-2");
  assert.equal(result.syncMetadata.quickBooksId, "qbo-customer");
});

test("unconfigured integration fails safely without leaking configuration values", async () => {
  const client = createQuickBooksIntegration({
    env: {},
    fetch: async () => {
      throw new Error("fetch should not be called");
    },
  });

  await assert.rejects(
    client.getAuthorizationUrl(),
    (error) =>
      error.code === "INVALID_INPUT" &&
      /INTUIT_CLIENT_ID is required/u.test(error.message) &&
      !error.message.includes("secret"),
  );
});
