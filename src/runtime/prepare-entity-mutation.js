const OFFLINE_QUEUE_BLOCKED = /\/entities\/(employees|payrollentries|shopsettings|invoices|payments|expenses)(\/|$)/i;

function defaultMutationId() {
  return globalThis.crypto?.randomUUID?.() || `mutation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function prepareEntityMutation(path, options, createMutationId = defaultMutationId) {
  const method = String(options.method || 'GET').toUpperCase();
  const isEntityMutation = path.startsWith('/entities/') && ['POST', 'PUT', 'DELETE'].includes(method);
  const containsSensitiveEndpoint = path === '/agentphone/configure';
  const queueable = isEntityMutation && !OFFLINE_QUEUE_BLOCKED.test(path) && !containsSensitiveEndpoint;
  if (!queueable) return { path, options, queueable: false };
  let body = null;
  if (options.body) {
    try { body = JSON.parse(options.body); } catch { body = null; }
  }
  if (method === 'POST' && body && typeof body === 'object' && !Array.isArray(body) && !body.id) {
    body = { ...body, id: createMutationId() };
  }
  const entityKey = method === 'POST'
    ? (body && body.id ? `${path}/${body.id}` : `${path}/${createMutationId()}`)
    : path;
  return {
    path,
    options: { ...options, method, body: body ? JSON.stringify(body) : undefined },
    queueable: Boolean(body) || method === 'DELETE',
    expectedUpdatedAt: method === 'PUT' ? body?.updatedAt : null,
    key: entityKey,
  };
}
