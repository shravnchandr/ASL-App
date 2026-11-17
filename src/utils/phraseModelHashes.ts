// Set by vite.config.ts: SHA-256 of each phrase model file, per bundle.
declare const __PHRASE_MODEL_HASHES__: Record<string, Record<string, string>>;

export const PHRASE_MODEL_HASHES = __PHRASE_MODEL_HASHES__;

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
