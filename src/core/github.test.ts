import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromBase64, gunzip, gzip, readRemote, toBase64, writeRemote, type RemoteBackup } from './github';

const cfg = { token: 'test-token', repo: 'me/zoro-data' };
const backup: RemoteBackup = { app: 'zoro', version: 1, exportedAt: '2026-11-25T12:00:00.000Z', tables: { water: [{ id: 1, date: '2026-11-25', oz: 16, at: 1 }] }, device: 'phone' };

afterEach(() => vi.unstubAllGlobals());

describe('GitHub backup', () => {
  it('round-trips gzip and base64', async () => {
    const text = JSON.stringify(backup);
    const b64 = toBase64(await gzip(text));
    expect(await gunzip(fromBase64(b64))).toBe(text);
  });

  it('writes and reads back the same backup', async () => {
    let stored: string | null = null;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.github.com/repos/me/zoro-data/contents/zoro-backup.json.gz');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
      if (init?.method === 'PUT') {
        stored = JSON.parse(init.body as string).content;
        return new Response(JSON.stringify({ content: { sha: 'abc' } }), { status: 201 });
      }
      return stored ? new Response(JSON.stringify({ sha: 'abc', content: stored, encoding: 'base64' })) : new Response('{}', { status: 404 });
    });
    expect(await readRemote(cfg)).toBeNull();
    expect(await writeRemote(cfg, backup)).toBe('abc');
    const remote = await readRemote(cfg);
    expect(remote?.sha).toBe('abc');
    expect(remote?.backup).toEqual(backup);
  });

  it('reports a stale copy as a conflict and a bad token as auth', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 409 }));
    await expect(writeRemote(cfg, backup, 'old')).rejects.toMatchObject({ kind: 'conflict' });
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    await expect(readRemote(cfg)).rejects.toMatchObject({ kind: 'auth' });
  });
});
