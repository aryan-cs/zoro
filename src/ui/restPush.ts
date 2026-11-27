import { REST_PUSH_URL, VAPID_PUBLIC_KEY } from '../core/pushConfig';

/**
 * Rest notifications: when a rest starts, its end time goes to zoro-server, which pushes "Your
 * rest is over, let's start the next set!" to this phone at that moment (a Home Screen web app
 * is paused once you switch apps, so it can't tell you itself), then reminds it 30 seconds, a
 * minute and two minutes later until the next set starts. Starting it or skipping the rest
 * cancels them; +30s moves them. On for this phone only (Settings › Notifications).
 */
const ON_KEY = 'zoro.restPush';
const DEVICE_KEY = 'zoro.device';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* kept until the app closes */
  }
};

export const restPushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const restPushOn = () => read(ON_KEY) === '1' && restPushSupported() && Notification.permission === 'granted';

/** A random id for this phone: the server keeps one rest per phone. */
function device(): string {
  let id = read(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    write(DEVICE_KEY, id);
  }
  return id;
}

const keyBytes = (b64u: string) => Uint8Array.from(atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4)), (c) => c.charCodeAt(0));
const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i]);

// The service worker's registration, ready before any tap, so subscribing can happen right in the
// tap (iOS only allows it from one).
let registration: ServiceWorkerRegistration | null = null;
if (restPushSupported()) void navigator.serviceWorker.ready.then((r) => (registration = r));

/** This phone's push subscription for zoro-server's key, if there is one. */
async function subscription(): Promise<PushSubscription | null> {
  const reg = registration ?? (await navigator.serviceWorker.ready);
  const sub = await reg.pushManager.getSubscription();
  return sub && sameKey(sub.options.applicationServerKey, keyBytes(VAPID_PUBLIC_KEY)) ? sub : null;
}

/** Why turning them on last failed (shown with the message, to tell one cause from another). */
export let restPushError = '';

/**
 * Turn rest notifications on. Call it straight from a tap: subscribing is the first thing it
 * does, which is what asks for permission on iOS (only allowed from a tap).
 */
export async function enableRestPush(): Promise<'on' | 'denied' | 'unsupported' | 'failed'> {
  if (!restPushSupported()) return 'unsupported';
  const options = { userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) };
  try {
    const reg = registration ?? (await navigator.serviceWorker.ready);
    try {
      await reg.pushManager.subscribe(options);
    } catch (e) {
      // One made for another server key: replace it.
      if (!(e instanceof DOMException && e.name === 'InvalidStateError')) throw e;
      await (await reg.pushManager.getSubscription())?.unsubscribe();
      await reg.pushManager.subscribe(options);
    }
  } catch (e) {
    restPushError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return Notification.permission === 'denied' ? 'denied' : 'failed';
  }
  write(ON_KEY, '1');
  return 'on';
}

export function disableRestPush() {
  cancelRestPush();
  write(ON_KEY, null);
}

const post = (body: object) =>
  // Plain text, so it's a simple request; keepalive, so it still goes if the app is closing.
  fetch(REST_PUSH_URL, { method: 'POST', body: JSON.stringify(body), keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => undefined);

/** A rest that ends at `endsAt`: notify then. */
export function scheduleRestPush(endsAt: number) {
  if (!restPushOn() || endsAt < Date.now() + 1500) return;
  void (async () => {
    const sub = await subscription().catch(() => null);
    if (sub) await post({ action: 'schedule', device: device(), endsAt, subscription: sub.toJSON() });
  })();
}

/**
 * The rest is over or gone (the next set started, or it was skipped): no more reminders, and the
 * ones already showing are cleared away.
 */
export function cancelRestPush() {
  if (read(ON_KEY) !== '1') return;
  void post({ action: 'cancel', device: device() });
  void registration
    ?.getNotifications()
    .then((shown) => shown.forEach((n) => n.tag.startsWith('rest') && n.close()))
    .catch(() => undefined);
}
