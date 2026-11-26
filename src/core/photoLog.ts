import { addDays, toISODate } from './calc';
import { AiError, generate, liveSearch, type FunctionDeclaration, type GenerateArgs, type GenerateResult, type LiveSearchResult, type Part } from './gemini';
import type { InboxFood } from './store';
import type { ISODate, Macros, Meal } from './types';

/**
 * Log food from a photo: a receipt, a delivery app's order, a plate, a Nutrition Facts label or a
 * menu. Only the photo goes to Gemini (with your own free key), in three steps:
 *
 * 1. Read: what's in it (each item, how many, the restaurant or brand, the date and time), with a
 *    first estimate of each item's nutrition, or the label's own numbers.
 * 2. Find: the restaurant's or brand's official nutrition facts. Zoro looks through its website for
 *    a nutrition page or PDF, and a Gemini Live session searches Google (the free way to search).
 * 3. Check: Gemini reads those documents and copies each item's numbers. Anything they don't
 *    list keeps its estimate, marked as one.
 */

export type PhotoKind = 'receipt' | 'order' | 'meal' | 'label' | 'menu' | 'other';

/**
 * Which free models each step asks first, from the harness's runs on the two test photos (Nov
 * 2026): gemini-4-hydrogen estimated best (Blaze bowl within 4% of the hand-checked calories;
 * flash-lite was 22% low) and all three copied the Xi'an PDF exactly. The two steps start on
 * different models because each model has its own free quota. Later ones are fallbacks for when
 * a model is busy or out of quota (gemini-3.8-flash mostly answers 503 on the free tier).
 */
export const READ_MODELS = ['gemini-4-hydrogen', 'gemini-3-flash-preview', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];
export const CHECK_MODELS = ['gemini-3-flash-preview', 'gemini-4-hydrogen', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];

/** Where an item's numbers came from. */
export type Basis = 'official' | 'label' | 'estimate';

/** One food to log from the photo, in the inbox's shape (date and meal are the photo's). */
export interface PhotoFood {
  /** How many servings; 0 leaves it out (a menu's dishes start at 0 until you pick one). */
  quantity: number;
  food: InboxFood['food'];
  /** Options printed with it ("Extra Spicy", "Fried Rice"). */
  details?: string;
  basis: Basis;
  /** The page or PDF its numbers came from. */
  source?: { url: string; title: string };
}

export interface PhotoLog {
  kind: PhotoKind;
  restaurant?: string;
  date: ISODate;
  meal: Meal;
  /** Whether the date and meal came from the photo (else from now). */
  dated: boolean;
  timed: boolean;
  foods: PhotoFood[];
}

export type PhotoStep = 'read' | 'find' | 'check';

/** What the pipeline calls out to; the app and the test harness pass real ones, tests mocks. */
export interface PhotoDeps {
  generate: (a: Omit<GenerateArgs, 'key'>) => Promise<GenerateResult>;
  /** Search Google through a Gemini Live session. */
  search?: (a: { prompt: string; system?: string; report: FunctionDeclaration; signal?: AbortSignal }) => Promise<LiveSearchResult>;
  /** A web page as Markdown, links included (r.jina.ai's free reader). */
  readPage?: (url: string) => Promise<string>;
  /** A PDF's bytes, when the site lets the browser fetch it directly. */
  fetchFile?: (url: string) => Promise<{ mimeType: string; data: string } | null>;
  now?: () => Date;
  onStep?: (step: PhotoStep, detail?: string) => void;
  /** Diagnostics for the test harness. */
  trace?: (what: string, data: unknown) => void;
}

// ---------- Small helpers ----------

/** Breakfast before 11, lunch until 3, dinner until 9; late night and small hours are snacks. */
export function mealForHour(h: number): Meal {
  return h < 4 ? 'snack' : h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}

