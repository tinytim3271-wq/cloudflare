import test from "node:test";
import assert from "node:assert/strict";
import {
  cardPresentPaymentIntentBody,
  dollarsToCents,
  phonePaymentIntentBody,
  rejectRawCardFields,
  stripeKeyMode,
  terminalChargeState,
  terminalPaymentRecord,
} from "../src/terminal.mjs";
import { HttpError } from "../src/http.mjs";
import { recoveryWriteup } from "../../src/modules/card-terminal.js";

test("card-present charges use the Terminal payment method and keep identity in metadata", () => {
  const body = cardPresentPaymentIntentBody({
    amountCents: 12500,
    shopId: "reliable-auto",
    targetType: "work_order",
    targetId: "RO-1100",
    customer: "James Holt",
    vehicle: "2014 Ford F-150",
  });
  assert.equal(body.get("amount"), "12500");
  assert.equal(body.get("currency"), "usd");
  assert.equal(body.get("capture_method"), "automatic");
  assert.deepEqual(body.getAll("allowed_payment_method_types[]"), ["card_present"]);
  assert.equal(body.get("payment_method_types[]"), null);
  assert.equal(body.get("metadata[customer]"), "James Holt");
  assert.equal(body.get("metadata[vehicle]"), "2014 Ford F-150");
  assert.equal(body.get("metadata[source]"), "terminal");
});

test("card amounts below fifty cents are refused", () => {
  assert.equal(dollarsToCents(0.49), null);
  assert.equal(dollarsToCents(86.4), 8640);
});

test("reader and payment intent status tell the counter what to do next", () => {
  assert.equal(terminalChargeState({
    reader: { action: { status: "in_progress" } },
    paymentIntent: { status: "requires_payment_method" },
  }).phase, "waiting");
  assert.equal(terminalChargeState({
    reader: { action: { status: "failed", failure_message: "Card declined" } },
    paymentIntent: { status: "requires_payment_method" },
  }).message, "Card declined");
  assert.equal(terminalChargeState({
    paymentIntent: { status: "succeeded" },
  }).phase, "paid");
});

test("a succeeded terminal payment can be recorded once for the same shop", () => {
  const record = terminalPaymentRecord({
    id: "pi_123",
    object: "payment_intent",
    status: "succeeded",
    currency: "usd",
    amount_received: 8640,
    metadata: { source: "terminal", shopId: "reliable-auto", targetType: "work_order", targetId: "RO-1100" },
  }, "reliable-auto");
  assert.equal(record.paymentId, "pi_123");
  assert.equal(record.body.amount, 86.4);
  assert.equal(record.body.method, "card");
  assert.equal(terminalPaymentRecord({
    object: "payment_intent",
    status: "succeeded",
    currency: "usd",
    amount_received: 100,
    metadata: { source: "terminal", shopId: "other", targetType: "work_order", targetId: "RO-1" },
  }, "reliable-auto"), null);
});

test("phone charges are keyed as card payments and never accept a raw card number", () => {
  const body = phonePaymentIntentBody({
    amountCents: 5000,
    shopId: "reliable-auto",
    targetType: "work_order",
    targetId: "RO-1100",
    customer: "Pat Lee",
    vehicle: "2012 Silverado",
  });
  assert.equal(body.get("metadata[source]"), "phone");
  assert.equal(body.get("payment_method_options[card][moto]"), "true");
  assert.deepEqual(body.getAll("allowed_payment_method_types[]"), ["card"]);
  assert.equal(body.get("payment_method_types[]"), null);
  assert.equal(stripeKeyMode("pk_live_abc"), "live");
  assert.equal(stripeKeyMode("sk_test_abc"), "test");
  assert.throws(() => rejectRawCardFields({ number: "4242424242424242" }), error => error instanceof HttpError && error.status === 400);
  assert.doesNotThrow(() => rejectRawCardFields({ amount: 50, targetId: "RO-1100", targetType: "work_order" }));
});

test("a succeeded phone payment records as a card payment for that shop", () => {
  const record = terminalPaymentRecord({
    id: "pi_phone",
    object: "payment_intent",
    status: "succeeded",
    currency: "usd",
    amount_received: 5000,
    metadata: { source: "phone", shopId: "reliable-auto", targetType: "work_order", targetId: "RO-1100" },
  }, "reliable-auto");
  assert.equal(record.body.note, "Phone card payment");
  assert.equal(record.body.amount, 50);
});

test("the mud recovery write-up names the customer and vehicle from the work order", () => {
  const blank = recoveryWriteup({});
  assert.equal(blank.ready, false);
  assert.deepEqual(blank.missing, ["customer", "vehicle"]);
  const written = recoveryWriteup({ customer: "James Holt", vehicle: "2014 Ford F-150" });
  assert.equal(written.ready, true);
  assert.match(written.text, /James Holt/);
  assert.match(written.text, /2014 Ford F-150/);
  assert.match(written.text, /solid anchor/);
  assert.match(written.text, /No undercarriage damage/);
});
