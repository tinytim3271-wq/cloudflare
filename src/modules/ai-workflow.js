import { applyMileageToOrder } from './mileage.js';

export function applyAiWorkflowEstimate(order, estimate, { rate, taxRate } = {}) {
  order.estimate = estimate;
  order.laborHours = estimate.lines.reduce((sum, line) => sum + line.hours, 0);
  order.labor = estimate.lines.reduce((sum, line) => sum + line.labor, 0);
  order.parts = estimate.lines.reduce((sum, line) => sum + line.parts, 0);
  order.total = estimate.total;
  if (Number(order.tripMilesOneWay) > 0) {
    Object.assign(order, applyMileageToOrder(order, {
      oneWayMiles: order.tripMilesOneWay,
      rate,
      taxRate,
    }));
  }
  return order;
}

export function stopMediaCapture(recorder, stream) {
  if (recorder?.state === 'recording') recorder.stop();
  stream?.getTracks?.().forEach(track => track.stop());
}
