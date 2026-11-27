// What zoro-server accepts and decides, kept apart from Cloudflare so it can be tested.

/** Furthest ahead a rest can end. */
export const MAX_AHEAD_MS = 30 * 60 * 1000;
/** Browsers' push services; nothing else is ever sent to. */
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
const isB64u = (s, min, max) => typeof s === 'string' && s.length >= min && s.length <= max && /^[A-Za-z0-9_-]+$/.test(s);

/**
 * A request from the app: { action: 'schedule', device, endsAt, subscription } or
 * { action: 'cancel', device }. Returns what to do, or { error }.
 */
export function parseRequest(body, now = Date.now()) {
  let r;
  try {
    r = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    return { error: 'not JSON' };
  }
  if (!r || typeof r !== 'object') return { error: 'empty' };
  if (typeof r.device !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(r.device)) return { error: 'device' };
  if (r.action === 'cancel') return { action: 'cancel', device: r.device };
  if (r.action !== 'schedule') return { error: 'action' };
  const endsAt = Number(r.endsAt);
  if (!Number.isFinite(endsAt) || endsAt < now - 5000 || endsAt > now + MAX_AHEAD_MS) return { error: 'endsAt' };
  const s = r.subscription;
  let host = '';
  try {
    const u = new URL(s?.endpoint);
    if (u.protocol !== 'https:') return { error: 'endpoint' };
    host = u.hostname;
  } catch {
    return { error: 'endpoint' };
  }
  if (!PUSH_HOSTS.some((h) => h.test(host))) return { error: 'endpoint' };
  if (!isB64u(s.keys?.p256dh, 80, 100) || !isB64u(s.keys?.auth, 16, 32)) return { error: 'keys' };
  return {
    action: 'schedule',
    device: r.device,
    endsAt: Math.round(endsAt),
    subscription: { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
  };
}

/**
 * The notification, as a Declarative Web Push message: iOS 18.4+ shows it by itself, and the
 * app's service worker shows the same for anything older. Titled with the app's name, so iOS
 * shows it on one line (another title gets "from Zoro" under it).
 */
export function restMessage(url) {
  return JSON.stringify({ web_push: 8030, notification: { title: 'Zoro', body: "Your rest is over, let's start the next set!", navigate: url, tag: 'rest', silent: false } });
}

/** Whether a rest whose alarm just went off should still notify: not long past (a late retry). */
export function stillDue(rest, now = Date.now()) {
  return !!rest && now - rest.endsAt < 60_000;
}
