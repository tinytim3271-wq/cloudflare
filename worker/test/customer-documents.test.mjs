import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCustomerDocumentLink,
  handleCustomerDocument,
} from '../src/customer-documents.mjs';

function mockEnvironment() {
  const entities = new Map();
  const links = [];
  const files = new Map();
  const key = (shopId, type, id) => `${shopId}:${type}:${id}`;
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (/FROM entities/i.test(sql)) {
                const record = entities.get(key(args[0], args[1], args[2]));
                return record ? { data_json: JSON.stringify(record), created_by: 'writer-1', created_at: record.createdAt } : null;
              }
              if (/FROM customer_document_links/i.test(sql)) {
                return links.find(link => link.token_hash === args[0]) || null;
              }
              return null;
            },
            async run() {
              if (/INSERT INTO customer_document_links/i.test(sql)) {
                links.push({
                  id: args[0],
                  token_hash: args[1],
                  shop_id: args[2],
                  document_type: args[3],
                  document_id: args[4],
                  expires_at: args[5],
                  created_at: args[6],
                  created_by: args[7],
                  consumed_at: null,
                  result: null,
                });
              } else if (/UPDATE entities SET/i.test(sql)) {
                entities.set(key(args[2], args[3], args[4]), JSON.parse(args[0]));
              } else if (/UPDATE customer_document_links SET/i.test(sql)) {
                const link = links.find(item => item.id === args[2]);
                if (link && !link.consumed_at) Object.assign(link, { consumed_at: args[0], result: args[1] });
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
  return {
    env: {
      DB,
      FILES: {
        async put(objectKey, body, options) {
          files.set(objectKey, { body, options });
        },
      },
    },
    entities,
    links,
    files,
    key,
  };
}

const context = {
  shopId: 'shop-1',
  userId: 'writer-1',
  role: 'service_writer',
};

function estimateOrder() {
  return {
    id: 'RO-1100',
    customer: 'Pat Customer',
    vehicle: '2020 Example Sedan',
    status: 'estimate',
    total: 265,
    createdAt: '2026-10-02T10:00:00.000Z',
    estimate: {
      taxRate: 0,
      fees: [],
      lines: [
        { id: 'labor', type: 'labor', description: 'Diagnosis', hours: 1, laborRate: 165 },
        { id: 'part', type: 'part', description: 'Recommended sensor', quantity: 1, unitPrice: 100 },
      ],
    },
  };
}

async function issueLink(fixture, documentType, documentId) {
  const request = new Request('https://mechpro.test/api/document-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentType, documentId }),
  });
  const response = await createCustomerDocumentLink(request, fixture.env, context);
  assert.equal(response.status, 201);
  return response.json();
}

test('public estimate link renders itemized parts and labor without authentication', async () => {
  const fixture = mockEnvironment();
  fixture.entities.set(fixture.key('shop-1', 'orders', 'RO-1100'), estimateOrder());
  const link = await issueLink(fixture, 'estimate', 'RO-1100');
  const token = new URL(link.url).pathname.split('/').pop();

  const response = await handleCustomerDocument(
    new Request(link.url),
    fixture.env,
    token,
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Diagnosis/);
  assert.match(html, /Recommended sensor/);
  assert.match(html, /Sign &amp; approve selected work|Sign & approve selected work/);
  assert.match(response.headers.get('Content-Security-Policy'), /script-src 'nonce-/);
});

test('remote estimate signature approves selected lines, locks them, and stores PNG in R2', async () => {
  const fixture = mockEnvironment();
  fixture.entities.set(fixture.key('shop-1', 'orders', 'RO-1100'), estimateOrder());
  const link = await issueLink(fixture, 'estimate', 'RO-1100');
  const token = new URL(link.url).pathname.split('/').pop();
  const signatureDataUrl = `data:image/png;base64,${Buffer.from('png-signature').toString('base64')}`;

  const response = await handleCustomerDocument(new Request(link.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'sign',
      authorizationName: 'Pat Customer',
      signatureDataUrl,
      decisions: { labor: 'approved', part: 'declined' },
    }),
  }), fixture.env, token);

  assert.equal(response.status, 200);
  const saved = fixture.entities.get(fixture.key('shop-1', 'orders', 'RO-1100'));
  assert.equal(saved.status, 'approved');
  assert.equal(saved.estimateApproval.status, 'approved');
  assert.equal(saved.estimateApproval.authorizationName, 'Pat Customer');
  assert.equal(saved.estimate.lines.find(line => line.id === 'part').approvalStatus, 'declined');
  assert.equal(saved.total, 165);
  assert.ok(saved.linesLockedAt);
  assert.equal(fixture.files.size, 1);
  assert.equal(fixture.links[0].result, 'approved');
});

test('invoice uses the same one-time mobile signature route', async () => {
  const fixture = mockEnvironment();
  fixture.entities.set(fixture.key('shop-1', 'invoices', 'INV-1100'), {
    id: 'INV-1100',
    number: 'INV-1100',
    ro: 'RO-1100',
    customer: 'Pat Customer',
    vehicle: '2020 Example Sedan',
    subtotal: 165,
    tax: 0,
    amount: 165,
    lines: [{ id: 'labor', type: 'labor', description: 'Diagnosis', hours: 1, laborRate: 165 }],
    createdAt: '2026-10-02T10:00:00.000Z',
  });
  const link = await issueLink(fixture, 'invoice', 'INV-1100');
  const token = new URL(link.url).pathname.split('/').pop();
  const response = await handleCustomerDocument(new Request(link.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'sign',
      authorizationName: 'Pat Customer',
      signatureDataUrl: `data:image/png;base64,${Buffer.from('invoice-signature').toString('base64')}`,
    }),
  }), fixture.env, token);

  assert.equal(response.status, 200);
  const invoice = fixture.entities.get(fixture.key('shop-1', 'invoices', 'INV-1100'));
  assert.equal(invoice.signature.authorizationName, 'Pat Customer');
  assert.equal(invoice.signature.source, 'remote');
  assert.equal(fixture.links[0].result, 'signed');
});
