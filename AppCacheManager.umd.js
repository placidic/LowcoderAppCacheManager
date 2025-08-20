/* UMD: AppCacheManager */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AppCacheManager = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Small utility
  const now = () => Date.now();
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  function createDB({ dbName, version = 1, stores = [], debug = false } = {}) {
    if (!dbName) throw new Error('createDB requires a dbName');

    const log = (...a) => debug && console.log('[AppCacheManager]', ...a);
    const warn = (...a) => debug && console.warn('[AppCacheManager]', ...a);
    const error = (...a) => console.error('[AppCacheManager]', ...a);

    let db = null;

    function open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, version);
        req.onupgradeneeded = (e) => {
          const _db = e.target.result;
          stores.forEach(s => {
            if (!_db.objectStoreNames.contains(s)) {
              _db.createObjectStore(s, { keyPath: 'key' });
            }
          });
        };
        req.onsuccess = (e) => { db = e.target.result; resolve(db); };
        req.onerror = (e) => reject(e.target.error);
      });
    }

    function withStore(store, mode, fn) {
      return new Promise((resolve, reject) => {
        if (!db) return reject(new Error('DB not initialized'));
        const tx = db.transaction(store, mode);
        const os = tx.objectStore(store);

        tx.oncomplete = () => resolve(result);
        tx.onerror = (e) => reject(e.target.error);

        let result;

        try {
          const r = fn(os);

          // If fn returns an IDBRequest, attach onsuccess/onerror
          if (r instanceof IDBRequest) {
            r.onsuccess = () => { result = r.result; };
            r.onerror = (e) => reject(e.target.error);
          } else if (r instanceof Promise) {
            // If fn returns a promise, await it and assign to result
            r.then(res => { result = res; }).catch(reject);
          } else {
            // synchronous return value
            result = r;
          }
        } catch (e) {
          reject(e);
        }
      });
    }

    // ---- Corrected get ----
    async function get(store, key) {
      try {
        const row = await withStore(store, 'readonly', os => os.get(key));
        const rec = row ?? null;
        if (!rec) return null;
        const exp = rec.meta?.expiresAt;
        if (exp && exp <= now()) {
          // Soft-expired: return value but indicate expiration
          return Object.assign(
            Array.isArray(rec.value) ? [...rec.value] : rec.value,
            { __expired: true }
          );
        }
        return Array.isArray(rec.value) ? [...rec.value] : rec.value;
      } catch (e) {
        console.warn('[AppCacheManager] get failed', { store, key, e });
        return null;
      }
    }

    // ---- Corrected getAll ----
    async function getAll(store) {
      try {
        const rows = await withStore(store, 'readonly', os => os.getAll());
        return rows.map(rec => {
          const exp = rec.meta?.expiresAt;
          if (exp && exp <= now()) {
            return Object.assign(
              Array.isArray(rec.value) ? [...rec.value] : rec.value,
              { __expired: true }
            );
          }
          return Array.isArray(rec.value) ? [...rec.value] : rec.value;
        });
      } catch (e) {
        console.warn('[AppCacheManager] getAll failed', { store, e });
        return [];
      }
    }

    async function init() {
      if (!db) await open();
      log('DB ready:', dbName);
      return api;
    }



    async function set(store, key, value, { ttlMs } = {}) {
      if (!db) throw new Error('DB not initialized');
      const meta = {};
      if (ttlMs && ttlMs > 0) meta.expiresAt = now() + ttlMs;

      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        const req = os.put({ key, value, meta });

        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e.target.error);
      });
    }



    async function invalidate(store, key) {
      if (!db) throw new Error('DB not initialized');

      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        const req = os.delete(key);

        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e.target.error);
      });
    }
    /**
     * Preload helper
     * defs: [{ store, key, run: () => Promise<any>, ttlMs?: number }]
     * options: { concurrency?: number, batchDelayMs?: number, retries?: number }
     */
    async function preload(defs, { concurrency = 4, batchDelayMs = 0, retries = 0 } = {}) {
      log(`Starting preload of ${defs.length} items (concurrency=${concurrency})...`);
      let i = 0;
      async function worker() {
        while (i < defs.length) {
          const idx = i++;
          const def = defs[idx];
          const { store, key, run, ttlMs } = def;
          try {
            const cached = await get(store, key);
            if (cached && !cached.__expired) {
              log(`Cache hit for ${store}:${key}, skipping fetch.`);
              continue;
            }
            const attempt = async (triesLeft) => {
              try {
                const value = await run();
                await set(store, key, value, { ttlMs });
                log('Inserted', store, key);
              } catch (err) {
                if (triesLeft > 0) {
                  warn(`Retrying ${store}:${key} (${triesLeft} left)`, err);
                  await sleep(250);
                  return attempt(triesLeft - 1);
                }
                error('Preload failed', { store, key, err });
              }
            };
            await attempt(retries);
          } catch (e) {
            warn('Preload get failed', e);
          }
          if (batchDelayMs) await sleep(batchDelayMs);
        }
      }
      const workers = Array.from({ length: Math.min(concurrency, defs.length) }, worker);
      await Promise.all(workers);
      log('Preload complete.');
    }

    const api = { init, get, set, getAll, invalidate, preload, name: dbName };
    return api;
  }

  // Public UMD API
  return {
    createDB
  };
}));