/** The first JSON object in a reply (it may come wrapped in a code fence or a sentence). */
export function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start < 0 || end <= start) throw new AiError('Gemini’s reply wasn’t readable. Try again.', 'other');
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      throw new AiError('Gemini’s reply wasn’t readable. Try again.', 'other');
    }
  }
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function macrosOf(o: Record<string, unknown>): Macros {
  return { kcal: Math.round(num(o.kcal)), protein: r1(num(o.protein)), carbs: r1(num(o.carbs)), fat: r1(num(o.fat)), fiber: r1(num(o.fiber)) };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** "xianfoods.com", "https://www.xianfoods.com/menu" → "https://www.xianfoods.com". */
export function siteRoot(site: string | undefined): string | null {
  const s = site?.trim();
  if (!s || /\s/.test(s)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.hostname.includes('.') ? `${u.protocol}//${u.hostname}` : null;
  } catch {
    return null;
  }
}

// ---------- Step 1: read the photo ----------

interface ReadItem {
  name: string;
  code?: string;
  details?: string;
  quantity: number;
  serving: string;
  grams?: number;
  macros: Macros;
  fromPhoto: boolean;
  /** How an estimate was worked out (for the harness's eyes). */
  breakdown?: string;
}

export interface PhotoRead {
  kind: PhotoKind;
  restaurant?: string;
  website?: string;
  date?: string;
  time?: string;
  items: ReadItem[];
}

const KINDS: PhotoKind[] = ['receipt', 'order', 'meal', 'label', 'menu', 'other'];

const NUTRITION_PROPS = {
  grams: { type: 'number', description: 'Weight of one serving in grams.' },
  kcal: { type: 'number' },
  protein: { type: 'number', description: 'grams' },
  carbs: { type: 'number', description: 'Total carbohydrate, grams' },
  fat: { type: 'number', description: 'Total fat, grams' },
  fiber: { type: 'number', description: 'Dietary fiber, grams' },
};

export const READ_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: KINDS },
    restaurant: { type: 'string' },
    website: { type: 'string' },
    date: { type: 'string', description: 'YYYY-MM-DD, only if printed' },
    time: { type: 'string', description: 'HH:MM, 24-hour, only if printed' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          code: { type: 'string' },
          details: { type: 'string' },
          quantity: { type: 'number' },
          serving: { type: 'string' },
          fromPhoto: { type: 'boolean' },
          breakdown: { type: 'string', description: 'For an estimate: its parts with their weights and calories' },
          ...NUTRITION_PROPS,
        },
        required: ['name', 'quantity', 'serving', 'kcal', 'protein', 'carbs', 'fat', 'fromPhoto'],
      },
    },
  },
  required: ['kind', 'items'],
};

const READ_SYSTEM =
  'You read photos of food for a nutrition tracker. Copy what is printed exactly and never invent items. When you estimate nutrition, do it as carefully as a registered dietitian who knows restaurant portions.';

export function readPrompt(now: Date): string {
  const day = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return [
    `It is ${day}, ${time} local time.`,
    'This photo may be a receipt, a delivery app’s order (DoorDash, Uber Eats, Grubhub…), a plate or bowl of food, a packaged food’s Nutrition Facts label, or a menu.',
    '',
    'List every food and drink in it (skip fees, tips, tax, discounts and utensils). For each:',
    '- name: the dish or product as the restaurant or brand calls it, in Title Case, without menu codes, prices or options.',
    '- code: a menu code printed with it, like "B1" from "[B1] Stewed Pork Burger". Omit if none.',
    '- details: options actually printed with it ("Extra Spicy", "Fried Rice", "Large"), comma-separated. Just the options, without the restaurant’s notes about them; omit if none are printed, and don’t add defaults like "Regular".',
    '- quantity: how many were ordered (the number printed beside it; 1 if none). On a menu, use 0 unless a dish is marked as chosen.',
    '- serving: one item in words, like "1 burger", "1 bowl", "1 can (12 fl oz)", "1 cup".',
    '- grams, kcal, protein, carbs, fat, fiber: for ONE serving. If a Nutrition Facts label is shown, copy its per-serving numbers and set fromPhoto to true.',
    '- Otherwise set fromPhoto to false and estimate this restaurant’s or brand’s actual item. First write the breakdown: each part with its weight as this restaurant serves it, cooking oil, butter and sauce included (for example "6 oz carnitas 330 kcal; 1 cup cilantro-lime rice 210 kcal; 2 tbsp sour cream 60 kcal"), then add the parts up. Restaurant and takeout portions are bigger and richer than home cooking; don’t lowball them.',
    '',
    'Also give:',
    '- kind: receipt, order, meal (food itself), label, menu or other.',
    '- restaurant: the restaurant or brand, if shown or obvious.',
    '- website: its official website domain (like "chipotle.com"), only if you are sure of it.',
    '- date: when it was ordered or eaten, as YYYY-MM-DD, only if printed (receipts often print M/D/YY, so 11/26/26 is 2026-11-26).',
    '- time: when it was ordered or eaten, as 24-hour HH:MM, only if printed.',
    '',
    'If there is no food in the photo, return an empty items list. Reply with JSON only.',
  ].join('\n');
}

