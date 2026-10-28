// short-lived in-memory cache for analytics queries

const TTL_MS = 60_000;
const MAX_ENTRIES = 200;
const store = new Map();

export async function cached(key, compute) {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = await compute();
  if (store.size >= MAX_ENTRIES) {
    // drop the oldest entry
    store.delete(store.keys().next().value);
  }
  store.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

export function clearCache() {
  store.clear();
}
