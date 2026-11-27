import { describe, expect, it } from 'vitest';
import { parseRequest, restMessage, stillDue } from './rules.js';
import { b64u, encrypt, newVapidKeys, unb64u, vapidAuth } from './webpush.js';

const enc = new TextEncoder();
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
/** The browser's side of RFC 8291: decrypt a push body with the subscription's private key. */
async function decrypt(body, uaKeys, authSecret) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey));
  const as = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: as }, uaKeys.privateKey, 256));
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic, 1]);
  const ikm = await hmac(await hmac(authSecret, shared), info);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
  expect(plain.at(-1)).toBe(2); // last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe('web push', () => {
  it('encrypts so only the subscribed browser can read it', async () => {
    const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const keys = { p256dh: b64u(await crypto.subtle.exportKey('raw', ua.publicKey)), auth: b64u(auth) };
    const msg = restMessage('Bench Press, set 3 of 4', 'https://aryan-cs.github.io/zoro/');
    const body = await encrypt(msg, keys);
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    expect(body[20]).toBe(65);
    expect(await decrypt(body, ua, auth)).toBe(msg);
    expect(body.length).toBeLessThan(4096);
  });

  it('signs a VAPID JWT the push service can check with the public key', async () => {
    const vapid = { ...(await newVapidKeys()), subject: 'https://aryan-cs.github.io/zoro/' };
    expect(unb64u(vapid.publicKey).length).toBe(65);
    const header = await vapidAuth('https://web.push.apple.com/QGuQ...', vapid, Date.UTC(2026, 10, 27));
    const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
    expect(k).toBe(vapid.publicKey);
    const [h, c, s] = jwt.split('.');
    const claims = JSON.parse(new TextDecoder().decode(unb64u(c)));
    expect(claims).toMatchObject({ aud: 'https://web.push.apple.com', sub: 'https://aryan-cs.github.io/zoro/' });
    expect(claims.exp - Date.UTC(2026, 10, 27) / 1000).toBe(12 * 3600);
    const pub = await crypto.subtle.importKey('raw', unb64u(vapid.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(s), enc.encode(`${h}.${c}`))).toBe(true);
  });
});

describe('what the server accepts', () => {
  const now = 1_800_000_000_000;
  const sub = { endpoint: 'https://web.push.apple.com/QGuQyavXutnMH4', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };
  it('schedules a rest for a push service, and cancels', () => {
    expect(parseRequest(JSON.stringify({ action: 'schedule', device: 'abcd-1234-ef', endsAt: now + 90_000, subscription: sub, next: 'Bench' }), now)).toMatchObject({ action: 'schedule', endsAt: now + 90_000, next: 'Bench' });
    expect(parseRequest({ action: 'cancel', device: 'abcd-1234-ef' }, now)).toEqual({ action: 'cancel', device: 'abcd-1234-ef' });
  });
  it('refuses anything else', () => {
    const base = { action: 'schedule', device: 'abcd-1234-ef', endsAt: now + 90_000, subscription: sub };
    expect(parseRequest('nope', now).error).toBeTruthy();
    expect(parseRequest({ ...base, device: 'x' }, now).error).toBe('device');
    expect(parseRequest({ ...base, endsAt: now + 3_600_000 }, now).error).toBe('endsAt');
    expect(parseRequest({ ...base, subscription: { ...sub, endpoint: 'https://evil.example.com/x' } }, now).error).toBe('endpoint');
    expect(parseRequest({ ...base, subscription: { ...sub, endpoint: 'http://web.push.apple.com/x' } }, now).error).toBe('endpoint');
    expect(parseRequest({ ...base, subscription: { ...sub, keys: { p256dh: 'x', auth: 'y' } } }, now).error).toBe('keys');
  });
  it('says the user’s words, and drops a retry that comes long after the rest', () => {
    const m = JSON.parse(restMessage('Squat, set 2 of 3', 'https://aryan-cs.github.io/zoro/'));
    expect(m).toMatchObject({ web_push: 8030, notification: { title: 'Rest Over', navigate: 'https://aryan-cs.github.io/zoro/' } });
    expect(m.notification.body).toBe("Your rest is over, let's start the next set! Up next: Squat, set 2 of 3.");
    expect(stillDue({ endsAt: now }, now + 2000)).toBe(true);
    expect(stillDue({ endsAt: now }, now + 120_000)).toBe(false);
    expect(stillDue(undefined, now)).toBe(false);
  });
});