/** Clean up step 1's reply. */
export function normalizeRead(raw: unknown): PhotoRead {
  const o = (raw ?? {}) as Record<string, unknown>;
  const items = (Array.isArray(o.items) ? o.items : []).flatMap((x): ReadItem[] => {
    const i = (x ?? {}) as Record<string, unknown>;
    const name = str(i.name);
    if (!name) return [];
    const q = Number(i.quantity);
    return [
      {
        name,
        code: str(i.code)?.replace(/^\[|\]$/g, ''),
        details: str(i.details),
        quantity: Number.isFinite(q) && q >= 0 ? Math.min(q, 99) : 1,
        serving: str(i.serving) ?? '1 serving',
        grams: num(i.grams) || undefined,
        macros: macrosOf(i),
        fromPhoto: i.fromPhoto === true,
        breakdown: str(i.breakdown),
      },
    ];
  });
  return {
    kind: KINDS.includes(o.kind as PhotoKind) ? (o.kind as PhotoKind) : 'other',
    restaurant: str(o.restaurant),
    website: str(o.website),
    date: str(o.date),
    time: str(o.time),
    items,
  };
}

// ---------- Step 2: find official nutrition facts ----------

export interface Source {
  url: string;
  title: string;
}

const NUTRITION_WORDS = /nutrition|allergen|calorie/i;

/** A URL's path and query, decoded (its host can't make a link look like a nutrition page). */
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return decodeURIComponent(`${u.pathname}${u.search}`);
  } catch {
    return url;
  }
}

