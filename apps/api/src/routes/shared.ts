// Public read-only shared-trip view — contract §16.
// No auth, no join, no chat, no SOS: live positions + safe/SOS status only.
// A-1: Prisma-backed.
import { Router } from "express";
import { conflict, forbidden, notFound } from "../errors.js";
import { requireAuth } from "../auth.js";
import type { Db } from "../db.js";

// Nomor HP leader untuk link WA di landing undangan saat kuota penuh:
// dibersihkan dari spasi/dash/tanda + (perintah pengguna 2 Nov 2026).
// Hanya digit yang dikembalikan; kosong/bukan digit -> null (tanpa link).
export function cleanWaPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-+]/g, "");
  return /^\d+$/.test(cleaned) ? cleaned : null;
}

export function sharedRouter(db: Db): Router {
  const r = Router();

  r.get("/shared-trips/:token", (req, res, next) => {
    (async () => {
      const token = typeof req.params.token === "string" ? req.params.token : "";
      const link = await db.shareLinkByToken(token);
      if (!link) throw notFound("SHARE_LINK_NOT_FOUND");
      const trip = await db.tripById(link.tripId);
      if (!trip) throw notFound("TRIP_NOT_FOUND");
      const activeSos = (await db.tripSos(trip.id)).filter((s) => s.status === "ACTIVE");
      // positions: anggota + posisi terakhir untuk layar pantau mobile
      // (watch-trip), bentuk seperti /trip-groups/:id/positions TAPI
      // user dipangkas ke {id, name, slug} — email/phone tidak pernah
      // keluar lewat tautan publik.
      const positions = (await db.tripPositions(trip.id)).map((p) => ({
        userId: p.userId,
        role: p.role,
        user: { id: p.user.id, name: p.user.name, slug: p.user.slug },
        location: p.location,
      }));
      res.json({
        data: {
          trip: { id: trip.id, name: trip.name, type: trip.type, status: trip.status },
          // scope ikut di respons (aditif, klien lama tidak berubah):
          // landing web /pantau hanya melayani ANYONE; EMERGENCY_CONTACT
          // tetap khusus aplikasi (semantiknya tidak dilonggarkan).
          scope: link.scope,
          locations: await db.latestLocations(trip.id),
          positions,
          activeSos,
          status: activeSos.length > 0 ? "SOS_ACTIVE" : "SAFE",
        },
      });
    })().catch(next);
  });

  // ---- INVITE public (2 Nov 2026) ----
  // Resolve token undangan tanpa auth: info trip secukupnya saja
  // (nama, tanggal, jenis, titik kumpul, tujuan, kuota/jumlah anggota,
  // status, harga) — tanpa data privat. Nomor leader HANYA muncul saat
  // kuota penuh (memberCount >= quota) dan leader punya HP tersimpan;
  // di luar itu leaderPhone null. Link dicabut -> 404. Link tidak
  // berlaku lagi bila trip sudah dimulai (status bukan PLANNED):
  // usable false, halaman menjelaskan alasannya.
  r.get("/invites/:token", (req, res, next) => {
    (async () => {
      const token = typeof req.params.token === "string" ? req.params.token : "";
      const invite = await db.tripInviteByToken(token);
      if (!invite) throw notFound("INVITE_NOT_FOUND");
      const trip = await db.tripById(invite.tripId);
      if (!trip) throw notFound("TRIP_NOT_FOUND");
      const memberCount = (await db.tripMembersWithUser(trip.id)).length;
      const usable = trip.status === "PLANNED";
      const quotaFull = trip.quota !== null && memberCount >= trip.quota;
      let leaderPhone: string | null = null;
      if (quotaFull) {
        const leader = await db.userById(trip.leaderId);
        leaderPhone = cleanWaPhone(leader?.phone);
      }
      res.json({
        data: {
          invite: { id: invite.id, label: invite.label, token: invite.token },
          trip: {
            id: trip.id,
            name: trip.name,
            type: trip.type,
            date: trip.date,
            meetingPoint: trip.meetingPoint,
            destination: trip.destination,
            status: trip.status,
            price: trip.price,
          },
          quota: trip.quota,
          memberCount,
          usable,
          leaderPhone,
        },
      });
    })().catch(next);
  });

  // Join via undangan (auth wajib; router ini dipasang tanpa maintenance
  // gate seperti /shared-trips — nuansa mounting yang sudah ada, bukan
  // diubah di PR ini). Urutan: token valid -> trip belum dimulai/ditutup
  // -> sudah anggota (idempotent, tanpa cek kuota) -> cek kuota (hanya
  // di jalur undangan; join biasa TIDAK berubah) -> aturan berbayar/Pro
  // disalin dari join biasa (leader bebas tagihan, non-leader Pro +
  // tagihan WAITING).
  r.post("/invites/:token/join", requireAuth, (req, res, next) => {
    (async () => {
      const token = typeof req.params.token === "string" ? req.params.token : "";
      const invite = await db.tripInviteByToken(token);
      if (!invite) throw notFound("INVITE_NOT_FOUND");
      const trip = await db.tripById(invite.tripId);
      if (!trip) throw notFound("TRIP_NOT_FOUND");
      if (trip.status === "CLOSED") throw conflict("TRIP_CLOSED");
      if (trip.status !== "PLANNED") throw conflict("TRIP_STARTED");
      const members = await db.tripMembersWithUser(trip.id);
      if (members.some((m) => m.userId === req.user!.id)) {
        res.json({ data: { joined: true } });
        return;
      }
      if (trip.quota !== null && members.length >= trip.quota) {
        throw conflict("QUOTA_FULL");
      }
      if (trip.price !== null && trip.leaderId !== req.user!.id) {
        if (!(await db.isPro(req.user!.id))) throw forbidden("PRO_REQUIRED");
      }
      await db.upsertMember(trip.id, req.user!.id, "MEMBER");
      if (trip.price !== null && trip.leaderId !== req.user!.id) {
        await db.createTripPayment(trip.id, req.user!.id, trip.price);
      }
      res.json({ data: { joined: true } });
    })().catch(next);
  });

  return r;
}
