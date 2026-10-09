const ROLES = ['primary', 'secondary', 'apprentice'];

export const EMPLOYEE_CLASSIFICATIONS = [
  { id: 'technician', label: 'Technician' },
  { id: 'service_writer', label: 'Service Writer' },
  { id: 'parts_manager', label: 'Parts Manager' },
  { id: 'shop_foreman', label: 'Shop Foreman' },
  { id: 'office', label: 'Office Staff' },
  { id: 'custom', label: 'Custom' },
];

export const PAY_PLANS = [
  { id: 'hourly', label: 'Hourly' },
  { id: 'flat_rate', label: 'Flat rate' },
  { id: 'commission', label: 'Commission' },
  { id: 'team_split', label: 'Team split' },
];

const money = value => Math.round((Number(value) || 0) * 100) / 100;
const hoursOf = value => Math.round((Number(value) || 0) * 100) / 100;

export function classificationFor(user = {}) {
  const explicit = String(user.classification || '').trim();
  if (EMPLOYEE_CLASSIFICATIONS.some(item => item.id === explicit)) return explicit;
  if (user.role === 'technician') return 'technician';
  if (user.role === 'service_writer') return 'service_writer';
  if (user.role === 'office') return 'office';
  return 'custom';
}

export function technicianName(user = {}) {
  return String(user.techName || user.name || '').trim();
}

export function isAssignableTechnician(user = {}) {
  return user.active !== false && classificationFor(user) === 'technician' && Boolean(technicianName(user));
}

export function assignableTechnicians(users = []) {
  return users.filter(isAssignableTechnician);
}

function clampShare(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(100, Math.round(number * 100) / 100);
}

export function normalizeAssignments(order = {}, users = []) {
  const source = Array.isArray(order.assignments) ? order.assignments : [];
  const cleaned = source.map((item, index) => cleanAssignment(item, index, users)).filter(Boolean);
  if (cleaned.length) return ensurePrimary(cleaned);
  const legacy = String(order.tech || '').trim();
  if (!legacy || legacy === 'Unassigned') return [];
  const match = users.find(user => technicianName(user) === legacy);
  return [{
    id: `legacy-${order.id || 'tech'}`,
    employeeId: match?.id || null,
    name: legacy,
    role: 'primary',
    sharePercent: 100,
    hoursWorked: hoursOf(order.laborHours),
    writeIn: !match,
    assignedAt: null,
  }];
}

function cleanAssignment(item = {}, index = 0, users = []) {
  const employee = users.find(user => item.employeeId && user.id === item.employeeId);
  const name = String(employee ? technicianName(employee) : item.name || '').trim();
  if (!name) return null;
  return {
    id: String(item.id || `asg-${index + 1}`),
    employeeId: employee?.id || null,
    name,
    role: ROLES.includes(item.role) ? item.role : 'secondary',
    sharePercent: clampShare(item.sharePercent),
    hoursWorked: hoursOf(item.hoursWorked),
    writeIn: !employee,
    assignedAt: item.assignedAt || null,
  };
}

function ensurePrimary(assignments) {
  const withPrimary = assignments.some(item => item.role === 'primary')
    ? assignments
    : assignments.map((item, index) => (index === 0 ? { ...item, role: 'primary' } : item));
  let seen = false;
  const unique = withPrimary.map(item => {
    if (item.role !== 'primary') return item;
    if (seen) return { ...item, role: 'secondary' };
    seen = true;
    return item;
  });
  return unique.sort((left, right) => Number(right.role === 'primary') - Number(left.role === 'primary'));
}

export function applyAssignments(order = {}, assignments = [], users = []) {
  const normalized = ensurePrimary(assignments.map((item, index) => cleanAssignment(item, index, users)).filter(Boolean));
  const primary = normalized.find(item => item.role === 'primary');
  return {
    ...order,
    assignments: normalized,
    tech: primary?.name || 'Unassigned',
  };
}

export function orderIncludesTechnician(order = {}, user = {}, users = []) {
  const name = technicianName(user);
  if (!name && !user.id) return false;
  return normalizeAssignments(order, users).some(item => (
    (user.id && item.employeeId === user.id) || (name && item.name === name)
  ));
}

export function clockedHours(clocks = [], workOrderId, userId) {
  return hoursOf(clocks
    .filter(entry => entry.workOrderId === workOrderId && entry.userId === userId && entry.clockOut)
    .reduce((sum, entry) => sum + Number(entry.hours || 0), 0));
}

function shareFraction(assignments, assignment) {
  const total = assignments.reduce((sum, item) => sum + (Number(item.sharePercent) || 0), 0);
  if (!total) return assignments.length ? 1 / assignments.length : 0;
  return (Number(assignment.sharePercent) || 0) / total;
}

function payAmount(employee, plan, usableHours, laborRevenue, fraction, assignment) {
  if (!employee) return 0;
  if (employee.employmentType === 'Salary' && plan === 'hourly') return 0;
  if (plan === 'flat_rate' || plan === 'team_split') return money(laborRevenue * fraction);
  if (plan === 'commission') {
    const percent = Number(employee.commissionPercent || assignment.sharePercent || 0);
    return money(laborRevenue * percent / 100);
  }
  return money(usableHours * Number(employee.payRate || 0));
}

