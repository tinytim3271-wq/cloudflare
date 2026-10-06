import test from "node:test";
import assert from "node:assert/strict";
import { normalizePaymentInput, paymentStatus } from "../src/payments.mjs";
import { HttpError } from "../src/http.mjs";

test("payment status distinguishes unpaid, partial, and paid balances", () => {
  assert.deepEqual(paymentStatus(100, 0), { total: 100, paid: 0, balance: 100, status: "unpaid" });
  assert.deepEqual(paymentStatus(100, 35.25), { total: 100, paid: 35.25, balance: 64.75, status: "partial" });
  assert.deepEqual(paymentStatus(100, 100), { total: 100, paid: 100, balance: 0, status: "paid" });
});

test("payment input keeps method, timestamp, reference, and notes", () => {
  assert.deepEqual(normalizePaymentInput({
    targetType: "work_order",
    targetId: "RO-1048",
    amount: "25.50",
    method: "check",
    receivedAt: "2026-10-06T09:30:00.000Z",
    reference: "CHK-88",
    note: "Customer deposit",
  }), {
    targetType: "work_order",
    targetId: "RO-1048",
    amount: 25.5,
    method: "check",
    receivedAt: "2026-10-06T09:30:00.000Z",
    reference: "CHK-88",
    note: "Customer deposit",
  });
});

test("payment input rejects invalid targets, methods, and amounts", () => {
  assert.throws(() => normalizePaymentInput({
    targetType: "estimate",
    targetId: "EST-1",
    amount: 10,
    method: "cash",
  }), error => error instanceof HttpError && error.status === 400);
  assert.throws(() => normalizePaymentInput({
    targetType: "invoice",
    targetId: "INV-1",
    amount: 0,
    method: "cash",
  }), error => error instanceof HttpError && error.status === 400);
  assert.throws(() => normalizePaymentInput({
    targetType: "invoice",
    targetId: "INV-1",
    amount: 10,
    method: "crypto",
  }), error => error instanceof HttpError && error.status === 400);
});
