async function uploadErrorMessage(response) {
  const fallback = `Upload to storage failed (${response.status})`;
  const text = await response.text().catch(() => '');
  if (!text) return fallback;
  try {
    return JSON.parse(text).message || fallback;
  } catch {
    return text.trim() || fallback;
  }
}

export function uploadFailureMessage(error, fallback) {
  return String(error?.message || '').trim() || fallback;
}

export async function uploadFileToStorage(
  blob,
  kind,
  contentType,
  { apiFetch, fetchImpl = globalThis.fetch } = {},
) {
  const { uploadUrl, key } = await apiFetch('/files/presign-upload', {
    method: 'POST',
    body: JSON.stringify({ kind, contentType, contentLength: blob.size }),
  });
  const response = await fetchImpl(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!response.ok) throw new Error(await uploadErrorMessage(response));
  return key;
}
