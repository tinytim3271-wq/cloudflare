import test from "node:test";
import assert from "node:assert/strict";
import { paymentSummary, paymentsForTarget } from "./payments.js";

const payments = [
  {
    id: "pay-1",
    invoiceNumber: "INV-1",
    workOrderId: "RO-1",
    amount: 25,
    receivedAt: "2026-10-05T14:00:00.000Z",
    status: "completed",
  },
  {
    id: "pay-2",
    targetType: "work_order",
    targetId: "RO-1",
    workOrderId: "RO-1",
    amount: 15,
    receivedAt: "2026-10-06T14:00:00.000Z",
    status: "completed",
  },
  {
    id: "pay-pending",
    invoiceNumber: "INV-1",
    workOrderId: "RO-1",
    amount: 20,
    status: "pending",
  },
];

test("partial invoice payments produce paid and remaining balances", () => {
  assert.deepEqual(paymentSummary(100, payments, {
    targetType: "invoice",
    targetId: "INV-1",
  }), {
    total: 100,
    paid: 25,
    balance: 75,
    status: "partial",
    history: [payments[0]],
  });
});

test("work order history includes payments recorded through its linked invoice", () => {
  assert.deepEqual(
    paymentsForTarget(payments, "work_order", "RO-1", "INV-1").map(payment => payment.id),
    ["pay-2", "pay-1"],
  );
  assert.equal(paymentSummary(40, payments, {
    targetType: "work_order",
    targetId: "RO-1",
    linkedTargetId: "INV-1",
  }).status, "paid");
});

test("legacy paid invoices remain fully collected without duplicate history", () => {
  const summary = paymentSummary(80, [], {
    targetType: "invoice",
    targetId: "INV-legacy",
    legacyPaid: true,
  });
  assert.deepEqual(summary, {
    total: 80,
    paid: 80,
    balance: 0,
    status: "paid",
    history: [],
  });
});
