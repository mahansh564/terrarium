/**
 * Converts non-base64 data URIs into base64 data URIs for Phaser loaders.
 *
 * @param uri Asset URI emitted by bundler.
 * @returns URI safe for Phaser data-uri decoding paths.
 */
export function toPhaserSafeDataUri(uri: string): string {
  if (!uri.startsWith('data:')) {
    return uri;
  }

  const commaIndex = uri.indexOf(',');
  if (commaIndex === -1) {
    return uri;
  }

  const metadata = uri.slice(0, commaIndex);
  const payload = uri.slice(commaIndex + 1);
  if (metadata.includes(';base64')) {
    return uri;
  }

  let decodedPayload: string;
  try {
    decodedPayload = decodeURIComponent(payload);
  } catch {
    return uri;
  }

  let base64Payload: string;
  try {
    base64Payload = btoa(decodedPayload);
  } catch {
    return uri;
  }

  return `${metadata};base64,${base64Payload}`;
}
