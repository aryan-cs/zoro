import { REST_PUSH_URL, VAPID_PUBLIC_KEY } from '../core/pushConfig';

/**
 * Rest notifications: when a rest starts, its end time goes to zoro-server, which pushes "Your
 * rest is over, let's start the next set!" to this phone at that moment (a Home Screen web app
 * is paused once you switch apps, so it can't tell you itself). Skipping or finishing the rest
 * early cancels it; +30s moves it. On for this phone only (Settings › Notifications).
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

async function subscription(make: boolean): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  const key = keyBytes(VAPID_PUBLIC_KEY);
  let sub = await reg.pushManager.getSubscription();
  // One made for another server key can't be used: start over.
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub && make) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return sub;
}

/** Turn rest notifications on (from a tap: iOS asks for permission only then). */
export async function enableRestPush(): Promise<'on' | 'denied' | 'unsupported' | 'failed'> {
  if (!restPushSupported()) return 'unsupported';
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  try {
    if (!(await subscription(true))) return 'failed';
  } catch {
    return 'failed';
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

/** A rest that ends at `endsAt`: notify then, saying what's next ("Bench Press, set 3 of 4"). */
export function scheduleRestPush(endsAt: number, next?: string) {
  if (!restPushOn() || endsAt < Date.now() + 1500) return;
  void (async () => {
    const sub = await subscription(false).catch(() => null);
    if (sub) await post({ action: 'schedule', device: device(), endsAt, subscription: sub.toJSON(), next });
  })();
}

/** The rest is over or gone: no notification. */
export function cancelRestPush() {
  if (read(ON_KEY) !== '1') return;
  void post({ action: 'cancel', device: device() });
}
