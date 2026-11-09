/**
 * Durable persistence bridge: SQLite on desktop, localStorage in the browser.
 *
 * The desktop shell reads and writes every persisted blob through the Rust
 * `kv` table (`db_get`/`db_set`, `src-tauri/src/db.rs`) instead of webview
 * localStorage, which is invisible to Rust, bound to the webview profile and
 * silently size-limited. Keys keep their `vlc.*.v1` names so existing store
 * modules migrate without reshaping data.
 *
 * Legacy migration: on the first desktop run for a given key, when SQLite has
 * no entry yet but localStorage does, the blob is copied into SQLite and
 * returned, so a user's data survives the move. localStorage is left intact
 * as a redundant backup and is never consulted again once SQLite answers.
 */
import { hasTauri, invokeCommand } from './tauriFs';

function readLegacy(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  } catch {
    // Private mode or storage disabled: behave as if unset.
    return null;
  }
}

/**
 * Load a stored JSON blob for `key`. SQLite answers first on the desktop;
 * a missing entry falls back to one-time migration from webview storage.
 */
export async function loadPersistedRaw(key: string): Promise<string | null> {
  if (!hasTauri()) return readLegacy(key);

  const stored = await invokeCommand<string | null>('db_get', { key });
  if (stored !== null) return stored;

  const legacy = readLegacy(key);
  if (legacy !== null) {
    await savePersistedRaw(key, legacy);
    return legacy;
  }

  return null;
}

/**
 * Persist a JSON blob for `key` under the active backend. Failures degrade to
 * memory-only state exactly like the previous localStorage path did.
 */
export async function savePersistedRaw(key: string, value: string): Promise<void> {
  if (!hasTauri()) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Quota exceeded or storage blocked: settings stay in memory only.
    }
    return;
  }

  await invokeCommand('db_set', { key, value });
}

/**
 * Serialize saves for one key so they never land in SQLite out of order, and
 * collapse bursts (every write while another is in flight is coalesced to the
 * newest value). The returned writer never rejects; failures degrade exactly
 * like `savePersistedRaw`.
 */
export function createKeyWriter(key: string): (value: string) => Promise<void> {
  let chain: Promise<unknown> = Promise.resolve();
  let pending: string | null = null;

  return (value) => {
    pending = value;

    const write = (): Promise<void> => {
      const next = pending;
      pending = null;
      if (next === null) return Promise.resolve();
      return savePersistedRaw(key, next).catch(() => {
        // Keep the queue alive; the next iteration still writes.
      });
    };

    const nextChain = chain.then(write, write);
    chain = nextChain;
    return nextChain;
  };
}
