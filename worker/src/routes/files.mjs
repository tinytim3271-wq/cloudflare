import { HttpError, json, requestJson } from '../http.mjs';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);

/** Validate declared upload size — used by routes and tests. */
export function assertUploadSize(contentLength, maxBytes = MAX_UPLOAD_BYTES) {
  const size = Number(contentLength || 0);
  if (!Number.isFinite(size) || size <= 0 || size > maxBytes) {
    throw new HttpError(400, `File size must be between 1 byte and ${Math.floor(maxBytes / (1024 * 1024))} MB`);
  }
  return size;
}

export function assertUploadContentType(contentType) {
  const normalized = String(contentType || 'application/octet-stream').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_CONTENT_TYPES.has(normalized)) {
    throw new HttpError(400, 'Unsupported file type');
  }
  return normalized;
}

export async function handleFiles(request, env, context, segments) {
  const action = segments[1];
  if (action === 'presign-upload' && request.method === 'POST') {
    const body = await requestJson(request);
    const kind = String(body.kind || 'file').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'file';
    const contentType = assertUploadContentType(body.contentType);
    assertUploadSize(body.contentLength);
    const key = `shops/${context.shopId}/${kind}/${crypto.randomUUID()}`;
    const uploadUrl = new URL('/api/files/upload', request.url);
    uploadUrl.searchParams.set('key', key);
    return json({ uploadUrl: uploadUrl.href, key, expiresIn: 300 });
  }
  const key = new URL(request.url).searchParams.get('key')
    || (action === 'object' ? '' : decodeURIComponent(segments.slice(1).join('/')));
  if (!key || !key.startsWith(`shops/${context.shopId}/`)) {
    throw new HttpError(403, 'File key is outside this shop');
  }
  if (action === 'upload' && request.method === 'PUT') {
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_UPLOAD_BYTES) throw new HttpError(413, 'File exceeds 15 MB');
    await env.FILES.put(key, request.body, {
      httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/octet-stream' },
      customMetadata: { shopId: context.shopId, uploadedBy: context.userId },
    });
    return new Response(null, { status: 204 });
  }
  if (action === 'presign-download' && request.method === 'GET') {
    const downloadUrl = new URL('/api/files/object', request.url);
    downloadUrl.searchParams.set('key', key);
    return json({ url: downloadUrl.href, key, expiresIn: 300 });
  }
  if ((action === 'object' || action !== 'upload') && request.method === 'GET') {
    const object = await env.FILES.get(key);
    if (!object) throw new HttpError(404, 'File not found');
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('Cache-Control', 'private, max-age=300');
    return new Response(object.body, { headers });
  }
  throw new HttpError(405, 'Method not allowed');
}
