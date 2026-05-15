/**
 * Session-level cache for expensive fetches (liked songs, recent tracks).
 * Primed in App.jsx so pages don't wait on first load.
 */
const _cache = {};
const _promises = {};

export const preloadCache = {
  // Start a background fetch; no-op if already in-flight or cached
  prime(key, fetcher) {
    if (key in _cache || key in _promises) return;
    _promises[key] = fetcher()
      .then(d => { _cache[key] = d; })
      .catch(() => {})
      .finally(() => { delete _promises[key]; });
  },

  // Return cached data immediately, await in-flight fetch, or fetch fresh
  async load(key, fetcher) {
    if (key in _cache) return _cache[key];
    if (key in _promises) {
      await _promises[key];
      return _cache[key] ?? null;
    }
    const data = await fetcher();
    _cache[key] = data;
    return data;
  },

  set(key, data) {
    _cache[key] = data;
  },

  invalidate(key) {
    delete _cache[key];
    delete _promises[key];
  },
};
