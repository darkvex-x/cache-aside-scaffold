import { Router } from "express";
import { prisma, slowQuery } from "../db.js";
import { cached } from "../cache/cached.js";
import { invalidate, getFeedVersion } from "../cache/invalidation.js";

const router = Router();

// READ (hot): GET /posts/feed?page=1&sort=new|hot
// Cached with 30s TTL and versioned parameter-aware key: posts:feed:v<version>:page=<page>:sort=<sort>
router.get("/posts/feed", async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const sort = req.query.sort === "hot" ? "hot" : "new";
  const version = await getFeedVersion();

  const key = `posts:feed:v${version}:page=${page}:sort=${sort}`;
  const ttl = 30; // 30 seconds: feeds change rapidly, short staleness tolerance

  const feed = await cached(key, ttl, async () => {
    await slowQuery(); // simulates a heavy, disk-backed query
    return prisma.post.findMany({
      orderBy: sort === "hot" ? { likes: "desc" } : { createdAt: "desc" },
      skip: (page - 1) * 20,
      take: 20,
      include: { author: true },
    });
  });

  res.json(feed);
});

// WRITE: POST /posts  { title, body, authorId }
// Invalidates the feed via version bump
router.post("/posts", async (req, res) => {
  const post = await prisma.post.create({ data: req.body });
  await invalidate.onNewPost();
  res.status(201).json(post);
});

export default router;
