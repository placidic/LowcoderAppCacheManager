# AppCacheManager

## Table of Contents

* [Overview and Background](#overview-and-background)  
* [Why IndexedDB?](#why-indexeddb)  
* [Installation](#installation)  
* [Usage](#usage)  
* [Initializing in a Lowcoder Parent Application](#initializing-in-a-lowcoder-parent-application)  
* [Using Shared Cache in Nested Modules](#using-shared-cache-in-nested-modules)  
* [Fallback to Local Cache in Nested Modules](#fallback-to-local-cache-in-nested-modules)  
* [API Methods](#api-methods)  
  * [createDB()](#createdb)  
  * [init()](#init)  
  * [get()](#get)  
  * [set()](#set)  
  * [getAll()](#getall)  
  * [invalidate()](#invalidate)  
  * [preload()](#preload)  
* [TTL, Concurrency, and Preload](#ttl-concurrency-and-preload)  
* [Debugging and Logging](#debugging-and-logging)  
* [Best Practices](#best-practices)  
* [Troubleshooting](#troubleshooting)  

## Overview and Background

AppCacheManager is a **UMD-based JavaScript library** for client-side caching using **IndexedDB**. It provides a simple key-value API that wraps the low-level IndexedDB database, making it easy to store and retrieve complex data in the browser. In a Lowcoder application (or any web app), this library enables large-capacity, persistent caching of data (e.g., API responses) across page loads and offline sessions. Unlike simple localStorage, IndexedDB can store structured data and blobs in a transactional database without blocking the main thread.  

AppCacheManager builds on IndexedDB to give developers an intuitive interface: you create or open a database, define object stores, and then use `get`/`set` methods with optional expiration (TTL) semantics. Many client-side libraries (e.g., LocalForage) wrap IndexedDB behind a friendly API. Similarly, AppCacheManager abstracts the boilerplate of IndexedDB so you can focus on your cache data, TTL policies, and concurrency needs.  

It is particularly useful in Lowcoder’s modular apps: you can initialize a cache in the parent app and then share or fallback gracefully in nested modules.

## Why IndexedDB?

IndexedDB is a **transactional, asynchronous, NoSQL database** built into modern browsers. It is designed to handle **large amounts of structured data** on the client (far beyond what localStorage can handle). Key concepts:

* **Object stores**: Similar to tables in relational DBs, but NoSQL. A database can have multiple object stores to organize data.  
* **Keys and values**: Every stored value is associated with a key. Keys can be simple or complex, but most libraries (including AppCacheManager) use a string key for easy lookups.  
* **Asynchronous API**: All operations (open, read, write) are asynchronous. This avoids blocking the UI thread, but requires callbacks or promises.  

Because IndexedDB’s native API is verbose, AppCacheManager wraps it in a promise-based API. When you call `createDB({dbName, stores})`, it uses `indexedDB.open` and creates any missing object stores. It provides a neat object with methods (`get`, `set`, etc.) so you don’t have to write the boilerplate IndexedDB transaction code yourself.  

**Note:** Unlike localStorage, IndexedDB has **no built-in expiration** or “cache eviction” policy. AppCacheManager handles expiration (TTL) by storing a timestamp in each record’s meta. On reads, it checks if data has expired and flags it.  

## Installation

**Browser script include:**
```html
<script src="path/to/AppCacheManager.umd.js"></script>  
<script>  
  console.log(typeof AppCacheManager.createDB === 'function');
</script>
```

**Node / Bundler:**
```js
const AppCacheManager = require('appcache-manager');  
import AppCacheManager from 'appcache-manager';
```

## Usage

Typical usage pattern:

1. **Create a cache instance** with `createDB({dbName, stores, version, debug})`.  
2. **Initialize the cache** by calling `.init()`.  
3. **Use `get`/`set`** to read/write data to a given store with a given key.  
4. **(Optional)** Use `invalidate` or `preload` for batch operations.

### Initializing in a Lowcoder Parent Application

```js
window.AppCache = AppCacheManager.createDB({  
  dbName: 'MyLowcoderAppCache',  
  stores: ['users', 'settings', 'reports'],  
  version: 1,  
  debug: true  
});  

window.AppCache.init().then(cache => {  
  console.log('AppCache initialized:', cache.name);  
});
```

### Using Shared Cache in Nested Modules

```js
const cache = window.AppCache || AppCacheManager.createDB({  
  dbName: 'MyLowcoderAppCache',  
  stores: ['users', 'settings', 'reports']  
});  

await cache.init();  
cache.get('settings', 'theme').then(theme => console.log('Shared theme setting:', theme));
```

### Fallback to Local Cache in Nested Modules

```js
let cache;  
if (window.AppCache) {  
  cache = window.AppCache;  
} else {  
  cache = AppCacheManager.createDB({  
    dbName: 'MyModuleLocalCache',  
    stores: ['localData'],  
    debug: false  
  });  
}  

await cache.init();  
const data = await cache.get('localData', 'key1');  
console.log('Local cached data:', data);
```

## API Methods

### createDB()
```js
AppCacheManager.createDB({ dbName, version = 1, stores = [], debug = false })
```

### init()
```js
await cache.init()
```

### get()
```js
const value = await cache.get(storeName, key)
```

### set()
```js
await cache.set(storeName, key, value, { ttlMs })
```

### getAll()
```js
const arrayOfValues = await cache.getAll(storeName)
```

### invalidate()
```js
await cache.invalidate(storeName, key)
```

### preload()
```js
await cache.preload(defs, { concurrency, batchDelayMs, retries })
```

## TTL, Concurrency, and Preload

* **TTL:** Per-item expiration via `expiresAt`.  
* **Concurrency:** Limit parallel fetches with `concurrency`.  
* **Retry logic:** Automatic retry in `preload()`.  
* **Batch delays:** Throttle between tasks with `batchDelayMs`.

## Debugging and Logging

Enable via `debug: true`. Logs include:
```
[AppCacheManager] DB ready: MyLowcoderAppCache
[AppCacheManager] Cache hit for users:allUsers, skipping fetch.
[AppCacheManager] Preload complete.
```

## Best Practices

* Organize stores logically.  
* Use consistent key naming.  
* Version schema changes carefully.  
* Apply TTL only to data that should expire.  
* Monitor cache size and purge expired entries.  
* Use DevTools to inspect IndexedDB.  
* Always handle errors with try/catch.

## Troubleshooting

* **Database not opening / errors:** Check console for version or store issues.  
* **Missing store error:** Include all needed stores at creation.  
* **Unexpected null returns:** Ensure `await cache.init()` is called.  
* **__expired flags:** Indicates data TTL has passed.  
* **Debug logs missing:** Verify environment and UMD build version.  
* **Module conflicts:** Ensure modules share schema or only parent initializes the cache.