/** Links in a Markdown page: nutrition documents, and pages worth looking through for them. */
export function nutritionLinks(markdown: string, base: string): { docs: Source[]; pages: string[] } {
  const docs: Source[] = [];
  const pages: string[] = [];
  const seen = new Set<string>();
  const baseHost = hostOf(base);
  // [text](url "title"); URLs may hold parentheses of their own ("…Info (SPICY).pdf").
  for (const m of markdown.matchAll(/\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g)) {
    let url: string;
    try {
      url = new URL(m[2], base).href;
    } catch {
      continue;
    }
    if (!/^https?:/.test(url) || seen.has(url)) continue;
    seen.add(url);
    const text = m[1].replace(/[*_`]/g, '').trim();
    const pdf = /\.pdf(\?|#|$)/i.test(url);
    const about = `${text} ${pathOf(url)}`;
    if (NUTRITION_WORDS.test(about)) {
      if (pdf || hostOf(url) === baseHost) docs.push({ url, title: text || hostOf(url) });
    } else if (!pdf && hostOf(url) === baseHost && /\bmenu\b|\bfood\b/i.test(about)) {
      pages.push(url);
    }
  }
  return { docs, pages };
}

const isPdf = (url: string) => /\.pdf(\?|#|$)/i.test(url);

/**
 * Look through a restaurant's pages for its nutrition facts: the links on each page, then one
 * level further into the menu and nutrition pages they link (menu pages often link the PDFs).
 * With nothing found on a home page, the usual /nutrition is tried too.
 */
async function explore(start: string[], readPage: (url: string) => Promise<string>, trace?: PhotoDeps['trace']): Promise<Source[]> {
  const found = new Map<string, Source>();
  const read = new Set<string>();
  const visit = async (urls: string[]) => {
    const todo = urls.filter((u) => !read.has(u) && !isPdf(u)).slice(0, 3);
    todo.forEach((u) => read.add(u));
    const pages = await Promise.allSettled(
      todo.map(async (u) => {
        const md = await readPage(u);
        // A nutrition page with the numbers on it is a source itself.
        if (NUTRITION_WORDS.test(pathOf(u)) && /calori/i.test(md)) found.set(u, { url: u, title: hostOf(u) });
        return nutritionLinks(md, u);
      }),
    );
    const next: string[] = [];
    pages.forEach((r, i) => {
      if (r.status === 'rejected') return trace?.('page failed', { url: todo[i], error: String(r.reason) });
      for (const d of r.value.docs) if (!found.has(d.url)) found.set(d.url, d);
      next.push(...r.value.docs.filter((d) => !isPdf(d.url)).map((d) => d.url), ...r.value.pages);
    });
    return next;
  };
  for (const u of start) if (isPdf(u)) found.set(u, { url: u, title: hostOf(u) });
  const next = await visit(start);
  const home = start.find((u) => siteRoot(u) === u);
  if (!found.size && home && !next.some((u) => /nutrition/i.test(u))) next.push(`${home}/nutrition`);
  await visit(next);
  trace?.('explore', { from: start, found: [...found.values()] });
  return [...found.values()];
}

const REPORT: FunctionDeclaration = {
  name: 'report_nutrition',
  description: 'Report the nutrition sources you found and each item’s numbers from them.',
  parameters: {
    type: 'object',
    properties: {
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: { url: { type: 'string' }, title: { type: 'string' }, official: { type: 'boolean' } },
          required: ['url'],
        },
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { index: { type: 'integer' }, source: { type: 'string' }, serving: { type: 'string' }, ...NUTRITION_PROPS },
          required: ['index'],
        },
      },
    },
    required: ['sources', 'items'],
  },
};

function itemList(read: PhotoRead): string {
  return read.items
    .map((it, i) => `${i + 1}. ${it.name}${it.code ? ` [menu code ${it.code}]` : ''}${it.details ? ` (${it.details})` : ''}`)
    .join('\n');
}

export function searchPrompt(read: PhotoRead): string {
  return [
    `Find the official nutrition facts for these items from ${read.restaurant}${read.website ? ` (${read.website})` : ''}:`,
    itemList(read),
    '',
    'Search Google for the restaurant’s or brand’s own nutrition information: a nutrition PDF or page on its website, or the product’s page. Then call report_nutrition once, with the real addresses of the pages you found (like https://www.example.com/nutrition, never a vertexaisearch.cloud.google.com link), official ones first, and, for each item, the numbers for one serving exactly as the source lists them. Leave out numbers you didn’t find. Don’t speak; just call the function.',
  ].join('\n');
}

// ---------- Step 3: check the numbers against the sources ----------

export const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: 'The item’s number in the list' },
          found: { type: 'boolean' },
          source: { type: 'string', description: 'URL of the document the numbers came from' },
          ...NUTRITION_PROPS,
        },
        required: ['index', 'found', 'source', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'fiber'],
      },
    },
  },
  required: ['items'],
};

export function checkPrompt(read: PhotoRead, docs: Source[], pages: Source[], notes: string): string {
  return [
    `These were ordered from ${read.restaurant ?? 'a restaurant'}:`,
    itemList(read),
    '',
    docs.length ? `Its nutrition documents are attached, each after a line naming its URL.` : '',
    pages.length ? `Read these pages too:\n${pages.map((p) => p.url).join('\n')}` : '',
    notes ? `A web search reported this (unverified; trust the documents over it):\n${notes}` : '',
    '',
    'For each item, find its row in the official nutrition information: match by menu code first, then by name. Sources may come in versions (regular or spicy, sizes): use the version closest to the item’s options (for "Extra Spicy", the spicy version; with no option, the regular or default one). Copy that row’s numbers for ONE serving exactly as printed: serving size in grams, calories, protein, total carbohydrate, total fat and dietary fiber. Give the URL of the document you used as source.',
    'Set found to false only when an item isn’t in any source at all, with 0 for its numbers. Don’t estimate.',
    'Reply with JSON only.',
  ]
    .filter((l, i, all) => l || all[i - 1])
    .join('\n');
}

// ---------- The whole thing ----------

function pickDate(read: PhotoRead, now: Date): { date: ISODate; dated: boolean } {
  const today = toISODate(now);
  const d = read.date;
  // Printed dates in the future or long ago are misreadings: use today's.
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today && d >= addDays(today, -60)) return { date: d, dated: true };
  return { date: today, dated: false };
}

function pickMeal(read: PhotoRead, now: Date): { meal: Meal; timed: boolean } {
  const m = read.time?.match(/^(\d{1,2}):(\d{2})/);
  if (m && Number(m[1]) < 24) return { meal: mealForHour(Number(m[1])), timed: true };
  return { meal: mealForHour(now.getHours()), timed: false };
}

/** Put the order in a few words for the search notes. */
function describe(args: unknown, read: PhotoRead): string {
  const a = (args ?? {}) as { sources?: { url?: string; title?: string }[]; items?: Record<string, unknown>[] };
  const lines = (a.items ?? []).map((i) => {
    const it = read.items[Number(i.index) - 1];
    const m = macrosOf(i);
    return it ? `${it.name}: ${m.kcal} kcal, ${m.protein} g protein, ${m.carbs} g carbs, ${m.fat} g fat, ${m.fiber} g fiber${i.grams ? `, ${num(i.grams)} g` : ''}${str(i.source) ? ` (from ${i.source})` : ''}` : '';
  });
  return lines.filter(Boolean).join('\n');
}

/**
 * Read a photo and look up what's in it. `image` is base64 (JPEG, already made smaller).
 * Throws AiError (no key, no quota, no connection) or returns a log with no foods if it found none.
 */
export async function logFromPhoto(image: { mimeType: string; data: string }, deps: PhotoDeps, signal?: AbortSignal): Promise<PhotoLog> {
  const now = deps.now?.() ?? new Date();
  deps.onStep?.('read');
  const first = await deps.generate({ model: READ_MODELS, parts: [{ text: readPrompt(now) }, { inlineData: image }], system: READ_SYSTEM, schema: READ_SCHEMA, signal });
  const read = normalizeRead(parseJson(first.text));
  deps.trace?.('read', read);
  const { date, dated } = pickDate(read, now);
  const { meal, timed } = pickMeal(read, now);
  const brand = read.restaurant;
  const foods: PhotoFood[] = read.items.map((it) => ({
    quantity: it.quantity,
    food: { name: it.name, brand, serving: { label: it.serving, grams: it.grams, macros: it.macros } },
    details: it.details,
    basis: it.fromPhoto ? 'label' : 'estimate',
  }));
  const result: PhotoLog = { kind: read.kind, restaurant: brand, date, meal, dated, timed, foods };

  // Labels already carry their numbers; home cooking has no official facts to look up.
  const toLookUp = read.items.filter((it) => !it.fromPhoto);
  if (!brand || !toLookUp.length || read.kind === 'label') return result;

  // Step 2: the restaurant's own site and a Google search, side by side. If its site has a
  // nutrition document, that's what we want; the search is only waited on when it doesn't.
  deps.onStep?.('find', brand);
  const root = siteRoot(read.website);
  const searchAbort = new AbortController();
  signal?.addEventListener('abort', () => searchAbort.abort());
  const searching = deps.search
    ? deps.search({ prompt: searchPrompt(read), report: REPORT, signal: searchAbort.signal }).catch((err: unknown) => {
        deps.trace?.('search failed', String(err instanceof Error ? err.message : err));
        return null;
      })
    : Promise.resolve(null);
  const official = `${brand} Nutrition Facts`;
  const sources = new Map<string, Source>();
  const add = (list: Source[], title?: string) => list.forEach((s) => !sources.has(s.url) && sources.set(s.url, { url: s.url, title: title ?? s.title }));
  if (root && deps.readPage) add(await explore([root], deps.readPage, deps.trace), official);
  let notes = '';
  if ([...sources.keys()].some(isPdf) || sources.size >= 2) {
    searchAbort.abort();
  } else {
    const found = await searching;
    deps.trace?.('search', found);
    if (found) {
      notes = describe(found.args, read);
      // Search's own redirect links can't be read by anyone but Google: leave them out.
      const real = (u?: string): u is string => !!u && /^https?:\/\//.test(u) && !/vertexaisearch\.cloud\.google\.com/.test(u);
      const reported = ((found.args as { sources?: { url?: string; title?: string; official?: boolean }[] } | null)?.sources ?? []).flatMap((s) =>
        // Only the restaurant's or brand's own pages: a third-party calorie site is no better than an estimate.
        real(s.url) && s.official !== false ? [{ url: s.url, title: official, about: `${pathOf(s.url)} ${s.title ?? ''}` }] : [],
      );
      // PDFs it found are documents; pages it found (a menu page, say) may link them.
      add(reported.filter((s) => isPdf(s.url)));
      const pages = reported.filter((s) => !isPdf(s.url));
      if (pages.length && deps.readPage) add(await explore(pages.map((s) => s.url), deps.readPage, deps.trace), official);
      // A page that's about nutrition is worth Gemini reading itself (a bare home page isn't).
      if (!sources.size) add(pages.filter((s) => NUTRITION_WORDS.test(s.about)));
      if (!sources.size) add(found.sources.filter((s) => real(s.uri)).slice(0, 4).map((s) => ({ url: s.uri, title: s.title ?? hostOf(s.uri) })));
    }
  }
  // Nothing to read: the estimates stand (numbers a search only mentioned aren't worth trusting).
  if (!sources.size) return result;

  // Step 3: read the documents. PDFs the browser may fetch go in whole (Gemini reads the table
  // itself); everything else goes by URL for Gemini to fetch.
  deps.onStep?.('check', brand);
  const list = [...sources.values()].sort((a, b) => Number(isPdf(b.url)) - Number(isPdf(a.url))).slice(0, 5);
  const files = await Promise.all(list.map((s) => (deps.fetchFile ? deps.fetchFile(s.url).catch(() => null) : Promise.resolve(null))));
  const docs = list.filter((_, i) => files[i]);
  const pages = list.filter((_, i) => !files[i]);
  const parts: Part[] = [{ text: checkPrompt(read, docs, pages, notes) }];
  list.forEach((s, i) => {
    const f = files[i];
    if (f) parts.push({ text: `Document: ${s.url}` }, { inlineData: f });
  });
  let checked: GenerateResult;
  try {
    checked = await deps.generate({ model: CHECK_MODELS, parts, schema: CHECK_SCHEMA, urlContext: pages.length > 0, signal });
  } catch (err) {
    // The estimates still stand; only a missing key or quota is worth stopping for.
    if (err instanceof AiError && (err.kind === 'key' || err.kind === 'quota')) throw err;
    deps.trace?.('check failed', String(err));
    return result;
  }
  deps.trace?.('check', { text: checked.text, urls: checked.urls });
  const reply = parseJson(checked.text) as { items?: Record<string, unknown>[] };
  for (const c of reply.items ?? []) {
    const i = Number(c.index) - 1;
    const f = foods[i];
    const m = macrosOf(c);
    if (!f || f.basis === 'label' || c.found !== true || !m.kcal) continue;
    const url = str(c.source);
    const src = (url && (sources.get(url) ?? list.find((s) => url.includes(s.url) || s.url.includes(url)))) || (url ? { url, title: hostOf(url) } : list[0]);
    // The photo's own words for a serving ("1 burger") stay; the source gives its weight.
    f.food = { ...f.food, serving: { label: f.food.serving.label, grams: num(c.grams) || f.food.serving.grams, macros: m } };
    f.basis = 'official';
    f.source = src ? { url: src.url, title: src.title } : undefined;
  }
  return result;
}

/** The foods to log, in the inbox's shape (left out: anything set to zero). */
export function toInboxFoods(log: PhotoLog): InboxFood[] {
  return log.foods
    .filter((f) => f.quantity > 0)
    .map((f) => ({ kind: 'food', date: log.date, meal: log.meal, quantity: f.quantity, food: f.food, source: f.source?.url }));
}

/** Real dependencies: Gemini with this key, Jina's free reader, and the browser's fetch. */
export function geminiDeps(key: string, extra: Partial<PhotoDeps> = {}): PhotoDeps {
  return {
    generate: (a) => generate({ ...a, key }),
    search: (a) => liveSearch({ ...a, key, timeoutMs: 30_000 }),
    readPage: async (url) => {
      // The links summary keeps the site's navigation links (Menu, Nutrition), which the page text drops.
      const res = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: 'text/markdown', 'X-With-Links-Summary': 'all' } });
      if (!res.ok) throw new Error(`reader ${res.status}`);
      return res.text();
    },
    fetchFile: async (url) => {
      if (!isPdf(url)) return null;
      const res = await fetch(url);
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !/pdf/i.test(type)) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > 15 * 1024 * 1024) return null;
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { mimeType: 'application/pdf', data: btoa(s) };
    },
    ...extra,
  };
}
