const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export class HttpError extends Error {
  constructor(status, message, headers = undefined) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

export function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...JSON_HEADERS, ...headers } });
}

export function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

export async function requestJson(request) {
  const text = await request.text();
  return text ? parseJson(text) : {};
}
