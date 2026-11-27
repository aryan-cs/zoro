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
 * What the phone is told, and when: as the rest ends, then again 30 seconds, a minute and two
 * minutes after it if the next set still hasn't started (starting it cancels the rest).
 */
export const REMINDERS = [
  { after: 0, body: 'Your rest is over!' },
  { after: 30_000, body: 'Your rest ended 30 seconds ago!' },
  { after: 60_000, body: 'Your rest ended 1 minute ago!' },
  { after: 120_000, body: 'Your rest ended 2 minutes ago!' },
];

/**
 * One of them as a Declarative Web Push message: iOS 18.4+ shows it by itself, and the app's
 * service worker shows the same for anything older. The words are the title, with nothing under
 * them: iOS always adds "from Zoro" under a web app's title, so titling it "Zoro" read twice.
 * Each has its own tag, so each one alerts.
 */
export function restMessage(url, stage = 0) {
  return JSON.stringify({ web_push: 8030, notification: { title: REMINDERS[stage].body, navigate: url, tag: `rest-${stage}`, silent: false } });
}

/** When a rest's next reminder is due, or null once they've all gone. */
export function dueAt(rest) {
  const r = REMINDERS[rest?.stage ?? 0];
  return rest && r ? rest.endsAt + r.after : null;
}

/** Whether a reminder whose alarm just went off should still be sent: not long past (a late retry). */
export function stillDue(rest, now = Date.now()) {
  const at = dueAt(rest);
  return at !== null && now - at < 60_000;
}
