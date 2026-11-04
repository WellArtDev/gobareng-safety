// Communities — kontrak §12. A-5: sisi user (list, detail, join/leave,
// feed + diskusi) terbuka untuk semua user ber-auth; DELETE tetap
// ADMIN-only (halaman Komunitas dashboard), guard per-route karena
// router ini tidak lagi admin-only seluruhnya.
import { Router } from "express";
import { param, requireAuth, requireRole } from "../auth.js";
import type { Db } from "../db.js";
import { badRequest, forbidden, notFound } from "../errors.js";

export function communitiesRouter(db: Db): Router {
  const r = Router();
  r.use(requireAuth);

  r.get("/", (_req, res, next) => {
    (async () => {
      res.json({ data: { communities: await db.listCommunities() } });
    })().catch(next);
  });

  r.get("/:id", (req, res, next) => {
    (async () => {
      const community = await db.communityById(param(req, "id"));
      if (!community) throw notFound();
      res.json({ data: { community } });
    })().catch(next);
  });

  r.post("/:id/join", (req, res, next) => {
    (async () => {
      const ok = await db.joinCommunity(param(req, "id"), req.user!.id);
      if (!ok) throw notFound();
      res.json({ data: { joined: true } });
    })().catch(next);
  });

  r.post("/:id/leave", (req, res, next) => {
    (async () => {
      await db.leaveCommunity(param(req, "id"), req.user!.id);
      res.json({ data: { left: true } });
    })().catch(next);
  });

  // Feed: semua user boleh baca; hanya anggota boleh menulis.
  r.get("/:id/feed", (req, res, next) => {
    (async () => {
      const id = param(req, "id");
      const community = await db.communityById(id);
      if (!community) throw notFound();
      res.json({ data: { posts: await db.communityFeed(id) } });
    })().catch(next);
  });

  r.post("/:id/feed", (req, res, next) => {
    (async () => {
      const id = param(req, "id");
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      if (!body) throw badRequest("INVALID_PAYLOAD");
      if (!(await db.isCommunityMember(id, req.user!.id))) {
        throw forbidden("NOT_COMMUNITY_MEMBER");
      }
      const post = await db.createCommunityPost({
        communityId: id,
        authorId: req.user!.id,
        body,
      });
      res.status(201).json({ data: { post } });
    })().catch(next);
  });

  r.get("/:id/feed/:postId/discussion", (req, res, next) => {
    (async () => {
      const post = await db.communityPostById(param(req, "id"), param(req, "postId"));
      if (!post) throw notFound();
      res.json({ data: { comments: await db.postComments(post.id) } });
    })().catch(next);
  });

  r.post("/:id/feed/:postId/discussion", (req, res, next) => {
    (async () => {
      const id = param(req, "id");
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      if (!body) throw badRequest("INVALID_PAYLOAD");
      if (!(await db.isCommunityMember(id, req.user!.id))) {
        throw forbidden("NOT_COMMUNITY_MEMBER");
      }
      const post = await db.communityPostById(id, param(req, "postId"));
      if (!post) throw notFound();
      const comment = await db.createPostComment({
        postId: post.id,
        authorId: req.user!.id,
        body,
      });
      res.status(201).json({ data: { comment } });
    })().catch(next);
  });

  // Dashboard Komunitas: hapus klub — tetap ADMIN-only.
  r.delete("/:id", requireRole(db, "admin"), (req, res, next) => {
    (async () => {
      const ok = await db.deleteCommunity(param(req, "id"));
      if (!ok) throw notFound();
      res.json({ data: { deleted: true } });
    })().catch(next);
  });

  return r;
}
