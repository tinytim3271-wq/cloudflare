/**
 * One-shot: copy Google OAuth secrets from this Worker onto mechpro-api.
 * Values are never logged or returned.
 */
export default {
  async fetch(request, env) {
    if (request.method === 'GET') {
      return Response.json({
        hasMigrateToken: Boolean(String(env.MIGRATE_TOKEN || '').trim()),
        hasGoogleClientId: Boolean(String(env.GOOGLE_CLIENT_ID || '').trim()),
        hasGoogleClientSecret: Boolean(String(env.GOOGLE_CLIENT_SECRET || '').trim()),
      });
    }

    const expected = String(env.MIGRATE_TOKEN || '').trim();
    const provided = String(request.headers.get('x-migrate-token') || '').trim();
    if (!expected || provided !== expected) {
      return new Response('unauthorized', { status: 401 });
    }
    const apiToken = request.headers.get('x-cf-api-token') || '';
    if (!apiToken) return new Response('missing api token', { status: 400 });

    const accountId = '0c31efca6f8739ca301b222f3d68cff4';
    const target = 'mechpro-api';
    const names = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
    const results = {};

    for (const name of names) {
      const text = String(env[name] || '').trim();
      results[name] = text ? 'present' : 'missing';
      if (!text) continue;
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${target}/secrets`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ type: 'secret_text', name, text }),
        },
      );
      const body = await response.json().catch(() => ({}));
      const err = body?.errors?.[0]?.code || body?.errors?.[0]?.message || '';
      results[`${name}_put`] = body.success === true ? 'ok' : `fail:${response.status}${err ? `:${err}` : ''}`;
    }

    return Response.json({ ok: true, results });
  },
};
