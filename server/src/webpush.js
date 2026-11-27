// Web Push with WebCrypto only (Cloudflare Workers, browsers and Node all have it): the message
// encrypted for one browser (RFC 8291, aes128gcm) and signed for its push service with this
// server's VAPID key (RFC 8292).

const enc = new TextEncoder();
export const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** Encrypt `payload` (a string) for a subscription's keys; returns the request body. */
export async function encrypt(payload, { p256dh, auth }, opts = {}) {
  const uaPublic = unb64u(p256dh);
  const authSecret = unb64u(auth);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const as = opts.keys ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const ua = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua }, as.privateKey, 256));
  // HKDF with the auth secret, then with the salt (each Expand is one HMAC block: lengths ≤ 32).
  const ikm = await hmac(await hmac(authSecret, shared), concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // One record: the payload, then the last-record delimiter.
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));
  const head = new Uint8Array(21);
  head.set(salt, 0);
  new DataView(head.buffer).setUint32(16, 4096);
  head[20] = asPublic.length;
  return concat(head, asPublic, body);
}

/** The Authorization header for a push service, signed with the VAPID key pair (base64url). */
export async function vapidAuth(endpoint, { publicKey, privateKey, subject }, now = Date.now()) {
  const pub = unb64u(publicKey); // 0x04 || x || y
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  // WebCrypto's ECDSA signature is already JOSE's raw r || s.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${publicKey}`;
}

/** Send one push; resolves to the push service's status (201 sent; 404/410: the subscription is gone). */
export async function sendPush(subscription, payload, vapid, { ttl = 120, urgency = 'high' } = {}) {
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
    },
    body: await encrypt(payload, subscription.keys),
  });
  return res.status;
}

/** A new VAPID key pair: the public key (65 bytes, for the app) and private scalar (for the server). */
export async function newVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { publicKey: b64u(pub), privateKey: jwk.d };
}
