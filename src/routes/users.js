import { Router } from "express";
import { prisma, slowQuery } from "../db.js";
import { cached } from "../cache/cached.js";
import { invalidate } from "../cache/invalidation.js";

const router = Router();

// READ: GET /users/:id
// Cached with 300s (5 minutes) TTL and per-user key: user:<id>
router.get("/users/:id", async (req, res) => {
  const userId = req.params.id;
  const key = `user:${userId}`;
  const ttl = 300; // 300 seconds (5 min): user profiles rarely change

  const user = await cached(key, ttl, async () => {
    await slowQuery(); // simulates a heavy, disk-backed query
    return prisma.user.findUnique({
      where: { id: userId },
      include: { posts: true },
    });
  });

  if (!user) return res.status(404).json({ error: "not found" });
  res.json(user);
});

// WRITE: PUT /users/:id  { name?, bio? }
// Invalidates only that user's profile key
router.put("/users/:id", async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: req.body,
  });
  await invalidate.onProfileEdit(req.params.id);
  res.json(user);
});

export default router;
