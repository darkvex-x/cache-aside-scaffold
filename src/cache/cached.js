import { redis } from "../redis.js";

/**
 * cached(key, ttl, fetcher)
 *
 * Cache-aside with stampede protection (SET ... NX EX 5 lock).
 *
 * 1. redis.get(key) -> on HIT, JSON.parse and return immediately.
 * 2. On MISS, acquire stampede lock:
 *      SET lock:<key> 1 NX EX 5
 *    - If winner: execute fetcher(), write to cache with EX ttl, release lock, return data.
 *    - If competitor: sleep ~50ms and recursively re-read the cache.
 */
export async function cached(key, ttl, fetcher) {
  const cachedVal = await redis.get(key);
  if (cachedVal) {
    return JSON.parse(cachedVal);
  }

  const lockKey = `lock:${key}`;
  const acquired = await redis.set(lockKey, "1", "NX", "EX", 5);

  if (acquired === "OK") {
    try {
      const data = await fetcher();
      await redis.set(key, JSON.stringify(data), "EX", ttl);
      return data;
    } finally {
      await redis.del(lockKey);
    }
  } else {
    await new Promise((r) => setTimeout(r, 50));
    return cached(key, ttl, fetcher);
  }
}
