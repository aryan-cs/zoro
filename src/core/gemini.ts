/**
 * Google's Gemini API, called straight from the phone with your own free key from AI Studio, so
 * there's no server in between (as with the GitHub backup). Photo logging (photoLog.ts) uses it.
 *
 * Free tier, as measured on a new key in November 2026: the current models (gemini-4-hydrogen,
 * gemini-3.8-flash…) take images and PDFs and can read web pages by URL (URL context), all free.
 * Google Search grounding is not free on them (it answers 429), and gemini-3.8-live has no free
 * quota either, but the native-audio Live model does search Google for free. So the search step
 * opens a Live session over a WebSocket and asks the model to report back through a function.
 * Free requests are the first turned away when a model is busy (503), so each request tries the
 * next model in its list when one is busy, out of quota or gone.
 *
 * The key is sent only in the x-goog-api-key header, never in a URL; the Live session gets a
 * one-use token instead.
 */

/** Free models to ask when a caller names none, best first; later ones are fallbacks (photoLog.ts picks its own per step). */
export const GEMINI_MODELS = ['gemini-4-hydrogen', 'gemini-3-flash-preview', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];
export const GEMINI_MODEL = GEMINI_MODELS[0];
/** How long one request may take before the next model is tried. */
const REQUEST_MS = 60_000;
/** Live models that can search, tried in turn. */
export const GEMINI_LIVE_MODELS = ['gemini-2.5-flash-native-audio-latest', 'gemini-3.8-live'];
const HOST = 'generativelanguage.googleapis.com';
const API = `https://${HOST}/v1beta`;