export function payrollLinesForOrder({
  order = {},
  users = [],
  clocks = [],
  periodKey,
  nowIso = null,
} = {}) {
  if (!['completed', 'invoiced'].includes(order.status)) return [];
  const assignments = normalizeAssignments(order, users);
  if (!assignments.length) return [];
  const laborRevenue = Number(order.labor || 0);
  return assignments.flatMap(assignment => {
    const employee = users.find(user => user.id === assignment.employeeId && user.active !== false) || null;
    const tracked = employee ? clockedHours(clocks, order.id, employee.id) : 0;
    const usableHours = hoursOf(tracked || assignment.hoursWorked || (assignment.role === 'primary' ? order.laborHours : 0));
    if (!usableHours) return [];
    const plan = PAY_PLANS.some(item => item.id === employee?.payPlan) ? employee.payPlan : 'hourly';
    const fraction = shareFraction(assignments, assignment);
    const amount = payAmount(employee, plan, usableHours, laborRevenue, fraction, assignment);
    return [{
      id: `${periodKey}#${order.id}#${assignment.id}`,
      workOrderId: order.id,
      employeeId: employee?.id || null,
      technicianName: assignment.name,
      role: assignment.role,
      writeIn: !employee,
      periodKey,
      roNumber: order.id,
      customer: order.customer || '',
      vehicle: order.vehicle || '',
      hours: usableHours,
      rate: plan === 'hourly' ? Number(employee?.payRate || 0) : 0,
      amount,
      grossPay: amount,
      payPlan: employee ? plan : 'unrated',
      completedAt: nowIso,
    }];
  });
}

export function attributeClockHours(order, userId, clocks = [], users = []) {
  const assignments = normalizeAssignments(order, users).map(item => (
    item.employeeId === userId
      ? { ...item, hoursWorked: clockedHours(clocks, order.id, userId) }
      : item
  ));
  const laborHours = hoursOf(clocks
    .filter(entry => entry.workOrderId === order.id && entry.clockOut)
    .reduce((sum, entry) => sum + Number(entry.hours || 0), 0));
  return applyAssignments({ ...order, laborHours: laborHours || order.laborHours }, assignments, users);
}

export function technicianPerformance(orders = [], users = [], clocks = []) {
  const comebackTracked = orders.some(order => Object.prototype.hasOwnProperty.call(order, 'comeback'));
  return assignableTechnicians(users).map(user => {
    const mine = orders.filter(order => orderIncludesTechnician(order, user, users));
    const completed = mine.filter(order => ['completed', 'invoiced'].includes(order.status));
    const hours = hoursOf(completed.reduce((sum, order) => {
      const tracked = clockedHours(clocks, order.id, user.id);
      if (tracked) return sum + tracked;
      const assignment = normalizeAssignments(order, users).find(item => item.employeeId === user.id);
      return sum + Number(assignment?.hoursWorked || (assignment?.role === 'primary' ? order.laborHours : 0) || 0);
    }, 0));
    const revenue = money(completed.reduce((sum, order) => sum + Number(order.labor || 0), 0));
    const billedHours = hoursOf(completed.reduce((sum, order) => sum + Number(order.laborHours || 0), 0));
    const efficiency = hours > 0 && billedHours > 0 ? Math.round((billedHours / hours) * 1000) / 10 : null;
    const averageRepair = completed.length && hours ? hoursOf(hours / completed.length) : null;
    const comebacks = comebackTracked ? completed.filter(order => order.comeback === true).length : null;
    return {
      id: user.id,
      name: technicianName(user),
      open: mine.length - completed.length,
      completed: completed.length,
      hours,
      revenue,
      efficiency,
      averageRepair,
      comebacks,
      averageTicket: completed.length ? money(revenue / completed.length) : null,
    };
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

const currency = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);

export function technicianTrackerHtml(rows = []) {
  const body = rows.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${row.open}</td><td>${row.completed}</td><td>${row.hours.toFixed(2)}</td><td>${currency(row.revenue)}</td><td>${row.efficiency == null ? '—' : `${row.efficiency}%`}</td><td>${row.comebacks == null ? '—' : row.comebacks}</td><td>${row.averageRepair == null ? '—' : row.averageRepair.toFixed(2)}</td></tr>`).join('');
  return `<section class="tech-tracker"><div class="home-panel-head"><div><h2>Technician performance</h2><p>Open jobs, completed jobs, clocked hours, and labor sold. Comebacks appear only after a job is marked as a comeback.</p></div></div><div class="data-panel"><table><thead><tr><th>Technician</th><th>Open</th><th>Completed</th><th>Hours</th><th>Labor sold</th><th>Efficiency</th><th>Comebacks</th><th>Avg hours</th></tr></thead><tbody>${body || '<tr><td colspan="8">No technicians are classified for assignment yet.</td></tr>'}</tbody></table></div></section>`;
}

export function assignmentSummary(order = {}, users = []) {
  const assignments = normalizeAssignments(order, users);
  if (!assignments.length) return order.tech && order.tech !== 'Unassigned' ? order.tech : 'Unassigned';
  const primary = assignments.find(item => item.role === 'primary') || assignments[0];
  const extra = assignments.length - 1;
  return extra > 0 ? `${primary.name} +${extra}` : primary.name;
}
