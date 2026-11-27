import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZoroDB, saveSettings, setDB } from './db';
import { AiError, generate, liveSearch, type GenerateArgs, type GenerateResult } from './gemini';
import { logFromPhoto, mealForHour, nutritionLinks, parseJson, siteRoot, toInboxFoods, type PhotoDeps } from './photoLog';
import { entriesFor, logFoods, today } from './store';

const SPICY = 'https://cdn.prod.website-files.com/64e5/6946_Nutrition%20Facts%20and%20Allergen%20Info%20(SPICY)%20121925.pdf';
const MILD = 'https://cdn.prod.website-files.com/64e5/6946_Nutrition%20Facts%20and%20Allergen%20Info%20(NOT%20or%20LEAST%20SPICY)%20121925.pdf';

const XIAN_HOME = `Title: Xi'an Famous Foods\n\n[Menu](https://www.xianfoods.com/menu) [Locations](https://www.xianfoods.com/locations) [Shop](https://www.xiankits.com)`;
const XIAN_MENU = [
  '**Please review our nutrition facts and allergen information:**',
  `for when dishes are [not spicy/least spicy](${MILD})`,
  `or when they are made as [regular/default spicy](${SPICY})`,
  'please read about_[_cross-sensitivity to Sichuan Peppercorns_](https://cdn.prod.website-files.com/64e5/6b02_signs-sichuan%20peppercorns%20allergy.pdf)_here!_',
].join('\n');

// What Gemini would say, step by step, for the Xi'an receipt (11/26/26 1:07 PM).
const XIAN_READ = {
  kind: 'receipt',
  restaurant: "Xi'an Famous Foods",
  website: 'xianfoods.com',
  date: '2026-11-26',
  time: '13:07',
  items: [
    { name: 'Stewed Pork Burger', code: '[B1]', quantity: 1, serving: '1 burger', grams: 200, kcal: 600, protein: 25, carbs: 50, fat: 30, fiber: 2, fromPhoto: false },
    { name: 'Spicy Cumin Lamb Hand-Ripped Noodles', code: 'N1', details: 'Extra Spicy', quantity: 1, serving: '1 order', grams: 450, kcal: 1000, protein: 40, carbs: 120, fat: 40, fiber: 6, fromPhoto: false },
  ],
};
const XIAN_CHECK = {
  items: [
    { index: 1, found: true, source: SPICY, serving: '1 burger', grams: 255, kcal: 782, protein: 28, carbs: 70, fat: 42, fiber: 4 },
    { index: 2, found: true, source: SPICY, serving: '1 order', grams: 497, kcal: 1240, protein: 45, carbs: 140, fat: 54, fiber: 13 },
  ],
};

const reply = (o: unknown): GenerateResult => ({ text: '```json\n' + JSON.stringify(o) + '\n```', urls: [], sources: [], model: 'test' });
const image = { mimeType: 'image/jpeg', data: 'AAAA' };
const at = (iso: string) => () => new Date(iso);

describe('photo log helpers', () => {
  it('picks the meal from the hour', () => {
    expect([2, 7, 11, 13, 15, 19, 21, 23].map(mealForHour)).toEqual(['snack', 'breakfast', 'lunch', 'lunch', 'dinner', 'dinner', 'snack', 'snack']);
  });

  it('reads JSON out of a fenced or chatty reply', () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJson('Here you go: {"a": {"b": 2}} Enjoy!')).toEqual({ a: { b: 2 } });
    expect(() => parseJson('no json here')).toThrow(AiError);
  });

  it('finds nutrition PDFs and menu pages in a page', () => {
    expect(nutritionLinks(XIAN_HOME, 'https://www.xianfoods.com')).toEqual({ docs: [], pages: ['https://www.xianfoods.com/menu'] });
    const { docs } = nutritionLinks(XIAN_MENU, 'https://www.xianfoods.com/menu');
    expect(docs.map((d) => d.url)).toEqual([MILD, SPICY]);
  });

  it('turns a website into its root', () => {
    expect(siteRoot('xianfoods.com')).toBe('https://xianfoods.com');
    expect(siteRoot('https://www.chipotle.com/nutrition')).toBe('https://www.chipotle.com');
    expect(siteRoot('not a site')).toBeNull();
    expect(siteRoot(undefined)).toBeNull();
  });
});

