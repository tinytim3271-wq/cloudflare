/**
 * One-shot: copy Google OAuth secrets from this Worker onto mechpro-api.
 * Deployed temporarily onto `mechpro`; values are never logged.
 */
export default {
  async fetch(request, env) {
    const expected = String(env.MIGRATE_TOKEN || '');
    const provided = request.headers.get('x-migrate-token') || '';
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
      results[`${name}_put`] = body.success === true ? 'ok' : `fail:${response.status}`;
    }

    return Response.json({ ok: true, results });
  },
};
