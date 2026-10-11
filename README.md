# Cache-Aside + Stampede Protection — 2-Endpoint Scaffold

A small **Express + Prisma** service with **two read-heavy endpoints** and **two write endpoints that affect them**. Your job: apply the **cache-aside** pattern with a **TTL**, **explicit invalidation**, and **stampede protection** — then prove the improvement under load.

It runs on **SQLite** (zero database setup) and adds a small artificial query delay (`SLOW_MS`, default 40ms) so caching produces a real, measurable win.

---

## The endpoints

| Endpoint | Kind | Affected by |
|---|---|---|
| `GET /posts/feed?page=&sort=new\|hot` | Read (hot) | `POST /posts` |
| `GET /users/:id` | Read | `PUT /users/:id` |
| `POST /posts` | Write | invalidates the feed |
| `PUT /users/:id` | Write | invalidates that user |

Every read is currently **uncached** and slow. Two files are **stubs for you to complete**:

- `src/cache/cached.js` — the cache-aside + `SET … NX EX` stampede helper.
- `src/cache/invalidation.js` — the single "invalidation rules" module.

---

## Setup

```bash
npm install
docker start redis-m4          # or your Redis; see .env.example for REDIS_URL
cp .env.example .env
npm run db:push                # create the SQLite schema
npm run seed                   # seed users + 40 posts (prints a user id to test)
npm start                      # http://localhost:3000
```

---

## Your tasks

1. **Implement `cached(key, ttl, fetcher)`** in `src/cache/cached.js` — cache-aside (get → hit/miss → set with TTL) **plus** the `SET "lock:"+key "1" "NX" "EX" 5` stampede lock (winner does the work; others sleep ~50ms and re-read).
2. **Wrap both reads** in `cached()` with a **parameter-aware key** and a **deliberate TTL**:
   - `GET /posts/feed` — key includes `page` and `sort`.
   - `GET /users/:id` — key includes the `:id`.
3. **Wire invalidation** in `src/cache/invalidation.js` and call it from the writes:
   - `POST /posts` → `invalidate.onNewPost()` clears the feed.
   - `PUT /users/:id` → `invalidate.onProfileEdit(id)` clears **only that user**.
4. **Handle the paginated feed** without `KEYS posts:feed:*` (it blocks single-threaded Redis). Pick one: a fixed feed key, a version counter, or an explicit dependency list — **and write your choice in the TTL/Invalidation section below.**
5. **Verify invalidation:** `AUTHOR_ID=<seeded id> npm run verify` — both checks must PASS.
6. **Load test before and after**, and paste the numbers into the "Results" section below.

---

## Load testing

With `wrk` (preferred) — the `--latency` flag adds the p50/p99 distribution:
```bash
wrk -t4 -c50 -d10s --latency http://localhost:3000/posts/feed
wrk -t4 -c50 -d10s --latency http://localhost:3000/users/<id>
```

No `wrk` (Windows-friendly stand-in — prints req/s and p50/p99):
```bash
node scripts/load.js /posts/feed 50 2000
node scripts/load.js /users/<id> 50 2000
```

Run each **before** caching (or against a cold cache) and **after** caching is warm.

---

## Fill this in (part of your submission)

### TTL reasoning

| Endpoint | TTL | Why (staleness tolerance) |
|---|---|---|
| `GET /posts/feed` | `30s` | Feed content updates frequently as new posts are published; 30s provides fresh content while shielding the database from repeated bursts of feed queries. |
| `GET /users/:id` | `300s` | User profiles change infrequently (bio, name); 5 minutes (300s) TTL provides high cache hit ratio, while explicit write invalidation handles instant updates. |

### Invalidation rules

| Write | Clears |
|---|---|
| `POST /posts` | Bumps `posts:feed:version` via `INCR` (invalidating all feed pages/sorts) |
| `PUT /users/:id` | `user:<id>` (DEL only that specific user's cached profile) |

**How I handled the paginated feed (no `KEYS`):**
Instead of using `redis.keys("posts:feed:*")` which blocks single-threaded Redis, I used an **atomic version counter**. The feed cache keys are namespaced by version: `posts:feed:v<version>:page=<page>:sort=<sort>`.
When `POST /posts` runs, `invalidate.onNewPost()` calls `redis.incr("posts:feed:version")` in $O(1)$ time. This immediately and atomically invalidates all cached pages and sort variations for the feed without any blocking scan, and older cached versions naturally expire via their 30-second TTL.

### Results (before → after)

| Endpoint | req/s before | req/s after | p50 before → after | p99 before → after |
|---|---|---|---|---|
| `GET /posts/feed` | 719 req/s | 1,612 req/s | 60.0ms → 25.9ms | 122.7ms → 60.0ms |
| `GET /users/:id` | 755 req/s | 1,651 req/s | 56.9ms → 20.8ms | 117.1ms → 151.6ms |

---

## Submit

Open a **Pull Request on your fork** containing: the completed `cached()` helper, both reads using it, invalidation wired into both writes, `KEYS`-free feed handling, and this README filled in with your TTL reasoning, invalidation rules, and before/after numbers. Submit the PR link.