export type AiErrorKind = 'key' | 'quota' | 'network' | 'blocked' | 'unsupported' | 'busy' | 'other';

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: AiErrorKind,
    readonly status?: number,
  ) {
    super(message);
  }
}

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface GenerateArgs {
  key: string;
  /** A model, or models to try in turn (default GEMINI_MODELS). */
  model?: string | string[];
  parts: Part[];
  system?: string;
  /** JSON Schema the reply must match. */
  schema?: object;
  /** Let the model read the web pages and PDFs named in the prompt. */
  urlContext?: boolean;
  /** Google Search grounding (paid tier only on current models). */
  search?: boolean;
  thinking?: 'low' | 'medium' | 'high';
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

export interface GenerateResult {
  text: string;
  /** Pages the URL context tool tried, and whether it got them. */
  urls: { url: string; ok: boolean }[];
  /** Search results the answer was grounded on. */
  sources: { uri: string; title?: string }[];
  /** The model that answered. */
  model: string;
}

interface ApiError {
  error?: { code?: number; message?: string; status?: string; details?: { reason?: string }[] };
}

/** Turn an HTTP error from the API into something the app can explain. */
export function apiError(status: number, body: ApiError | null): AiError {
  const message = body?.error?.message ?? '';
  const reason = body?.error?.details?.map((d) => d.reason).join(' ') ?? '';
  if (/API_KEY_INVALID|API key not valid|API_KEY_EXPIRED|expired/i.test(`${reason} ${message}`) || status === 401) {
    return new AiError('Google didn’t accept your Gemini key. Check it in Settings.', 'key', status);
  }
  if (status === 429) return new AiError('Your free Gemini limit is used up for now. Try again later.', 'quota', status);
  if (status === 403) return new AiError('This Gemini key can’t use that model. Check it in Settings.', 'key', status);
  if (status === 404) return new AiError('That Gemini model isn’t available.', 'unsupported', status);
  if (status === 500 || status === 502 || status === 503 || status === 504) return new AiError('Gemini is busy. Try again in a moment.', 'busy', status);
  if (status === 400 && /search|grounding|tool|response_?format|schema|mime/i.test(message)) return new AiError(message, 'unsupported', status);
  return new AiError(message ? `Gemini: ${message}` : `Gemini error (${status}).`, 'other', status);
}

interface Candidate {
  content?: { parts?: { text?: string; thought?: boolean }[] };
  finishReason?: string;
  urlContextMetadata?: { urlMetadata?: { retrievedUrl?: string; urlRetrievalStatus?: string }[] };
  groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
}

type Reply = { candidates?: Candidate[]; promptFeedback?: { blockReason?: string } };

/** One request to one model, given up on after REQUEST_MS. */
async function postTo(a: GenerateArgs, model: string, body: object): Promise<Reply> {
  const go = a.fetch ?? fetch;
  const timeout = AbortSignal.timeout(REQUEST_MS);
  let res: Response;
  try {
    res = await go(`${API}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': a.key },
      body: JSON.stringify(body),
      signal: a.signal ? AbortSignal.any([a.signal, timeout]) : timeout,
    });
  } catch (err) {
    if (a.signal?.aborted) throw err;
    if (timeout.aborted) throw new AiError('Gemini is taking too long. Try again in a moment.', 'busy');
    throw new AiError('Can’t reach Gemini. Check your connection.', 'network');
  }
  const json = (await res.json().catch(() => null)) as (ApiError & Reply) | null;
  if (res.ok && json) return json;
  throw apiError(res.status, json);
}

/** Ask each model in turn until one answers: the next is tried when one is busy, out of free quota or gone. */
async function post(a: GenerateArgs, body: object): Promise<Reply & { model: string }> {
  const models = Array.isArray(a.model) ? a.model : a.model ? [a.model] : GEMINI_MODELS;
  let last: AiError | undefined;
  for (const model of models) {
    try {
      return { ...(await postTo(a, model, body)), model };
    } catch (err) {
      const next = err instanceof AiError && (err.kind === 'busy' || err.kind === 'quota' || err.status === 404);
      if (!next) throw err;
      last = err;
    }
  }
  throw last ?? new AiError('No Gemini model to ask.', 'unsupported');
}

/**
 * Ask Gemini. With a schema it asks for JSON in that shape; if this model won't take the schema
 * alongside its tools, it asks again without it (the prompt still asks for JSON).
 */
export async function generate(a: GenerateArgs): Promise<GenerateResult> {
  const tools = [...(a.search ? [{ googleSearch: {} }] : []), ...(a.urlContext ? [{ urlContext: {} }] : [])];
  const base = {
    contents: [{ role: 'user', parts: a.parts }],
    ...(a.system ? { systemInstruction: { parts: [{ text: a.system }] } } : {}),
    ...(tools.length ? { tools } : {}),
  };
  const thinking = a.thinking ? { thinkingConfig: { thinkingLevel: a.thinking.toUpperCase() } } : {};
  const formats: object[] = a.schema
    ? [
        { responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema: a.schema } } },
        { responseMimeType: 'application/json', responseJsonSchema: a.schema },
        {},
      ]
    : [{}];
  let data: Awaited<ReturnType<typeof post>> | undefined;
  for (let i = 0; i < formats.length; i++) {
    try {
      data = await post(a, { ...base, generationConfig: { ...formats[i], ...thinking } });
      break;
    } catch (err) {
      // A 400 about the output format: try the next way of asking for JSON.
      if (!(err instanceof AiError) || err.status !== 400 || err.kind === 'key' || i === formats.length - 1) throw err;
    }
  }
  if (data?.promptFeedback?.blockReason) throw new AiError('Gemini wouldn’t look at this photo.', 'blocked');
  const c = data?.candidates?.[0];
  if (!c) throw new AiError('Gemini sent back nothing.', 'other');
  if (c.finishReason === 'SAFETY' || c.finishReason === 'PROHIBITED_CONTENT') throw new AiError('Gemini wouldn’t look at this photo.', 'blocked');
  return {
    text: (c.content?.parts ?? []).filter((p) => !p.thought && p.text).map((p) => p.text).join(''),
    urls: (c.urlContextMetadata?.urlMetadata ?? []).map((m) => ({ url: m.retrievedUrl ?? '', ok: m.urlRetrievalStatus === 'URL_RETRIEVAL_STATUS_SUCCESS' })),
    sources: (c.groundingMetadata?.groundingChunks ?? []).flatMap((g) => (g.web?.uri ? [{ uri: g.web.uri, title: g.web.title }] : [])),
    model: data!.model,
  };
}

/** Check a key before saving it (old "AIza…" keys and new "AQ." ones alike): Google has to accept it. */
export async function checkKey(key: string, go: typeof fetch = fetch): Promise<void> {
  let res: Response;
  try {
    res = await go(`${API}/models/${GEMINI_MODEL}`, { headers: { 'x-goog-api-key': key } });
  } catch {
    throw new AiError('Can’t reach Google. Check your connection.', 'network');
  }
  if (!res.ok) {
    const err = apiError(res.status, (await res.json().catch(() => null)) as ApiError | null);
    throw err.kind === 'key' || res.status === 400 ? new AiError('Google didn’t accept this key. Copy it again from AI Studio.', 'key', res.status) : err;
  }
}

// ---------- Live session with Google Search ----------

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: object;
}

export interface LiveSearchArgs {
  key: string;
  /** A Live model, or models to try in turn (default GEMINI_LIVE_MODELS). */
  model?: string | string[];
  prompt: string;
  system?: string;
  /** The function the model reports its findings through. */
  report: FunctionDeclaration;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
}

export interface LiveSearchResult {
  /** What the model passed to `report` (null if it never called it). */
  args: unknown;
  /** Search results it saw. */
  sources: { uri: string; title?: string }[];
  /** What it said out loud instead, if anything. */
  transcript: string;
}

/** A one-use token for a Live session, so the key itself never goes in a URL. */
async function liveToken(a: LiveSearchArgs): Promise<string> {
  const go = a.fetch ?? fetch;
  let res: Response;
  try {
    res = await go(`${API}/auth_tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': a.key },
      body: JSON.stringify({ uses: 1 }),
      signal: a.signal,
    });
  } catch {
    throw new AiError('Can’t reach Gemini. Check your connection.', 'network');
  }
  const json = (await res.json().catch(() => null)) as (ApiError & { name?: string }) | null;
  if (!res.ok || !json?.name) throw apiError(res.status, json);
  return json.name;
}

