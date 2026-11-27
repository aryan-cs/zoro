// zoro-server: the rest timer's notification. When a rest starts, the Zoro app sends when it
// ends; a Durable Object for that phone sets an alarm for then and, when it goes off, pushes
// "Your rest is over" to the phone (even while you're in another app). Skipping or stretching
// the rest replaces or cancels the alarm. One rest per phone.
import { DurableObject } from 'cloudflare:workers';
import { parseRequest, restMessage, stillDue } from './rules.js';
import { sendPush } from './webpush.js';

export class Rest extends DurableObject {
  async schedule(rest) {
    await this.ctx.storage.put('rest', rest);
    await this.ctx.storage.setAlarm(rest.endsAt);
  }

  async cancel() {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.delete('rest');
  }

  async alarm() {
    const rest = await this.ctx.storage.get('rest');
    // Gone first, so a retried alarm can't send it twice.
    await this.ctx.storage.delete('rest');
    if (!stillDue(rest)) return;
    const vapid = { publicKey: this.env.VAPID_PUBLIC, privateKey: this.env.VAPID_PRIVATE, subject: this.env.APP_URL };
    try {
      const status = await sendPush(rest.subscription, restMessage(this.env.APP_URL), vapid);
      console.log('push', status);
    } catch (e) {
      console.log('push failed', String(e));
    }
  }
}

const cors = (origin, env) => ({
  'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS.split(',').includes(origin) ? origin : 'null',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const headers = cors(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return Response.json({ ok: true, name: 'zoro-server' }, { headers });
    const r = parseRequest(await request.text());
    if (r.error) return Response.json({ error: r.error }, { status: 400, headers });
    const rest = env.RESTS.get(env.RESTS.idFromName(r.device));
    if (r.action === 'cancel') await rest.cancel();
    else await rest.schedule({ endsAt: r.endsAt, subscription: r.subscription });
    return Response.json({ ok: true }, { headers });
  },
};
