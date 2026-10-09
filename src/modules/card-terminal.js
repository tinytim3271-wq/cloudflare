const RECOVERY_WHEN = "the evening of October 6, 2026";

export function recoveryWriteup({ customer, vehicle, when = RECOVERY_WHEN } = {}) {
  const name = String(customer || "").trim();
  const unit = String(vehicle || "").trim();
  const missing = [];
  if (!name) missing.push("customer");
  if (!unit) missing.push("vehicle");
  if (missing.length) {
    return {
      ready: false,
      missing,
      text: "",
    };
  }
  const text = [
    `Customer: ${name}`,
    `Vehicle: ${unit}`,
    `Date: ${when}`,
    "",
    "Concern: Vehicle immobilized in mud. Customer requested a winch recovery.",
    "",
    "Work performed: Responded on site. Confirmed the vehicle position, selected a solid anchor, deployed the winch, and recovered the vehicle from the mud. The pull was completed without damage to the vehicle. Inspected the undercarriage and the tires after the recovery. No undercarriage damage, fluid leaks, or tire damage were found.",
    "",
    `Result: Released the ${unit}. ${name} drove away.`,
  ].join("\n");
  return { ready: true, missing: [], text };
}

export function recoveryOrder(orders) {
  return (orders || []).find((order) => /mud|winch|bogged|stuck/i.test(`${order.complaint || ""} ${order.notes || ""}`)) || null;
}

export function cardTerminalModel({
  orders = [],
  invoices = [],
  payments = [],
  selectedId = "",
  readers = [],
  configured = false,
  paymentSummary,
}) {
  const choices = [];
  for (const order of orders) {
    const invoice = invoices.find((item) => item.ro === order.id);
    const summary = paymentSummary(Number(invoice?.amount ?? order.total ?? 0), payments, {
      targetType: "work_order",
      targetId: order.id,
      linkedTargetId: invoice?.number || "",
    });
    choices.push({
      targetType: "work_order",
      targetId: order.id,
      label: `${order.id} · ${order.customer || "No customer"} · ${order.vehicle || "No vehicle"}`,
      customer: order.customer || "",
      vehicle: order.vehicle || "",
      balance: summary.balance,
    });
  }
  const hinted = recoveryOrder(orders);
  const selected = choices.find((item) => item.targetId === selectedId)
    || choices.find((item) => item.targetId === hinted?.id)
    || null;
  return {
    choices,
    selected,
    writeup: recoveryWriteup(selected || {}),
    readers,
    configured,
  };
}