async function messageText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data;
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return String(data);
}

/**
 * Search the web with a Live model: it gets `prompt`, may search Google as often as it likes, and
 * should then call `report`. Resolves when it does (or when its turn ends without it). A model
 * with no free quota is skipped for the next one.
 */
export async function liveSearch(a: LiveSearchArgs): Promise<LiveSearchResult> {
  const models = Array.isArray(a.model) ? a.model : a.model ? [a.model] : GEMINI_LIVE_MODELS;
  let last: AiError | undefined;
  for (const model of models) {
    try {
      return await liveSession(a, model);
    } catch (err) {
      if (!(err instanceof AiError) || (err.kind !== 'quota' && err.kind !== 'unsupported')) throw err;
      last = err;
    }
  }
  throw last ?? new AiError('No Gemini Live model to ask.', 'unsupported');
}

async function liveSession(a: LiveSearchArgs, model: string): Promise<LiveSearchResult> {
  const token = await liveToken(a);
  const WS = a.WebSocket ?? WebSocket;
  const url = `wss://${HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;
  return new Promise<LiveSearchResult>((resolve, reject) => {
    const ws = new WS(url);
    const sources: LiveSearchResult['sources'] = [];
    let transcript = '';
    let done = false;
    const finish = (r: LiveSearchResult | AiError) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      a.signal?.removeEventListener('abort', onAbort);
      try {
        ws.close();
      } catch {
        // already closed
      }
      if (r instanceof AiError) reject(r);
      else resolve(r);
    };
    const onAbort = () => finish(new AiError('Cancelled.', 'other'));
    a.signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => finish({ args: null, sources, transcript }), a.timeoutMs ?? 45_000);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${model}`,
            generationConfig: { responseModalities: ['AUDIO'] },
            ...(a.system ? { systemInstruction: { parts: [{ text: a.system }] } } : {}),
            tools: [{ googleSearch: {} }, { functionDeclarations: [a.report] }],
            outputAudioTranscription: {},
          },
        }),
      );
    };
    ws.onmessage = (ev: MessageEvent) => {
      void messageText(ev.data).then((text) => {
        let msg: {
          setupComplete?: object;
          toolCall?: { functionCalls?: { id?: string; name?: string; args?: unknown }[] };
          serverContent?: { turnComplete?: boolean; outputTranscription?: { text?: string }; groundingMetadata?: Candidate['groundingMetadata'] };
          error?: ApiError['error'];
        };
        try {
          msg = JSON.parse(text);
        } catch {
          return;
        }
        if (msg.setupComplete) {
          ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: a.prompt }] }], turnComplete: true } }));
        }
        const sc = msg.serverContent;
        for (const g of sc?.groundingMetadata?.groundingChunks ?? []) if (g.web?.uri) sources.push({ uri: g.web.uri, title: g.web.title });
        if (sc?.outputTranscription?.text) transcript += sc.outputTranscription.text;
        const call = msg.toolCall?.functionCalls?.find((f) => f.name === a.report.name);
        if (call) finish({ args: call.args ?? null, sources, transcript });
        else if (sc?.turnComplete) finish({ args: null, sources, transcript });
      });
    };
    ws.onerror = () => finish(new AiError('Can’t reach Gemini Live.', 'network'));
    ws.onclose = (ev: CloseEvent) => {
      if (done) return;
      const reason = ev.reason ?? '';
      if (/quota|exhausted|rate/i.test(reason)) finish(new AiError('Your free Gemini limit is used up for now. Try again later.', 'quota'));
      else if (/key|token|auth|permission/i.test(reason)) finish(new AiError('Google didn’t accept your Gemini key.', 'key'));
      else if (/model|not found|not supported/i.test(reason)) finish(new AiError(reason, 'unsupported'));
      else finish({ args: null, sources, transcript });
    };
  });
}
