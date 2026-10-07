export function customerLifetimeSpend(customer, invoices = []) {
  const linked = invoices.filter(invoice => invoice.customer === customer?.name);
  if (!linked.length) return Number(customer?.spend || 0);
  return Math.round(linked.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0) * 100) / 100;
}