describe('logFromPhoto', () => {
  it('sends Gemini only the photo itself, not the id it was saved under', async () => {
    const calls: Omit<GenerateArgs, 'key'>[] = [];
    const deps: PhotoDeps = {
      now: at('2026-11-26T18:30:00'),
      generate: async (a) => {
        calls.push(a);
        return reply(calls.length === 1 ? XIAN_READ : XIAN_CHECK);
      },
      readPage: async (url) => (url.endsWith('/menu') ? XIAN_MENU : XIAN_HOME),
      fetchFile: async () => ({ id: 3, mimeType: 'application/pdf', data: 'TUlMRA==' }) as { mimeType: string; data: string },
      search: async () => ({ text: '', sources: [] }) as never,
    };
    await logFromPhoto({ id: 7, mimeType: 'image/jpeg', data: 'AAAA' } as { mimeType: string; data: string }, deps).catch(() => undefined);
    const files = calls.flatMap((c) => c.parts).filter((p) => 'inlineData' in p);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(Object.keys((f as { inlineData: object }).inlineData).sort()).toEqual(['data', 'mimeType']);
  });

  it('copies official numbers from the restaurant’s nutrition PDF (Xi’an receipt)', async () => {
    const calls: Omit<GenerateArgs, 'key'>[] = [];
    let searchAborted = false;
    const deps: PhotoDeps = {
      now: at('2026-11-26T18:30:00'),
      generate: async (a) => {
        calls.push(a);
        return reply(calls.length === 1 ? XIAN_READ : XIAN_CHECK);
      },
      readPage: async (url) => (url.endsWith('/menu') ? XIAN_MENU : XIAN_HOME),
      fetchFile: async (url) => ({ mimeType: 'application/pdf', data: url === SPICY ? 'U1BJQ1k=' : 'TUlMRA==' }),
      search: (a) =>
        new Promise((_, reject) =>
          a.signal?.addEventListener('abort', () => {
            searchAborted = true;
            reject(new AiError('Cancelled.', 'other'));
          }),
        ),
    };
    const log = await logFromPhoto(image, deps);

    expect(log).toMatchObject({ kind: 'receipt', restaurant: "Xi'an Famous Foods", date: '2026-11-26', meal: 'lunch', dated: true, timed: true });
    expect(log.foods).toHaveLength(2);
    expect(log.foods[0]).toMatchObject({
      quantity: 1,
      basis: 'official',
      food: { name: 'Stewed Pork Burger', brand: "Xi'an Famous Foods", serving: { label: '1 burger', grams: 255, macros: { kcal: 782, protein: 28, carbs: 70, fat: 42, fiber: 4 } } },
      source: { url: SPICY, title: "Xi'an Famous Foods Nutrition Facts" },
    });
    expect(log.foods[1]).toMatchObject({ details: 'Extra Spicy', basis: 'official', food: { serving: { grams: 497, macros: { kcal: 1240, protein: 45, carbs: 140, fat: 54, fiber: 13 } } } });
    // The site had the PDFs, so the search was called off; both PDFs went to Gemini whole.
    expect(searchAborted).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].urlContext).toBe(false);
    expect(calls[1].parts.filter((p) => 'inlineData' in p)).toHaveLength(2);
    expect(JSON.stringify(calls[1].parts)).toContain('[menu code N1] (Extra Spicy)');
  });

  it('keeps its estimates when there are no official numbers (Blaze order, no time on it)', async () => {
    const read = {
      kind: 'order',
      restaurant: 'Blaze Teriyaki',
      items: [{ name: 'Blaze Teriyaki Chicken Bowl', details: 'Fried Rice', quantity: 2, serving: '1 bowl', grams: 600, kcal: 1047, protein: 57, carbs: 103, fat: 46, fiber: 3, fromPhoto: false }],
    };
    const generateMock = vi.fn(async () => reply(read));
    const log = await logFromPhoto(image, {
      now: at('2026-11-26T19:30:00'),
      generate: generateMock,
      readPage: async () => {
        throw new Error('no site');
      },
      search: async () => ({ args: { sources: [], items: [] }, sources: [], transcript: '' }),
    });
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(log).toMatchObject({ date: '2026-11-26', meal: 'dinner', dated: false, timed: false });
    expect(log.foods[0]).toMatchObject({ quantity: 2, basis: 'estimate', details: 'Fried Rice', food: { serving: { macros: { kcal: 1047, protein: 57, carbs: 103, fat: 46, fiber: 3 } } } });
    expect(log.foods[0].source).toBeUndefined();
  });

  it('reads pages a search found when the site has nothing', async () => {
    const calls: Omit<GenerateArgs, 'key'>[] = [];
    const page = 'https://www.example-teriyaki.com/nutrition';
    const log = await logFromPhoto(image, {
      now: at('2026-11-26T12:00:00'),
      generate: async (a) => {
        calls.push(a);
        return calls.length === 1
          ? reply({ kind: 'order', restaurant: 'Example Teriyaki', items: [{ name: 'Chicken Bowl', quantity: 1, serving: '1 bowl', kcal: 900, protein: 50, carbs: 100, fat: 30, fromPhoto: false }] })
          : { ...reply({ items: [{ index: 1, found: true, source: page, serving: '1 bowl', grams: 510, kcal: 810, protein: 48, carbs: 92, fat: 25, fiber: 2 }] }), urls: [{ url: page, ok: true }] };
      },
      search: async () => ({ args: { sources: [{ url: page, title: 'Nutrition', official: true }], items: [{ index: 1, kcal: 810 }] }, sources: [], transcript: '' }),
    });
    expect(calls[1].urlContext).toBe(true);
    expect(calls[1].parts[0]).toMatchObject({ text: expect.stringContaining(page) });
    expect(log.foods[0]).toMatchObject({ basis: 'official', source: { url: page, title: 'Example Teriyaki Nutrition Facts' }, food: { serving: { grams: 510, macros: { kcal: 810 } } } });
  });

  it('skips search redirect links, third-party sites and bare home pages, and finds PDFs through a menu page search found', async () => {
    const calls: Omit<GenerateArgs, 'key'>[] = [];
    const generateMock = async (a: Omit<GenerateArgs, 'key'>) => {
      calls.push(a);
      return reply(calls.length === 1 ? { ...XIAN_READ, website: undefined } : XIAN_CHECK);
    };
    const redirect = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQ';
    // Only a redirect link and a home page: nothing to read, so no check step.
    const none = await logFromPhoto(image, {
      now: at('2026-11-26T13:00:00'),
      generate: generateMock,
      readPage: async () => 'nothing here',
      search: async () => ({
        args: { sources: [{ url: redirect }, { url: 'https://xianfoods.com' }, { url: 'https://macros.menu/restaurant/xian-famous-foods', official: false }] },
        sources: [{ uri: redirect }],
        transcript: '',
      }),
    });
    expect(calls).toHaveLength(1);
    expect(none.foods[0].basis).toBe('estimate');
    // The menu page it found links the PDFs.
    calls.length = 0;
    const read: string[] = [];
    const log = await logFromPhoto(image, {
      now: at('2026-11-26T13:00:00'),
      generate: generateMock,
      readPage: async (url) => {
        read.push(url);
        return url.endsWith('/menu') ? XIAN_MENU : XIAN_HOME;
      },
      fetchFile: async () => ({ mimeType: 'application/pdf', data: 'UERG' }),
      search: async () => ({ args: { sources: [{ url: 'https://www.xianfoods.com/menu', title: 'Menu' }] }, sources: [], transcript: '' }),
    });
    expect(read).toEqual(['https://www.xianfoods.com/menu']);
    expect(log.foods.map((f) => [f.basis, f.source?.url])).toEqual([
      ['official', SPICY],
      ['official', SPICY],
    ]);
  });

  it('takes a label’s numbers as they are, without looking anything up', async () => {
    const generateMock = vi.fn(async () =>
      reply({ kind: 'label', restaurant: 'Fairlife', items: [{ name: 'Core Power Chocolate', quantity: 1, serving: '1 bottle (414 ml)', kcal: 230, protein: 42, carbs: 8, fat: 3.5, fiber: 1, fromPhoto: true }] }),
    );
    const search = vi.fn();
    const log = await logFromPhoto(image, { now: at('2026-11-26T08:00:00'), generate: generateMock, search });
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();
    expect(log.foods[0]).toMatchObject({ basis: 'label', food: { serving: { macros: { kcal: 230, protein: 42, fat: 3.5 } } } });
    expect(log.meal).toBe('breakfast');
  });

  it('ignores a printed date in the future and finds nothing in an empty photo', async () => {
    const log = await logFromPhoto(image, { now: at('2026-11-26T12:00:00'), generate: async () => reply({ kind: 'other', date: '2027-01-01', items: [] }) });
    expect(log).toMatchObject({ date: '2026-11-26', dated: false, foods: [] });
  });

  it('stops for a bad key, but keeps the estimates if only the check fails', async () => {
    await expect(logFromPhoto(image, { generate: async () => Promise.reject(new AiError('bad key', 'key')) })).rejects.toMatchObject({ kind: 'key' });
    let n = 0;
    const log = await logFromPhoto(image, {
      now: at('2026-11-26T13:00:00'),
      generate: async () => (n++ ? Promise.reject(new AiError('busy', 'busy')) : reply(XIAN_READ)),
      readPage: async (url) => (url.endsWith('/menu') ? XIAN_MENU : XIAN_HOME),
    });
    expect(log.foods.map((f) => f.basis)).toEqual(['estimate', 'estimate']);
  });

  it('gives the inbox’s shape, leaving out anything set to zero', () => {
    const foods = toInboxFoods({
      kind: 'menu',
      date: '2026-11-25',
      meal: 'dinner',
      dated: true,
      timed: true,
      foods: [
        { quantity: 0, basis: 'estimate', food: { name: 'Soup', serving: { label: '1 bowl', macros: { kcal: 200, protein: 5, carbs: 20, fat: 10 } } } },
        { quantity: 2, basis: 'official', source: { url: SPICY, title: 'x' }, food: { name: 'Burger', brand: 'B', serving: { label: '1 burger', macros: { kcal: 782, protein: 28, carbs: 70, fat: 42 } } } },
      ],
    });
    expect(foods).toEqual([{ kind: 'food', date: '2026-11-25', meal: 'dinner', quantity: 2, source: SPICY, food: { name: 'Burger', brand: 'B', serving: { label: '1 burger', macros: { kcal: 782, protein: 28, carbs: 70, fat: 42 } } } }]);
  });
});

