const roundMoney = value => Math.round((Number(value) || 0) * 100) / 100;

export function paymentMatchesTarget(payment, targetType, targetId, linkedTargetId = "") {
  if (!payment || payment.status !== "completed") return false;
  if (targetType === "invoice") {
    return payment.invoiceNumber === targetId
      || (payment.targetType === "invoice" && payment.targetId === targetId)
      || (linkedTargetId && payment.workOrderId === linkedTargetId);
  }
  return payment.workOrderId === targetId
    || (payment.targetType === "work_order" && payment.targetId === targetId)
    || (linkedTargetId && payment.invoiceNumber === linkedTargetId);
}

export function paymentsForTarget(payments, targetType, targetId, linkedTargetId = "") {
  return (payments || [])
    .filter(payment => paymentMatchesTarget(payment, targetType, targetId, linkedTargetId))
    .sort((left, right) => String(right.receivedAt || "").localeCompare(String(left.receivedAt || "")));
}

export function paymentSummary(total, payments, {
  targetType,
  targetId,
  linkedTargetId = "",
  legacyPaid = false,
} = {}) {
  const history = paymentsForTarget(payments, targetType, targetId, linkedTargetId);
  const recordedPaid = roundMoney(history.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const amount = roundMoney(total);
  const paid = legacyPaid && recordedPaid === 0 ? amount : Math.min(amount, recordedPaid);
  const balance = roundMoney(Math.max(0, amount - paid));
  const status = balance === 0 && amount > 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
  return { total: amount, paid, balance, status, history };
}
