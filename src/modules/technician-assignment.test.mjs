import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAssignments,
  assignableTechnicians,
  classificationFor,
  isAssignableTechnician,
  normalizeAssignments,
  orderIncludesTechnician,
  payrollLinesForOrder,
  technicianPerformance,
} from './technician-assignment.js';

const users = [
  { id: 'u1', name: 'John Smith', techName: 'John Smith', role: 'technician', active: true, employmentType: 'Hourly', payRate: 35, payPlan: 'hourly' },
  { id: 'u2', name: 'Mike Johnson', techName: 'Mike Johnson', role: 'technician', active: true, employmentType: 'Hourly', payRate: 28, payPlan: 'team_split' },
  { id: 'u3', name: 'Pat Office', role: 'office', active: true, payRate: 20 },
];

test('only employees classified as technicians are assignable', () => {
  assert.equal(classificationFor(users[0]), 'technician');
  assert.equal(classificationFor(users[2]), 'office');
  assert.equal(isAssignableTechnician(users[2]), false);
  assert.deepEqual(assignableTechnicians(users).map(user => user.id), ['u1', 'u2']);
});

test('a legacy single technician becomes the primary assignment', () => {
  const assignments = normalizeAssignments({ id: 'RO-1', tech: 'John Smith', laborHours: 2 }, users);
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].role, 'primary');
  assert.equal(assignments[0].employeeId, 'u1');
  assert.equal(orderIncludesTechnician({ tech: 'John Smith' }, users[0], users), true);
  assert.equal(orderIncludesTechnician({ tech: 'John Smith' }, users[1], users), false);
});

test('applying assignments keeps the primary name on the work order', () => {
  const next = applyAssignments({ id: 'RO-9', tech: 'Unassigned' }, [
    { name: 'Mike Johnson', employeeId: 'u2', role: 'secondary', sharePercent: 25 },
    { name: 'John Smith', employeeId: 'u1', role: 'primary', sharePercent: 75 },
  ], users);
  assert.equal(next.tech, 'John Smith');
  assert.equal(next.assignments[0].role, 'primary');
  assert.equal(orderIncludesTechnician(next, users[1], users), true);
});

test('payroll posts one line per technician and splits team labor', () => {
  const lines = payrollLinesForOrder({
    order: {
      id: 'RO-10',
      status: 'completed',
      customer: 'Ada',
      vehicle: 'Truck',
      labor: 400,
      laborHours: 4,
      assignments: [
        { id: 'a', employeeId: 'u1', name: 'John Smith', role: 'primary', sharePercent: 75, hoursWorked: 3 },
        { id: 'b', employeeId: 'u2', name: 'Mike Johnson', role: 'secondary', sharePercent: 25, hoursWorked: 1 },
      ],
    },
    users,
    periodKey: '2026-10-05',
  });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].amount, 105);
  assert.equal(lines[1].amount, 100);
  assert.equal(lines[1].payPlan, 'team_split');
});

test('a write-in technician keeps hours and does not invent a pay rate', () => {
  const lines = payrollLinesForOrder({
    order: {
      id: 'RO-11',
      status: 'invoiced',
      labor: 200,
      assignments: [{ id: 'temp', name: 'Temp Tech', role: 'primary', writeIn: true, hoursWorked: 2, sharePercent: 100 }],
    },
    users,
    periodKey: '2026-10-05',
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].employeeId, null);
  assert.equal(lines[0].hours, 2);
  assert.equal(lines[0].amount, 0);
  assert.equal(lines[0].writeIn, true);
});

test('performance uses real jobs and leaves comebacks blank when they are not tracked', () => {
  const rows = technicianPerformance([
    { id: 'RO-1', status: 'in_progress', tech: 'John Smith', labor: 0, laborHours: 0 },
    { id: 'RO-2', status: 'completed', tech: 'John Smith', labor: 300, laborHours: 2 },
  ], users, []);
  const john = rows.find(row => row.id === 'u1');
  assert.equal(john.open, 1);
  assert.equal(john.completed, 1);
  assert.equal(john.revenue, 300);
  assert.equal(john.comebacks, null);
});
