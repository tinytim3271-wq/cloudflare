export const ENTITY_TYPES = new Set([
  'customers', 'vehicles', 'orders', 'invoices', 'expenses', 'estimates', 'payments',
  'employees', 'shiftentries', 'jobclockentries', 'payrollentries', 'conversations',
  'chatmessages', 'inventory', 'vendors', 'services', 'inspectiontemplates',
  'inspections', 'reminders', 'shopsettings', 'appointments', 'purchases',
]);

export const WRITE_ROLES = {
  employees: ['admin'],
  invoices: ['admin', 'office', 'service_writer'],
  payments: ['admin', 'office', 'service_writer'],
  expenses: ['admin', 'office'],
  payrollentries: ['admin'],
  estimates: ['admin', 'office', 'service_writer'],
  shopsettings: ['admin'],
  purchases: ['admin', 'office'],
  vendors: ['admin', 'office'],
  services: ['admin', 'office', 'service_writer'],
  inspectiontemplates: ['admin', 'office', 'service_writer'],
};

export const READ_ROLES = { payrollentries: ['admin', 'office'] };

export function normalizeEntityType(value) {
  const type = String(value || '').trim().toLowerCase();
  return type === 'bookings' ? 'appointments' : type;
}

export function normalizeEntityPayload(sourceType, payload) {
  const type = String(sourceType || '').trim().toLowerCase();
  if (type === 'customers' && ('address' in payload || 'created_at' in payload)) {
    return {
      ...payload,
      billingAddress: payload.billingAddress ?? payload.address ?? '',
      createdAt: payload.createdAt ?? payload.created_at,
      updatedAt: payload.updatedAt ?? payload.updated_at,
    };
  }
  if (type === 'employees' && ('salary' in payload || 'created_at' in payload)) {
    return {
      ...payload,
      payRate: payload.payRate ?? payload.salary ?? 0,
      active: payload.active ?? payload.status !== 'inactive',
      createdAt: payload.createdAt ?? payload.created_at,
      updatedAt: payload.updatedAt ?? payload.updated_at,
    };
  }
  if (type === 'bookings') {
    const timestamp = String(payload.booking_date || '');
    return {
      ...payload,
      customerId: payload.customerId ?? payload.customer_id,
      employeeId: payload.employeeId ?? payload.employee_id,
      customer: payload.customer ?? (payload.customer_id ? `Customer #${payload.customer_id}` : 'Customer pending'),
      vehicle: payload.vehicle ?? 'Vehicle pending',
      service: payload.service ?? payload.service_type ?? 'General service',
      date: payload.date ?? timestamp.slice(0, 10),
      time: payload.time ?? timestamp.slice(11, 16),
      tech: payload.tech ?? (payload.employee_id ? `Employee #${payload.employee_id}` : 'Unassigned'),
      notes: payload.notes ?? '',
      status: payload.status ?? 'scheduled',
      createdAt: payload.createdAt ?? payload.created_at,
      updatedAt: payload.updatedAt ?? payload.updated_at,
    };
  }
  if (type === 'invoices') {
    return {
      ...payload,
      customerId: payload.customerId ?? payload.customer_id,
      bookingId: payload.bookingId ?? payload.booking_id,
      amount: payload.amount ?? payload.total_amount,
      paymentMethod: payload.paymentMethod ?? payload.payment_method,
      createdAt: payload.createdAt ?? payload.created_at,
      updatedAt: payload.updatedAt ?? payload.updated_at,
    };
  }
  if (type === 'inspections') {
    return {
      ...payload,
      customerId: payload.customerId ?? payload.customer_id,
      vin: payload.vin ?? payload.vehicle_vin ?? '',
      aiAnalysis: payload.aiAnalysis ?? payload.ai_analysis ?? '',
      createdAt: payload.createdAt ?? payload.created_at,
      updatedAt: payload.updatedAt ?? payload.updated_at,
    };
  }
  return payload;
}

export function canReadEntity(type, role) {
  return !READ_ROLES[type] || READ_ROLES[type].includes(role);
}

export function canWriteEntity(type, role) {
  return !WRITE_ROLES[type] || WRITE_ROLES[type].includes(role);
}

export function redactEmployee(record, role) {
  if (['admin', 'office'].includes(role)) return record;
  const copy = { ...record };
  ['payRate', 'payFrequency', 'employmentType', 'address', 'emergencyContact', 'taxStatus', 'phone']
    .forEach(field => delete copy[field]);
  return copy;
}

export function openInvoiceBalance(invoiceAmount, payments) {
  const paid = payments.filter(payment => payment.status === 'completed')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return Math.max(0, Math.round((Number(invoiceAmount || 0) - paid) * 100) / 100);
}

export function validVin(value) {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(String(value || '').trim().toUpperCase());
}

export function validShopId(value) {
  return /^[a-z0-9][a-z0-9-]{2,63}$/.test(String(value || ''));
}

export function invoiceTaxBreakdown(invoice, fallbackRate) {
  if (!invoice) return { subtotal: 0, tax: 0, taxRate: fallbackRate };
  if (typeof invoice.tax === 'number' && typeof invoice.subtotal === 'number') {
    return { subtotal: invoice.subtotal, tax: invoice.tax, taxRate: invoice.taxRate ?? fallbackRate };
  }
  const subtotal = Math.round((Number(invoice.amount || 0) / (1 + fallbackRate / 100)) * 100) / 100;
  return { subtotal, tax: Math.round((Number(invoice.amount || 0) - subtotal) * 100) / 100, taxRate: fallbackRate };
}

export function buildTaxReport(payments, invoices, fallbackRate, from, to) {
  const start = new Date(from);
  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);
  const rows = payments.filter(payment => payment.status === 'completed')
    .filter(payment => new Date(payment.receivedAt) >= start && new Date(payment.receivedAt) <= end)
    .map(payment => {
      const invoice = invoices.find(item => item.number === payment.invoiceNumber);
      const breakdown = invoiceTaxBreakdown(invoice, fallbackRate);
      const ratio = invoice ? Number(payment.amount) / (Number(invoice.amount) || Number(payment.amount)) : 0;
      return {
        date: payment.receivedAt,
        invoiceNumber: payment.invoiceNumber,
        customer: payment.customer,
        gross: Number(payment.amount),
        taxable: Math.round(breakdown.subtotal * ratio * 100) / 100,
        tax: Math.round(breakdown.tax * ratio * 100) / 100,
      };
    }).sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const totals = rows.reduce((sum, row) => ({
    gross: Math.round((sum.gross + row.gross) * 100) / 100,
    taxable: Math.round((sum.taxable + row.taxable) * 100) / 100,
    tax: Math.round((sum.tax + row.tax) * 100) / 100,
  }), { gross: 0, taxable: 0, tax: 0 });
  return { rows, totals };
}
