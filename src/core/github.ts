import type { Backup } from './store';

/**
 * Backups to a private GitHub repo. The app talks to GitHub directly with a fine-grained
 * token that can only read and write that one repo, so there's no server in between.
 */

export const BACKUP_FILE = 'zoro-backup.json.gz';
const API = 'https://api.github.com';

export interface GitHubConfig {
  token: string;
  /** owner/name */
  repo: string;
}

export type SyncErrorKind = 'auth' | 'repo' | 'public' | 'permission' | 'conflict' | 'network' | 'other';

export class SyncError extends Error {
  constructor(
    message: string,
    readonly kind: SyncErrorKind,
  ) {
    super(message);
  }
}

/** A backup plus which phone wrote it. */
export type RemoteBackup = Backup & { device?: string };

export interface Remote {
  sha: string;
  backup: RemoteBackup;
}

async function call(cfg: GitHubConfig, path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new SyncError("Can't reach GitHub. Check your connection.", 'network');
  }
  if (res.status === 401) throw new SyncError('GitHub rejected the token. It may have expired; make a new one.', 'auth');
  return res;
}

const contentsPath = (cfg: GitHubConfig) => `/repos/${cfg.repo}/contents/${BACKUP_FILE}`;

/** Make sure the token can open the repo and that the repo is private. */
export async function checkRepo(cfg: GitHubConfig): Promise<void> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) throw new SyncError('Repo should look like your-name/zoro-data.', 'repo');
  const res = await call(cfg, `/repos/${cfg.repo}`);
  if (res.status === 404 || res.status === 403) throw new SyncError(`This token can't open ${cfg.repo}. Pick that repo when you make the token.`, 'repo');
  if (!res.ok) throw new SyncError(`GitHub error (${res.status}).`, 'other');
  const repo = (await res.json()) as { private?: boolean };
  if (!repo.private) throw new SyncError(`${cfg.repo} is public. Use a private repo so only you can see your data.`, 'public');
}

export async function readRemote(cfg: GitHubConfig): Promise<Remote | null> {
  const res = await call(cfg, contentsPath(cfg));
  if (res.status === 404) return null;
  if (!res.ok) throw new SyncError(`GitHub error (${res.status}).`, 'other');
  const meta = (await res.json()) as { sha: string; content?: string; encoding?: string };
  let bytes: Uint8Array<ArrayBuffer>;
  if (meta.content && meta.encoding === 'base64') {
    bytes = fromBase64(meta.content);
  } else {
    // Over 1 MB the JSON response leaves the content out; ask for the raw file.
    const raw = await call(cfg, contentsPath(cfg), { headers: { Accept: 'application/vnd.github.raw' } });
    if (!raw.ok) throw new SyncError(`GitHub error (${raw.status}).`, 'other');
    bytes = new Uint8Array(await raw.arrayBuffer());
  }
  return { sha: meta.sha, backup: JSON.parse(await gunzip(bytes)) as RemoteBackup };
}

/** Write the backup. Pass the sha of the copy you're replacing; returns the new sha. */
export async function writeRemote(cfg: GitHubConfig, backup: RemoteBackup, sha?: string): Promise<string> {
  const content = toBase64(await gzip(JSON.stringify(backup)));
  const res = await call(cfg, contentsPath(cfg), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Backup ${backup.exportedAt.slice(0, 16).replace('T', ' ')}`, content, ...(sha ? { sha } : {}) }),
  });
  // 409: the sha is stale. 422: a file exists but no sha was sent.
  if (res.status === 409 || res.status === 422) throw new SyncError('GitHub has a different copy of your data.', 'conflict');
  if (res.status === 403 || res.status === 404) throw new SyncError("This token can't save to the repo. Give it Contents: Read and write.", 'permission');
  if (!res.ok) throw new SyncError(`GitHub error (${res.status}).`, 'other');
  const data = (await res.json()) as { content: { sha: string } };
  return data.content.sha;
}

/** A file in the repo. */
export interface RepoFile {
  name: string;
  path: string;
  sha: string;
}

/** The files in one folder of the repo (none if the folder isn't there yet). */
export async function listFolder(cfg: GitHubConfig, folder: string): Promise<RepoFile[]> {
  const res = await call(cfg, `/repos/${cfg.repo}/contents/${folder}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new SyncError(`GitHub error (${res.status}).`, 'other');
  const items = (await res.json()) as { type?: string; name: string; path: string; sha: string }[];
  return Array.isArray(items) ? items.filter((i) => i.type === 'file').map(({ name, path, sha }) => ({ name, path, sha })) : [];
}

/** A text file's contents. */
export async function readText(cfg: GitHubConfig, path: string): Promise<string> {
  const res = await call(cfg, `/repos/${cfg.repo}/contents/${path}`, { headers: { Accept: 'application/vnd.github.raw' } });
  if (!res.ok) throw new SyncError(`GitHub error (${res.status}).`, 'other');
  return res.text();
}

/** Delete a file (already gone is fine). */
export async function deleteFile(cfg: GitHubConfig, file: RepoFile, message: string): Promise<void> {
  const res = await call(cfg, `/repos/${cfg.repo}/contents/${file.path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha: file.sha }),
  });
  if (!res.ok && res.status !== 404) throw new SyncError(`GitHub error (${res.status}).`, 'other');
}

/** Just the sha of the current backup, or null if there isn't one. */
export async function remoteSha(cfg: GitHubConfig): Promise<string | null> {
  const res = await call(cfg, contentsPath(cfg));
  if (res.status === 404) return null;
  if (!res.ok) throw new SyncError(`GitHub error (${res.status}).`, 'other');
  return ((await res.json()) as { sha: string }).sha;
}

// ---------- encoding ----------

export async function gzip(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