describe('logging foods from a photo', () => {
  let db: ZoroDB;
  beforeEach(async () => {
    db = new ZoroDB(`test-${Math.random()}`);
    setDB(db);
    await saveSettings({ programStart: today(), benchBlockStart: today() }, db);
  });

  it('logs each food like an inbox food, with where its numbers came from', async () => {
    const serving = { label: '1 bowl', grams: 600, macros: { kcal: 1047, protein: 57, carbs: 103, fat: 46, fiber: 3 } };
    const ids = await logFoods([{ kind: 'food', date: today(), meal: 'lunch', quantity: 2, food: { name: 'Teriyaki Chicken Bowl', brand: 'Blaze Teriyaki', serving }, source: SPICY }], db);
    expect(ids).toHaveLength(1);
    const [e] = await entriesFor(today(), db);
    expect(e).toMatchObject({ name: 'Teriyaki Chicken Bowl (Blaze Teriyaki)', meal: 'lunch', quantity: 2, unit: 'serving', macros: { kcal: 2094, protein: 114, fiber: 6 } });
    expect(e.inboxId).toBeUndefined();
    expect(await db.foods.get(e.foodId!)).toMatchObject({ url: SPICY, serving });
    await expect(logFoods([{ kind: 'food', date: today(), meal: 'brunch' as 'lunch', quantity: 1, food: { name: 'x', serving } }], db)).rejects.toThrow();
  });
});

