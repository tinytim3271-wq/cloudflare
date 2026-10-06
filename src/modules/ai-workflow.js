export function applyAiWorkflowEstimate(order, estimate) {
  order.estimate = estimate;
  order.laborHours = estimate.lines.reduce((sum, line) => sum + line.hours, 0);
  order.labor = estimate.lines.reduce((sum, line) => sum + line.labor, 0);
  order.parts = estimate.lines.reduce((sum, line) => sum + line.parts, 0);
  order.total = estimate.total;
  return order;
}
