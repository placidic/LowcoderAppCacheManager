# AppCacheManager

## Table of Contents

*   [Overview and Background](#overview-and-background)
*   [Why IndexedDB?](#why-indexeddb)
*   [Installation](#installation)
*   [Usage](#usage)
*   [Initializing in a Lowcoder Parent Application](#Xe3a70b0f3efa30dc5aaf524533d0d8285ca255e)
*   [Using Shared Cache in Nested Modules](#using-shared-cache-in-nested-modules)
*   [Fallback to Local Cache in Nested Modules](#Xd4e7dc1ef7f85410baef399b0ee47bb5d7f4321)
*   [API Methods](#api-methods)
*   [createDB()](#createdb)
*   [init()](#init)
*   [get()](#get)
*   [set()](#set)
*   [getAll()](#getall)
*   [invalidate()](#invalidate)
*   [preload()](#preload)
*   [TTL, Concurrency, and Preload](#ttl-concurrency-and-preload)
*   [Debugging and Logging](#debugging-and-logging)
*   [Best Practices](#best-practices)
*   [Troubleshooting](#troubleshooting)

## Overview and Background

AppCacheManager is a **UMD-based JavaScript library** for client-side caching using **IndexedDB**. It provides a simple key-value API that wraps the low-level IndexedDB database, making it easy to store and retrieve complex data in the browser[\[1\]](https://github.com/localForage/localForage#:~:text=Offline%20storage%2C%20improved,a%20simple%20but%20powerful%20API). In a Lowcoder application (or any web app), this library enables large-capacity, persistent caching of data (e.g. API responses) across page loads and offline sessions. Unlike simple localStorage, IndexedDB can store structured data and blobs in a transactional database without blocking the main thread. AppCacheManager builds on IndexedDB to give developers an intuitive interface: you create or open a database, define object stores, and then use get/set methods with optional expiration (TTL) semantics.

Many client-side libraries (e.g. LocalForage) wrap IndexedDB behind a friendly API. Similarly, AppCacheManager abstracts the boilerplate of IndexedDB so you can focus on your cache data, TTL policies, and concurrency needs. It is particularly useful in Lowcoder’s modular apps: you can initialize a cache in the parent app and then share or fallback gracefully in nested modules.

## Why IndexedDB?

IndexedDB is a **transactional, asynchronous, NoSQL database** built into modern browsers. It is designed to handle **large amounts of structured data** on the client (far beyond what localStorage can handle). Key concepts:

*   **Object stores**: Similar to tables in relational DBs, but NoSQL. A database can have multiple object stores to organize data.
*   **Keys and values**: Every stored value is associated with a key. Keys can be simple or complex, but most libraries (including AppCacheManager) use a string key for easy lookups.
*   **Asynchronous API**: All operations (open, read, write) are asynchronous. This avoids blocking the UI thread, but requires callbacks or promises.

Because IndexedDB’s native API is verbose, AppCacheManager wraps it in a promise-based API. When you call createDB({dbName, stores}), it under the hood uses indexedDB.open and creates any missing object stores. It provides a neat object with methods (get, set, etc.) so you don’t have to write the boilerplate IndexedDB transaction code yourself. For example, AppCacheManager’s code mirrors common best practices: it creates object stores if needed during onupgradeneeded, and it always uses transactions to read/write data. This design lets Lowcoder developers cache query results or user data efficiently on the client.

**Note:** Unlike localStorage, IndexedDB has **no built-in expiration** or “cache eviction” policy. AppCacheManager handles expiration (TTL) by storing a timestamp in each record’s meta. On reads it checks if data has expired and flags it. (If you need auto-cleanup, see the _Best Practices_ section below.)

## Installation

To use AppCacheManager in a browser or a Lowcoder app, include its UMD build. You can load it globally via a \<script> tag, or with AMD/CJS loaders. For a browser script include:
```
<!-- Include the AppCacheManager UMD script -->  
<script src="path/to/AppCacheManager.umd.js"></script>  
<script>  
// The library exposes a global \`AppCacheManager\` object  
console.log(typeof AppCacheManager.createDB === 'function'); // should be true  
</script>
```
Alternatively, if you use a bundler or Node, you can require/import it:
```
// CommonJS / Node  
const AppCacheManager = require('appcache-manager');  
// or ES Module (if available)  
import AppCacheManager from 'appcache-manager';
```
Once loaded, use AppCacheManager.createDB(config) to create or open your cache database (see [API Methods](#api-methods) below).

## Usage

The typical usage pattern is:

1.  **Create a cache instance** with createDB({dbName, stores, version, debug}). Specify a database name and an array of object store names (stores) that your app will use (e.g. \['users','settings'\]).
2.  **Initialize the cache** by calling .init(). This opens the IndexedDB and makes it ready.
3.  **Use get/set** to read/write data to a given store with a given key.
4.  **(Optional)** Use invalidate to delete a key, or preload to batch-fetch and store multiple items with retry logic.

Below we cover how to use AppCacheManager in a Lowcoder parent app and in nested modules (with shared cache or local fallback).

### Initializing in a Lowcoder Parent Application

In a Lowcoder parent application (the main app that may embed modules), you typically initialize the cache once. For example:
```
// In your parent app initialization code  
window.AppCache = AppCacheManager.createDB({  
dbName: 'MyLowcoderAppCache',  
stores: \['users', 'settings', 'reports'\],  
version: 1,  
debug: true // enable debug logging (optional)  
});  
window.AppCache.init().then(cache => {  
console.log('AppCache initialized:', cache.name); // e.g. "MyLowcoderAppCache"  
// You can now use cache.get(), cache.set(), etc.  
});  
```
This code creates (or opens) an IndexedDB database named "MyLowcoderAppCache". It ensures object stores named "users", "settings", and "reports" exist (they will be created on first run). The .init() call returns a promise for the initialized cache API. Once initialized, you can use methods like:
```
// Store a value (with optional 1-hour TTL)  
await window.AppCache.set('users', 'user\_123', { name: 'Alice', role: 'admin' }, { ttlMs: 3600000 });  

// Retrieve the value later  
const user = await window.AppCache.get('users', 'user\_123');  
if (user) {  
if (user.\_\_expired) {  
console.log('Cached user data is expired');  
}  
console.log('Cached user data:', user);  
}  
  
// Get all items in a store  
const allUsers = await window.AppCache.getAll('users');  
console.log('All users from cache:', allUsers);  
  
// Invalidate (delete) a key  
await window.AppCache.invalidate('users', 'user\_123');
```
**Key points:**

*   window.AppCache is used here to share the cache instance. The debug: true flag means the library will log debug messages to the console with the \[AppCacheManager\] prefix (useful for development).
*   Values can be any serializable data (numbers, objects, arrays, blobs, etc.).
*   TTL (ttlMs) is optional and specified in milliseconds. If you do not set a TTL, values live indefinitely until deleted.

### Using Shared Cache in Nested Modules

Lowcoder modules can be embedded in the parent app (in the same window). To avoid duplicating data, modules can use the parent’s cache instance via window.AppCache. For example, in a nested module’s code:
```
// In a nested module that is part of the same app  
// Try to reuse the parent app’s cache, or create if missing  
const cache = window.AppCache || AppCacheManager.createDB({  
dbName: 'MyLowcoderAppCache', // same dbName and stores as parent  
stores: \['users', 'settings', 'reports'\]  
});  
await cache.init(); // no harm if already initialized  
  
// Now use \`cache\` just like in the parent  
cache.get('settings', 'theme').then(theme => {  
console.log('Shared theme setting:', theme);  
});
```
Here, the nested module checks if window.AppCache exists. If it does, it reuses that instance (ensuring no duplication of the database). If not (e.g. if the module somehow loaded before the parent), it creates the cache instance with the same dbName and stores. Either way, after calling init(), the module can use cache.get, cache.set, etc., and it will operate on the same IndexedDB as the parent app. This way, data loaded in one module is available to others.

### Fallback to Local Cache in Nested Modules

Sometimes a nested module may run in an isolated context (e.g. embedded as an external app) where window.AppCache from the parent is not accessible. In that case, you should fall back to using a local cache instance just for that module. For example:
```
// In a nested module that cannot access the parent cache  
let cache;  
if (window.AppCache) {  
// Shared scenario (same window)  
cache = window.AppCache;  
} else {  
// Fallback: create a local cache for this module  
cache = AppCacheManager.createDB({  
dbName: 'MyModuleLocalCache',  
stores: \['localData'\],  
debug: false  
});  
}  
await cache.init();  
  
// Use the cache normally  
const data = await cache.get('localData', 'key1');  
if (data) {  
console.log('Local cached data:', data);  
}
```
In this pattern, if window.AppCache is not defined, we create a separate IndexedDB named 'MyModuleLocalCache' with its own stores (e.g. \['localData'\]). This ensures the module can still cache data independently. If at a later point the module is run inside the parent app, you could detect window.AppCache and switch to the shared cache instead.

## API Methods

After initialization, AppCacheManager.createDB(config) returns an API object with the following methods:

### createDB()

AppCacheManager.createDB({ dbName, version = 1, stores = \[\], debug = false })

Creates (or opens) a new cache database. **Parameters** (all in an object):

*   **dbName** (string, required): A unique name for the IndexedDB database. _Required!_ (The code will throw an error if missing)[\[5\]](file://file-SY5QS8JFX9muAKRU9NhYEn#:~:text=if%20,requires%20a%20dbName).
*   **version** (number, default 1): The version number of the database schema.
*   **stores** (array of strings): Names of object stores (tables) to create in this database. On first open, each store will be created with keyPath: 'key'.
*   **debug** (boolean, default false): If true, the library will log debugging information (console logs and warnings with the \[AppCacheManager\] prefix).

Returns an API object (see below). Example:
```
const cache = AppCacheManager.createDB({  
dbName: 'MyAppCache',  
stores: \['users', 'settings', 'reports'\],  
version: 2,  
debug: true  
});
```
### init()
```
await cache.init()
```
Initializes or re-opens the database. Returns a promise that resolves to the same API object. This method must be called (and awaited) before doing any get or set. Internally, init() calls indexedDB.open and sets up the stores. Once done, the database is open for use[\[6\]](file://file-SY5QS8JFX9muAKRU9NhYEn#:~:text=async%20function%20init%28%29%20,return%20api%3B). Example:
```
await cache.init();  
console.log('Cache is ready:', cache.name);
```
### get()
```
const value = await cache.get(storeName, key)
```
Retrieves the value for a given key in the specified storeName. Returns the value stored under that key, or null if not found or on error. If the stored entry had a TTL that has expired, the returned value will be the original object (or primitive) augmented with a special property \_\_expired: true[\[7\]](file://file-SY5QS8JFX9muAKRU9NhYEn#:~:text=async%20function%20get%28store%2C%20key%29%20,return%20value%20but%20indicate%20expiration). For example:
```
const user = await cache.get('users', 'user\_123');  
if (user) {  
if (user.\_\_expired) {  
console.log('Data expired, you may want to refresh it.');  
}  
console.log('User from cache:', user);  
} else {  
console.log('No cache entry for user\_123');  
}
```
Under the hood, get() does a read-only transaction on the object store and checks record.meta.expiresAt. If the current time exceeds expiresAt, it flags the value as expired but still returns it. If there is no record or an error occurs, get() returns null.

### set()
```
await cache.set(storeName, key, value, { ttlMs })
```
Stores a value under a given key in storeName. The value can be any serializable data (object, array, primitive, blob, etc.). The optional ttlMs parameter sets a time-to-live in milliseconds. Internally, set() creates a metadata object; if ttlMs is provided, it computes meta.expiresAt = Date.now() + ttlMs. It then writes an object { key, value, meta } into IndexedDB. Example:
```
// Cache user data with a 1-hour TTL  
await cache.set('users', 'user\_123', { name: 'Alice' }, { ttlMs: 3600\_000 });
```
This returns a promise that resolves to true on success. If the database is not yet initialized, set() will throw an error.

### getAll()
```
const arrayOfValues = await cache.getAll(storeName)
```
Retrieves all records from the specified object store as an array of values. Internally, it does os.getAll() and then strips out the key and meta from each record. Similar to get(), it checks each record’s expiresAt and marks any expired entries with \_\_expired: true in the returned array. For example:
```
const allUsers = await cache.getAll('users');  
allUsers.forEach(user => {  
if (user.\_\_expired) {  
console.log('Expired cache entry for a user');  
}  
});
```
On error, getAll() will return an empty array.

### invalidate()
```
await cache.invalidate(storeName, key)
```
Deletes a record by key from the given storeName. This is essentially a wrapper for objectStore.delete(key). It opens a read-write transaction and removes the entry. After calling invalidate, subsequent get(store, key) will return null. For example:
```
// Remove cached entry for user\_123  
await cache.invalidate('users', 'user\_123');
```
This method returns a promise that resolves to true on success.

### preload()
```
await cache.preload(defs, { concurrency, batchDelayMs, retries })
```
A helper for _batch-fetching_ data into the cache. You supply an array of definitions defs, where each item is an object { store, key, run, ttlMs }. Here run is an async function that fetches the data (e.g. an API call). preload will:

*   Process up to concurrency items in parallel (default 4).
*   For each {store, key, run, ttlMs}, it calls await cache.get(store, key). If a valid (non-expired) cached value exists, it skips calling run(). Otherwise, it executes run() to fetch the data.
*   If run() succeeds, it stores the result into the cache with cache.set(store, key, value, {ttlMs}), and logs the insertion.
*   If run() fails, it will retry up to retries times, waiting 250ms between attempts. After exhausting retries, it logs an error.

For example, to preload user data:
```
const tasks = \[  
{  
store: 'users',  
key: 'allUsers',  
run: () => fetch('/api/users').then(res => res.json()),  
ttlMs: 300000 // 5 minutes  
}  
\];  
await cache.preload(tasks, { concurrency: 2, retries: 3 });
```
This will fetch /api/users (if not already cached) and store it in the 'users' store under key 'allUsers'. The log will note hits, insertions, retries, and completion. The batchDelayMs option (default 0) can throttle between tasks if needed.

## TTL, Concurrency, and Preload

AppCacheManager supports **per-item TTL (Time-to-Live)** and **concurrent preloading with retries**:

*   **TTL usage:** When you call set(..., {ttlMs}), the library saves expiresAt = Date.now()+ttlMs in each record. On subsequent get() or getAll(), if expiresAt <= now, the result is flagged with \_\_expired: true. This gives you a chance to refresh stale data. (By design, IndexedDB itself has _no auto-expiration_ – “support for automatically expiring IndexedDB data is being considered”[\[4\]](https://stackoverflow.com/questions/35511033/how-to-apply-expiry-times-to-keys-in-html5-indexeddb#:~:text=Support%20for%20automatically%20expiring%20IndexedDB,describe%20your%20use%20case%20there), so the app must handle cleanup.)
*   **Concurrency controls:** The preload() method takes an option concurrency (default 4) to limit how many fetch operations run in parallel. This prevents overwhelming your API or the browser. E.g., setting concurrency: 1 will fetch items one-by-one, whereas concurrency: 5 can fetch five at a time.
*   **Retry logic:** In preload(), if a run() function (fetch) throws an error, AppCacheManager will automatically retry it up to retries times (default 0). It waits 250ms between retries. This is useful for transient network errors. The example above with {retries: 3} would attempt up to 3 retries before logging a failure[\[11\]](file://file-SY5QS8JFX9muAKRU9NhYEn#:~:text=const%20attempt%20%3D%20async%20,left%29%60%2C%20err%29%3B%20await%20sleep%28250).
*   **Batch delays:** Optionally, batchDelayMs can introduce a pause between successive tasks in a worker. This can be used to throttle requests in long lists.

Overall, these features help with keeping the cache fresh and handling real-world network issues in Lowcoder apps.

## Debugging and Logging

AppCacheManager includes basic logging when debug: true. It prefixes messages with \[AppCacheManager\]. For example, after a successful .init() you might see:
```
\[AppCacheManager\] DB ready: MyLowcoderAppCache
```
During preload(), it logs cache hits, insertions, and any retries. Example:
```
\[AppCacheManager\] Starting preload of 3 items (concurrency=2)...  
\[AppCacheManager\] Cache hit for users:allUsers, skipping fetch.  
\[AppCacheManager\] Inserted users:currentSettings  
\[AppCacheManager\] Preload complete.
```
You can enable debugging by passing debug: true to createDB. This is invaluable during development to ensure your database opened correctly and data is being stored. If something goes wrong, you may see console warnings like:
```
\[AppCacheManager\] get failed { store: 'users', key: 'user\_123', e: ... }
```
Always test that the database name and store names are correct, and watch the browser’s developer console (IndexedDB entries can also be inspected in browser DevTools) to troubleshoot any issues.

## Best Practices

*   **Organize stores logically:** Use one object store per type of data (e.g. 'users', 'settings', 'reports'). Name stores in a consistent style (for example, lowercase plural names). Each record’s key should uniquely identify the item (e.g. a user ID or a special string like 'currentUser').
*   **Consistent keys:** Always use the same key name for a given piece of data. Avoid collisions by scoping keys (e.g. prefix with module name if multiple modules share a store).
*   **Versioning:** If your schema changes (new stores or keyPaths), bump the version number in createDB. On the next init(), onupgradeneeded will run so you can add or remove stores. **Warning:** Deleting a store in an upgrade will erase its data; migrate it first if needed.
*   **TTL strategy:** Only add a ttlMs when data truly should expire (e.g. auth tokens, temporary API results). Do not over-rely on long TTLs for user-sensitive data; otherwise you may keep stale or private data longer than intended.
*   **Cache size:** While IndexedDB can store much data, browsers have quotas. Use invalidate or TTL-based cleanup for very large caches. Periodically purge expired entries if your app has a long run time.
*   **Access from DevTools:** In Chrome/Firefox developer tools under Application/Storage, you can inspect your IndexedDB and see the object stores and records. This helps verify your stores/keys and troubleshoot issues.
*   **Error handling:** Always use try/catch or .catch() when performing cache get/set in production code. If IndexedDB is unavailable (e.g. in private browsing or very old browsers), your calls may throw.

Remember that IndexedDB is **same-origin**: the cache created by one Lowcoder app is not accessible to a different domain. But within the same app or domain, nested modules can share window.AppCache.

## Troubleshooting

*   **Database not opening / errors:** Check the browser console. You might see errors if version is invalid or if you tried to create an existing store incorrectly. Remember to handle onupgradeneeded correctly (the library does basic setup automatically).
*   **Missing store error:** If you call cache.get('myStore', ...) but 'myStore' was not included in stores at creation, you’ll get “store not found” errors. Always include all needed stores when calling createDB.
*   **Unexpected null returns:** This usually means the key isn’t found or the DB wasn’t initialized. Ensure you called await cache.init() before using get or set. Also verify you’re using the correct store name and key.
*   **\_\_expired flags:** If your get() returns an object with \_\_expired: true, your data is simply past its TTL. Decide whether to refresh it. This is normal TTL behavior.
*   **Console logs missing:** If you set debug: true but see no logs, check that your environment hasn’t blocked console output. Also verify you have a recent version of the UMD build loaded correctly.
*   **Mobile/Old Browser Support:** IndexedDB is well-supported in modern browsers. If your users have very old browsers or strict private-mode settings, test to ensure IndexedDB is allowed. In some cases, the database may only be in-memory and cleared on reload; handle such cases in your app logic.
*   **Conflicts between modules:** If two nested modules independently create caches with the same dbName but different stores, this can cause upgrade conflicts. To avoid, ensure all modules agree on the same schema, or let only the parent initialize and have modules just reuse it.

If problems persist, consider adding breakpoints or using DevTools to watch transactions. Ensuring consistent naming and versioning across parent and modules is key.

_This README is meant to provide a thorough guide to using_ _AppCacheManager_ _in Lowcoder apps. With IndexedDB under the hood, it enables robust offline caching. We recommend experimenting with small data sets first to become comfortable with its async API and TTL features, before deploying in a production Lowcoder application._