// ---------- The Gemini client, with fetch and WebSocket mocked ----------

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fail = (status: number, message: string, reason?: string) =>
  new Response(JSON.stringify({ error: { code: status, message, details: reason ? [{ reason }] : [] } }), { status });

describe('gemini client', () => {
  it('sends the key in a header only, and returns the answer without its thoughts', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      ok({
        candidates: [
          {
            content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"a":1}' }] },
            urlContextMetadata: { urlMetadata: [{ retrievedUrl: SPICY, urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS' }] },
          },
        ],
      }),
    );
    const r = await generate({ key: 'AIzaSECRET', parts: [{ text: 'hi' }], schema: { type: 'object' }, urlContext: true, fetch: fetchMock as typeof fetch });
    expect(r).toEqual({ text: '{"a":1}', urls: [{ url: SPICY, ok: true }], sources: [], model: 'gemini-4-hydrogen' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain('SECRET');
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('AIzaSECRET');
    expect(JSON.parse(init!.body as string)).toMatchObject({ tools: [{ urlContext: {} }], generationConfig: { responseFormat: { text: { mimeType: 'APPLICATION_JSON' } } } });
  });

  it('asks for JSON another way when a model won’t take the schema', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fail(400, 'Invalid JSON payload received. Unknown name "responseFormat"'))
      .mockResolvedValueOnce(ok({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }));
    await generate({ key: 'k', parts: [{ text: 'hi' }], schema: { type: 'object' }, fetch: fetchMock as typeof fetch });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).generationConfig).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } });
  });

  it('tries the next model when one is busy or out of free quota', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fail(503, 'This model is currently experiencing high demand.'))
      .mockResolvedValueOnce(fail(429, 'Resource has been exhausted.'))
      .mockResolvedValueOnce(ok({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }));
    const r = await generate({ key: 'k', model: ['a', 'b', 'c'], parts: [{ text: 'hi' }], fetch: fetchMock as typeof fetch });
    expect(r).toMatchObject({ text: 'OK', model: 'c' });
    expect(fetchMock.mock.calls.map(([url]) => String(url).match(/models\/(\w+):/)?.[1])).toEqual(['a', 'b', 'c']);
  });

  it('explains a bad key, a used-up quota and no connection', async () => {
    const call = (res: Response | Error) =>
      generate({ key: 'k', model: 'm', parts: [{ text: 'hi' }], fetch: (async () => (res instanceof Error ? Promise.reject(res) : res)) as typeof fetch });
    await expect(call(fail(400, 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID'))).rejects.toMatchObject({ kind: 'key' });
    await expect(call(fail(429, 'Resource has been exhausted (e.g. check quota).'))).rejects.toMatchObject({ kind: 'quota' });
    await expect(call(new TypeError('Failed to fetch'))).rejects.toMatchObject({ kind: 'network' });
  });

  it('searches with a Live session on a one-use token, and returns what it reports', async () => {
    const sent: unknown[] = [];
    let opened = '';
    class FakeSocket {
      onopen: (() => void) | null = null;
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: ((ev: { reason: string }) => void) | null = null;
      constructor(url: string) {
        opened = url;
        setTimeout(() => this.onopen?.(), 0);
      }
      send(data: string) {
        const msg = JSON.parse(data);
        sent.push(msg);
        const reply = (o: unknown) => setTimeout(() => this.onmessage?.({ data: new Blob([JSON.stringify(o)]) }), 0);
        if (msg.setup) reply({ setupComplete: {} });
        if (msg.clientContent) {
          reply({ serverContent: { groundingMetadata: { groundingChunks: [{ web: { uri: 'https://redirect/1', title: 'xianfoods.com' } }] } } });
          reply({ toolCall: { functionCalls: [{ id: '1', name: 'report_nutrition', args: { sources: [{ url: SPICY }], items: [] } }] } });
        }
      }
      close() {}
    }
    const fetchMock = vi.fn(async () => ok({ name: 'auth_tokens/one-use' }));
    const r = await liveSearch({
      key: 'AIzaSECRET',
      prompt: 'find it',
      report: { name: 'report_nutrition', description: '', parameters: {} },
      fetch: fetchMock as typeof fetch,
      WebSocket: FakeSocket as unknown as typeof WebSocket,
    });
    expect(opened).toContain('access_token=auth_tokens%2Fone-use');
    expect(opened).not.toContain('SECRET');
    expect(sent[0]).toMatchObject({ setup: { model: 'models/gemini-2.5-flash-native-audio-latest', tools: [{ googleSearch: {} }, { functionDeclarations: [{ name: 'report_nutrition' }] }] } });
    expect(r).toEqual({ args: { sources: [{ url: SPICY }], items: [] }, sources: [{ uri: 'https://redirect/1', title: 'xianfoods.com' }], transcript: '' });
  });
});
