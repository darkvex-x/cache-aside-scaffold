import { redis } from "../redis.js";

/**
 * Invalidation rules — single source of truth.
 *
 * Feed invalidation uses a version counter:
 * Key format: `posts:feed:v{v}:page={page}:sort={sort}`
 * When a new post is created:
 * `invalidate.onNewPost()` calls `INCR posts:feed:version`.
 * This instantly invalidates ALL paginated/sorted feed views atomically in O(1)
 * without scanning or calling KEYS (which blocks single-threaded Redis).
 *
 * User profile invalidation:
 * `invalidate.onProfileEdit(id)` deletes `user:{id}`, with strict per-user precision.
 */

export async function getFeedVersion() {
  const v = await redis.get("posts:feed:version");
  return v ? Number(v) : 1;
}

export const invalidate = {
  onNewPost: async () => {
    // Atomically bump feed version so all previous feed keys miss naturally
    await redis.incr("posts:feed:version");
  },
  onProfileEdit: async (userId) => {
    // Invalidate ONLY this user's profile
    await redis.del(`user:${userId}`);
  },
};
