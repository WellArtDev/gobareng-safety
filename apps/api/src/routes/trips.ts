// Trip, location, SOS, checkpoint, safety, headcount, share-link routes.
// Contract §2–§6 + §16–§17. A-1: backed by Prisma (src/db.ts) — response
// shapes are identical to the F2 in-memory version.
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { collectTripFacts, summarizeTrip } from "../ai.js";
import { requireAiModule } from "../ai-modules.js";
import { answerTripQuestion } from "../ai-qa.js";
import { collectReportFacts, generateReportNarrative } from "../ai-report.js";
import { collectLeaderFacts, summarizeLeaderBrief } from "../ai-leader.js";
import { param, requireAuth, tripGuard } from "../auth.js";
import { assessRisk } from "../risk.js";
import { memberGendersOf } from "../db.js";
import { config } from "../config.js";
import { collectSosWaRecipients, selectBystanders } from "../dispatch.js";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { SOS_LEVELS, SOS_REASONS, type SosReason, type TripRole } from "../store.js";
import type { Db } from "../db.js";
import type { Realtime } from "../realtime.js";
import { sendWhatsappSosAlert, whatsappProviderConfigured } from "../whatsapp.js";
import { sendSosPush, tripStartedPushPayload } from "../push.js";
import { dispatchNotificationChannels } from "../notify-channels.js";
// AI-P: detail SOS diperkaya foto + deskripsi AI (tambahan aditif).
import { withSosPhotos } from "../sos-photos-serialize.js";
// M6 live-tracking alerts (NO_MOVEMENT / OFF_ROUTE), computed on read.
import { isNoMovement, isOffRoute } from "../member-alerts.js";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function tripsRouter(db: Db, io: Realtime): Router {
  const r = Router();
  r.use(requireAuth);
  const member = tripGuard(db);
  const leader = tripGuard(db, true);
  // M3F read-only guards (GET routes only): dashboard roles may read any
  // trip's SOS/locations/headcount without being a member. Writes still
  // use member/leader above, unchanged.
  const reader = tripGuard(db, false, true);
  const leaderOrAdmin = tripGuard(db, true, true);

  // ---- Trips (§2, M1) ----
  r.post("/", (req, res, next) => {
    (async () => {
      const {
        name,
        type,
        date,
        meetingPoint,
        meetingLat,
        meetingLon,
        destination,
        destinationLat,
        destinationLon,
        quota,
        durationDays,
        isOpenTrip,
        price,
        mountainId,
        routeId,
      } = req.body ?? {};
      if (typeof name !== "string" || !name.trim()) throw badRequest("INVALID_PAYLOAD");
      if (type !== "HIKING" && type !== "TOURING") throw badRequest("INVALID_TRIP_TYPE");
      // TAUTAN RUTE (3 Nov 2026): wizard hiking boleh membawa pilihan
      // gunung/jalur. Touring tidak punya rute — field ini ditolak
      // tegas (bukan dibuang diam-diam, itu akar bug PR #191).
      const routeMountainId =
        typeof mountainId === "string" && mountainId.trim() ? mountainId.trim() : null;
      const routeRouteId =
        typeof routeId === "string" && routeId.trim() ? routeId.trim() : null;
      if (
        (mountainId !== undefined && mountainId !== null && routeMountainId === null) ||
        (routeId !== undefined && routeId !== null && routeRouteId === null)
      ) {
        throw badRequest("INVALID_PAYLOAD");
      }
      if (type === "TOURING" && (routeMountainId || routeRouteId)) {
        throw badRequest("INVALID_ROUTE");
      }
      let routeLink: {
        mountainId: string | null;
        routeId: string | null;
        posts: { name: string; lat: number; lon: number }[];
      } = { mountainId: null, routeId: null, posts: [] };
      if (type === "HIKING" && (routeMountainId || routeRouteId)) {
        const resolved = await db.resolveTripRoute(routeMountainId, routeRouteId);
        if (!resolved) throw badRequest("INVALID_ROUTE");
        routeLink = resolved;
      }
      if (typeof date !== "string" || typeof meetingPoint !== "string") {
        throw badRequest("INVALID_PAYLOAD");
      }
      // Optional meeting-point coordinates: both or neither.
      const lat = num(meetingLat);
      const lon = num(meetingLon);
      if ((lat === null) !== (lon === null)) throw badRequest("INVALID_LOCATION");
      // Optional destination coordinates (touring): both or neither.
      const dlat = num(destinationLat);
      const dlon = num(destinationLon);
      if ((dlat === null) !== (dlon === null)) throw badRequest("INVALID_LOCATION");
      if (destination !== undefined && typeof destination !== "string") {
        throw badRequest("INVALID_PAYLOAD");
      }
      const quotaNum = num(quota);
      if (quotaNum !== null && (quotaNum < 2 || !Number.isInteger(quotaNum))) {
        throw badRequest("INVALID_PAYLOAD");
      }
      // SET-7/8: durasi hari opsional (>=3 hari = salah satu pemicu
      // high-risk; penilaian di endpoint risk, bukan blokir di sini).
      const durationNum = num(durationDays);
      if (durationNum !== null && (durationNum < 1 || !Number.isInteger(durationNum))) {
        throw badRequest("INVALID_PAYLOAD");
      }
      // PAY: trip berbayar hanya untuk member Pro (S&K §2/§4).
      const priceNum = num(price);
      if (priceNum !== null) {
        if (priceNum < 1000 || !Number.isInteger(priceNum)) {
          throw badRequest("INVALID_PAYLOAD");
        }
        if (!(await db.isPro(req.user!.id))) throw forbidden("PRO_REQUIRED");
        // Rekening organizer (PR rekening-organizer): trip berbayar
        // hanya boleh dibuat bila rekening organizer sudah lengkap —
        // member harus bisa melihat tujuan transfer di paid-join.
        if (!(await db.bankDetailsOf(req.user!.id))) {
          throw badRequest("ORGANIZER_BANK_DETAILS_REQUIRED");
        }
      }
      // BUAT TRIP WAJIB HP (2 Nov 2026): pembuat otomatis jadi leader,
      // dan nomor leader dipakai link WA di landing undangan saat kuota
      // penuh — tanpa HP tersimpan, pembuatan trip baru ditolak.
      const creator = await db.userById(req.user!.id);
      if (!creator?.phone || !creator.phone.trim()) {
        throw badRequest("PHONE_REQUIRED");
      }
      const trip = await db.createTrip({
        name: name.trim(),
        type,
        date,
        meetingPoint,
        meetingLat: lat,
        meetingLon: lon,
        destination:
          typeof destination === "string" && destination.trim()
            ? destination.trim()
            : null,
        destinationLat: dlat,
        destinationLon: dlon,
        quota: quotaNum,
        durationDays: durationNum,
        isOpenTrip: isOpenTrip === true,
        price: priceNum,
        leaderId: req.user!.id,
        mountainId: routeLink.mountainId,
        routeId: routeLink.routeId,
        routePosts: routeLink.posts,
      });
      res.status(201).json({ data: { trip } });
    })().catch(next);
  });

  r.get("/", (req, res, next) => {
    (async () => {
      // Dashboard roles (admin + command_center) monitor every trip from
      // posko; regular users keep the member/open-trip filter. The role
      // is read from the DB, never from the JWT claim.
      const trips = (await db.isDashboardRole(req.user!.id))
        ? await db.listTrips()
        : await db.listTripsForUser(req.user!.id);
      res.json({ data: { trips } });
    })().catch(next);
  });

  // A-5 §2: kalender trip saya, dikelompokkan per tanggal. HARUS terdaftar
  // sebelum "/:id" supaya "calendar" tidak tertangkap sebagai id trip.
  r.get("/calendar", (req, res, next) => {
    (async () => {
      const trips = await db.tripsByMembership(req.user!.id);
      const byDate = new Map<string, typeof trips>();
      for (const trip of trips) {
        const list = byDate.get(trip.date) ?? [];
        list.push(trip);
        byDate.set(trip.date, list);
      }
      const days = [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, dayTrips]) => ({ date, trips: dayTrips }));
      res.json({ data: { days } });
    })().catch(next);
  });

  // SET-7: penilaian high-risk PRA-BUAT (dipanggil form buat trip) —
  // warning saja, tidak memblokir pembuatan. Terdaftar sebelum "/:id".
  r.post("/risk-assessment", (req, res, next) => {
    (async () => {
      const { date, mountainId, durationDays, quota, lat, lon } = req.body ?? {};
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw badRequest("INVALID_PAYLOAD");
      }
      const assessment = await assessRisk(db, {
        date,
        mountainId: typeof mountainId === "string" ? mountainId : null,
        durationDays: num(durationDays),
        quota: num(quota),
        lat: num(lat),
        lon: num(lon),
      });
      res.json({ data: { assessment } });
    })().catch(next);
  });

  r.get("/:id", reader, (req, res) => res.json({ data: { trip: req.trip } }));

  // SET-7: penilaian high-risk trip HIDUP — termasuk komposisi gender
  // anggota aktual (mayoritas perempuan >50% dari yang mengisi gender).
  r.get("/:id/risk", reader, (req, res, next) => {
    (async () => {
      const trip = req.trip!;
      const assessment = await assessRisk(db, {
        date: trip.date,
        durationDays: trip.durationDays,
        quota: trip.quota,
        lat: trip.meetingLat,
        lon: trip.meetingLon,
        genders: await memberGendersOf(db, trip.id),
      });
      res.json({ data: { assessment } });
    })().catch(next);
  });

  // A-5 §2: ringkasan trip (bahan narasi AI §13.3 PRD + layar recap).
  r.get("/:id/recap", reader, (req, res, next) => {
    (async () => {
      const counts = await db.tripRecap(req.trip!.id);
      res.json({ data: { recap: { trip: req.trip, ...counts } } });
    })().catch(next);
  });

  // A-5 §2: feed aktivitas trip, diturunkan dari kejadian yang sudah ada
  // (SOS + pos + check-in), terbaru dulu. Kode kind, bukan teks UI (§19).
  r.get("/:id/activities", reader, (req, res, next) => {
    (async () => {
      res.json({ data: { activities: await db.tripActivities(req.trip!.id) } });
    })().catch(next);
  });

  r.patch("/:id", leader, (req, res, next) => {
    (async () => {
      const { name, meetingPoint, meetingLat, meetingLon, quota } = req.body ?? {};
      const data: {
        name?: string;
        meetingPoint?: string;
        meetingLat?: number | null;
        meetingLon?: number | null;
        quota?: number | null;
      } = {};
      if (typeof name === "string" && name.trim()) data.name = name.trim();
      if (typeof meetingPoint === "string") data.meetingPoint = meetingPoint;
      if (num(meetingLat) !== null && num(meetingLon) !== null) {
        data.meetingLat = meetingLat as number;
        data.meetingLon = meetingLon as number;
      }
      if (num(quota) !== null && Number.isInteger(quota) && (quota as number) >= 2) {
        data.quota = quota as number;
      }
      const trip = await db.updateTrip(req.trip!.id, data);
      res.json({ data: { trip: trip ?? req.trip } });
    })().catch(next);
  });

  r.delete("/:id", leader, (req, res, next) => {
    (async () => {
      await db.deleteTrip(req.trip!.id);
      res.json({ data: { deleted: true } });
    })().catch(next);
  });

  r.get("/:id/members", reader, (req, res, next) => {
    (async () => {
      const members = await db.tripMembersWithUser(req.trip!.id);
      res.json({ data: { members } });
    })().catch(next);
  });

  r.post("/:id/join", (req, res, next) => {
    (async () => {
      const trip = await db.tripById(param(req, "id"));
      if (!trip) throw notFound("TRIP_NOT_FOUND");
      if (trip.status === "CLOSED") throw conflict("TRIP_CLOSED");
      // PAY: trip berbayar hanya bisa diikuti member Pro (S&K §2),
      // dan join membuat tagihan WAITING (transfer manual, konfirmasi
      // organizer §4). Leader sendiri tidak ditagih.
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

  r.post("/:id/leave", member, (req, res, next) => {
    (async () => {
      await db.removeMember(req.trip!.id, req.user!.id);
      res.json({ data: { left: true } });
    })().catch(next);
  });

  r.post("/:id/start", leader, (req, res, next) => {
    (async () => {
      // Guard trip expired (QA 2 Nov 2026): trip PLANNED yang tanggalnya
      // sudah lewat tidak bisa dimulai — semantik tanggal sama seperti
      // mobile isTripDatePast (awal hari lokal, tanggal tak valid =
      // bukan past). Guard leader dari tripGuard tetap berlaku duluan.
      const trip = req.trip!;
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(trip.date ?? "");
      const month = m ? Number(m[2]) : 0;
      const day = m ? Number(m[3]) : 0;
      const today = new Date().toISOString().slice(0, 10);
      const datePast =
        !!m &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31 &&
        trip.date.slice(0, 10) < today;
      if (trip.status === "PLANNED" && datePast) {
        throw conflict("TRIP_EXPIRED");
      }
      // Start Trip otomatis Berangkat (keputusan pemilik 3 Nov 2026
      // 16:51 WIB): HANYA transisi PLANNED -> ACTIVE yang menandai
      // semua anggota DEPARTED + memberi notifikasi. Start ulang pada
      // trip yang sudah ACTIVE (atau CLOSED yang dibuka lagi) tetap
      // berperilaku lama — tanpa tandai ulang, tanpa notifikasi
      // ganda. TIDAK retroaktif: trip yang sudah ACTIVE sebelum PR
      // ini tidak diubah.
      if (trip.status !== "PLANNED") {
        const started = await db.updateTrip(trip.id, { status: "ACTIVE" });
        res.json({ data: { trip: started } });
        return;
      }
      const activated = await db.activateTrip(trip.id);
      if (!activated) {
        const started = await db.updateTrip(trip.id, { status: "ACTIVE" });
        res.json({ data: { trip: started } });
        return;
      }
      const members = await db.tripMembers(trip.id);
      const memberIds = members.map((m) => m.userId);
      const leader = await db.userById(trip.leaderId);
      // In-app: satu baris TRIP_STARTED per anggota (termasuk leader —
      // broadcast harfiah "semua member"). Gagal tulis notifikasi
      // tidak boleh membatalkan start yang sudah commit.
      await db
        .notifyUsers(memberIds, "TRIP_STARTED", {
          tripId: trip.id,
          refId: trip.id,
          actorName: leader?.name ?? null,
        })
        .catch(() => undefined);
      // Push FCM via jalur SOS yang sudah ada (fail-soft +
      // fire-and-forget): tanpa token / tanpa kredensial = tidak ada
      // push, start tetap sukses. Ini pemicu tracking anggota: ketuk
      // notifikasi -> layar tracking -> pengirim posisi jalan.
      // GPS anggota TIDAK bisa dinyalakan dari jauh oleh HP leader.
      void sendSosPush(
        db,
        memberIds,
        tripStartedPushPayload(trip.name, trip.id),
      );
      res.json({ data: { trip: activated.trip } });
    })().catch(next);
  });

  r.patch("/:id/members/:userId/role", leader, (req, res, next) => {
    (async () => {
      const { role } = req.body ?? {};
      const roles: TripRole[] = ["LEADER", "SWEEPER", "MEDIC", "MEMBER"];
      if (!roles.includes(role)) throw badRequest("INVALID_ROLE");
      const m = await db.updateMember(req.trip!.id, param(req, "userId"), { role });
      if (!m) throw notFound("MEMBER_NOT_FOUND");
      res.json({ data: { member: m } });
    })().catch(next);
  });

  // Berangkat (§2): meeting-point check-in + headcount summary.
  r.post("/:id/check-in-meeting-point", member, (req, res, next) => {
    (async () => {
      const m = await db.updateMember(req.trip!.id, req.user!.id, {
        attendance: "DEPARTED",
      });
      res.json({ data: { member: m } });
    })().catch(next);
  });

  r.get("/:id/attendance-summary", leaderOrAdmin, (req, res, next) => {
    (async () => {
      const members = await db.tripMembers(req.trip!.id);
      res.json({
        data: {
          total: members.length,
          departed: members.filter((m) => m.attendance === "DEPARTED").length,
          notDeparted: members.filter((m) => m.attendance !== "DEPARTED").length,
        },
      });
    })().catch(next);
  });

  // ---- Locations (§3, M1/M5) ----
  r.post("/:id/locations", member, (req, res, next) => {
    (async () => {
      const { lat, lon, accuracy, speed, heading, altitude, batteryLevel, timestamp, isMock } =
        req.body ?? {};
      if (num(lat) === null || num(lon) === null) throw badRequest("INVALID_LOCATION");
      // A-3 (ERD catatan 3): posisi dari mock-location provider ditolak
      // eksplisit — fitur safety tidak boleh diberi posisi palsu.
      if (isMock === true) throw badRequest("MOCK_LOCATION_REJECTED");
      const loc = await db.addLocation({
        tripId: req.trip!.id,
        userId: req.user!.id,
        lat: lat as number,
        lon: lon as number,
        accuracy: num(accuracy) ?? undefined,
        speed: num(speed) ?? undefined,
        heading: num(heading) ?? undefined,
        altitude: num(altitude) ?? undefined,
        batteryLevel: num(batteryLevel) ?? undefined,
        ts: typeof timestamp === "string" ? timestamp : new Date().toISOString(),
      });
      io.toTrip(req.trip!.id, "location-update", {
        userId: loc.userId,
        tripId: loc.tripId,
        lat: loc.lat,
        lon: loc.lon,
        speed: loc.speed,
        batteryLevel: loc.batteryLevel,
        ts: loc.ts,
      });
      // ---- M7: compaction posisi lama (AWAL BLOK M7) ----
      // Hanya member ini, hanya baris lebih tua dari 30 menit
      // (pertama + terakhir per jendela 5 menit — position-compaction.ts).
      // Best-effort: gagal compaction tidak boleh menggagalkan 201.
      try {
        await db.compactLocationsForMember(req.trip!.id, req.user!.id);
      } catch {
        // Housekeeping saja; insert + broadcast di atas sudah sah.
      }
      // ---- M7: compaction posisi lama (AKHIR BLOK M7) ----
      res.status(201).json({ data: { location: loc } });
    })().catch(next);
  });

  r.get("/:id/locations", reader, (req, res, next) => {
    (async () => {
      res.json({ data: { locations: await db.latestLocations(req.trip!.id) } });
    })().catch(next);
  });

  // CC: members joined with their latest position in one call (name +
  // role + lat/lon/altitude/batteryLevel/ts; location null when the
  // member has not reported yet). Read access = member or dashboard,
  // same as /locations above.
  r.get("/:id/positions", reader, (req, res, next) => {
    (async () => {
      res.json({ data: { positions: await db.tripPositions(req.trip!.id) } });
    })().catch(next);
  });

  // ---- AI safety summary (PRD §13.3, stretch S4; Meta Muse Spark Open) ----
  // Read-only, dashboard/member read access like other GET routes.
  // Fail-soft: 503 AI_NOT_CONFIGURED without env, 502 on upstream error.
  // `model` in the response drives the client's "Built with Muse Spark
  // Open" attribution chip (hackathon requirement).
  r.get("/:id/ai-summary", reader, (req, res, next) => {
    (async () => {
      const facts = await collectTripFacts(db, req.trip!);
      const { summary, model } = await summarizeTrip(facts);
      res.json({ data: { summary, model, generatedAt: new Date().toISOString() } });
    })().catch(next);
  });

  // ---- AI-Q: tanya-jawab member trip ----
  // Guard member KETAT (bukan reader/dashboard bypass): hanya member
  // trip yang bersangkutan boleh bertanya/membaca riwayat trip itu.
  // Jawaban memakai fakta trip dari DB; di luar data -> notFound
  // (lihat ai-qa.ts). `model` membawa atribusi Muse Spark Open.
  r.post("/:id/qa", member, (req, res, next) => {
    (async () => {
      requireAiModule(await db.platformSettings(), "aiQ");
      const question =
        typeof req.body?.question === "string" ? req.body.question.trim() : "";
      if (!question || question.length > 1000) throw badRequest("INVALID_PAYLOAD");
      const result = await answerTripQuestion(db, req.trip!, question);
      const qa = await db.createTripQuestion({
        tripId: req.trip!.id,
        userId: req.user!.id,
        question,
        answer: result.answer,
        notFound: result.notFound,
        sources: result.sources,
        model: result.model,
        links: result.links,
      });
      res.status(201).json({ data: { qa } });
    })().catch(next);
  });

  r.get("/:id/qa", member, (req, res, next) => {
    (async () => {
      requireAiModule(await db.platformSettings(), "aiQ");
      res.json({ data: { qa: await db.listTripQuestions(req.trip!.id) } });
    })().catch(next);
  });

  // ---- AI-R: laporan pasca-trip (tersimpan, bukan sekali pakai) ----
  // Generate = leader trip + admin (role admin dari DB, bukan klaim
  // JWT; command_center TIDAK boleh generate — hanya baca lewat
  // guard reader di GET). Hanya trip CLOSED. Regenerate MENIMPA
  // laporan yang sama (version naik, createdAt pertama dipertahankan)
  // — tidak ada riwayat versi. Baca = anggota trip + dashboard
  // (reader), jadi anggota boleh membaca laporannya sendiri.
  // Gagal AI (503/502) terjadi SEBELUM penyimpanan: tidak ada laporan
  // palsu yang pernah ditulis. `model` memicu atribusi klien
  // "Built with Muse Spark Open".
  const reportGenerator = (
    req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ): void => {
    (async () => {
      const trip = await db.tripById(param(req, "id"));
      if (!trip) return next(notFound("TRIP_NOT_FOUND"));
      if ((await db.roleOf(req.user?.id)) === "admin") {
        req.trip = trip;
        return next();
      }
      const member = req.user ? await db.memberOf(trip.id, req.user.id) : null;
      if (!member) return next(forbidden("NOT_TRIP_MEMBER"));
      if (member.role !== "LEADER" && trip.leaderId !== req.user?.id) {
        return next(forbidden("LEADER_ONLY"));
      }
      req.trip = trip;
      return next();
    })().catch(next);
  };

  r.post("/:id/trip-report", reportGenerator, (req, res, next) => {
    (async () => {
      requireAiModule(await db.platformSettings(), "aiR");
      const trip = req.trip!;
      if (trip.status !== "CLOSED") throw conflict("TRIP_NOT_CLOSED");
      const facts = await collectReportFacts(db, trip);
      const { summary, model } = await generateReportNarrative(facts);
      const { report, created } = await db.upsertTripReport({
        tripId: trip.id,
        generatedById: req.user!.id,
        summary,
        model,
        facts,
      });
      res.status(created ? 201 : 200).json({
        data: { report: { ...report, isRegenerated: report.version > 1 } },
      });
    })().catch(next);
  });

  r.get("/:id/trip-report", reader, (req, res, next) => {
    (async () => {
      requireAiModule(await db.platformSettings(), "aiR");
      const report = await db.tripReportByTrip(req.trip!.id);
      if (!report) throw notFound("REPORT_NOT_FOUND");
      res.json({
        data: { report: { ...report, isRegenerated: report.version > 1 } },
      });
    })().catch(next);
  });

  // ---- AI-L: asisten leader (leader trip / admin dashboard saja) ----
  // Fakta terstruktur SELALU dikembalikan (angka dari DB); narasi AI
  // opsional dan fail-soft: tanpa konfigurasi model -> summary null +
  // aiStatus AI_NOT_CONFIGURED (bukan 503), upstream gagal ->
  // AI_UPSTREAM_ERROR. `model` menggerakkan chip atribusi
  // "Built with Muse Spark Open" di klien, sama seperti ai-summary.
  r.get("/:id/leader-assistant", leaderOrAdmin, (req, res, next) => {
    (async () => {
      requireAiModule(await db.platformSettings(), "aiL");
      const facts = await collectLeaderFacts(db, req.trip!);
      try {
        const { summary, model } = await summarizeLeaderBrief(facts);
        res.json({ data: { summary, model, aiStatus: "OK", facts } });
      } catch (e) {
        const code =
          e instanceof Error && "code" in e
            ? (e as { code?: string }).code
            : undefined;
        res.json({
          data: {
            summary: null,
            model: null,
            aiStatus:
              code === "AI_NOT_CONFIGURED"
                ? "AI_NOT_CONFIGURED"
                : "AI_UPSTREAM_ERROR",
            facts,
          },
        });
      }
    })().catch(next);
  });

  // ---- SOS (§4, M2) ----
  r.post("/:id/sos", member, (req, res, next) => {
    (async () => {
      const trip = req.trip!;
      const { reason, lat, lon } = req.body ?? {};
      if (!SOS_REASONS[trip.type].includes(reason as SosReason)) {
        throw badRequest("SOS_REASON_INVALID_FOR_TRIP_TYPE");
      }
      if (num(lat) === null || num(lon) === null) throw badRequest("INVALID_LOCATION");
      // Locked PRD rule (arsitektur §6): 1 active SOS per user per trip.
      if (await db.hasActiveSos(trip.id, req.user!.id)) {
        throw conflict("SOS_ALREADY_ACTIVE");
      }
      const alert = await db.createSos({
        tripId: trip.id,
        senderId: req.user!.id,
        reason: reason as SosReason,
        level: SOS_LEVELS[reason as SosReason],
        lat: lat as number,
        lon: lon as number,
      });
      io.toTrip(trip.id, "sos-trigger", {
        sosId: alert.id,
        tripId: trip.id,
        userId: alert.senderId,
        reason: alert.reason,
        lat: alert.lat,
        lon: alert.lon,
        level: alert.level,
        status: alert.status,
      });
      // M2 bystander dispatch (2 km, sender excluded, once per SOS id):
      // targeted in-app alert to bystanders only. A-4 (keputusan 28 Okt):
      // WA official Cloud API dikirim ke KETIGA kelompok — kontak darurat
      // pengirim + HP leader + bystander ber-HP. WA fail-soft dan tidak
      // menunda respons; tiap percobaan dicatat ke WaDispatchLog untuk
      // dashboard backend.
      const bystanders = await selectBystanders(db, alert);
      let waRecipients: Awaited<ReturnType<typeof collectSosWaRecipients>> = [];
      if (db.recordDispatch(alert.id)) {
        const dispatched = bystanders.map((b) => b.userId);
        io.toUsers(dispatched, "sos-bystander-alert", {
          sosId: alert.id,
          tripId: trip.id,
          userId: alert.senderId,
          reason: alert.reason,
          lat: alert.lat,
          lon: alert.lon,
          level: alert.level,
          status: alert.status,
          bystanderUserIds: dispatched,
          bystanders: bystanders.map((b) => ({
            userId: b.userId,
            distanceKm: Math.round(b.distanceKm * 100) / 100,
          })),
        });
        // Matriks Pengaturan: toggle SOS-WhatsApp mengontrol WA SOS
        // ini (bukan Brevo). Jalur kirim ikut setting whatsappProvider
        // (official/dikontak) lewat dispatch terpusat whatsapp.ts.
        // Toggle mati = WA SOS dilewati total, tanpa log kirim.
        const sosSettings = await db.platformSettings();
        if (!sosSettings.notifSosWhatsapp) {
          waRecipients = [];
        } else {
          waRecipients = await collectSosWaRecipients(
            db,
            alert,
            trip.leaderId,
            bystanders,
          );
        }
        const waProvider = sosSettings.whatsappProvider ?? "official";
        const senderName =
          (await db.userById(alert.senderId))?.name ?? "Pengguna GoBareng";
        for (const recipient of waRecipients) {
          if (!whatsappProviderConfigured(waProvider)) {
            void db.logWaDispatch({
              sosId: alert.id,
              tripId: trip.id,
              toPhone: recipient.phone,
              recipient: recipient.kind,
              status: "SKIPPED_UNCONFIGURED",
            });
            continue;
          }
          // Fire-and-forget: hasil kirim dicatat tanpa menunda respons.
          // Detail error penyedia (mis. pesan validator dikontak)
          // dicatat di log, bukan ditelan.
          void sendWhatsappSosAlert(
            recipient.phone,
            waProvider,
            {
              senderName,
              reason: alert.reason,
              lat: alert.lat,
              lon: alert.lon,
            },
          ).then((r) =>
            db.logWaDispatch({
              sosId: alert.id,
              tripId: trip.id,
              toPhone: recipient.phone,
              recipient: recipient.kind,
              status: r.ok ? "SENT" : "FAILED",
              error: r.ok ? null : (r.detail ?? r.errorCode ?? "send-failed"),
            }),
          );
        }
        // M2 channel ketiga — push FCM: penerima = bystander + leader
        // (kontak darurat bukan user, tidak punya token). Fail-soft
        // dan fire-and-forget seperti WA di atas. FCM satu-satunya
        // jalur (keputusan Wella 3 Nov 2026); tanpa setting penyedia,
        // tanpa fallback.
        void sendSosPush(
          db,
          [
            ...bystanders.map((b) => b.userId),
            trip.leaderId,
          ].filter((id) => id !== alert.senderId),
          {
            title: "GoBareng SOS",
            body: `SOS dari ${(await db.userById(alert.senderId))?.name ?? "anggota"}: ${alert.reason}`,
            data: {
              sosId: alert.id,
              tripId: trip.id,
              lat: alert.lat,
              lon: alert.lon,
            },
          },
        );
      }
      // Dashboard notification feed (contract §9): one row per
      // dashboard account, once per SOS (created here only).
      await db.notifyDashboard("SOS_TRIGGERED", {
        tripId: trip.id,
        refId: alert.id,
        actorName: (await db.userById(alert.senderId))?.name ?? null,
      });
      // Kanal tambahan matriks Pengaturan (SOS): email + SMS Brevo
      // ke leader trip; WA dilewati di sini karena sudah ditangani
      // Meta Cloud API di atas (skipWhatsapp).
      {
        const leader = await db.userById(trip.leaderId);
        const sosSettings2 = await db.platformSettings();
        void dispatchNotificationChannels(sosSettings2, "sos", {
          subject: "GoBareng SOS: bantuan dibutuhkan",
          message: `SOS di trip ${trip.name}: ${alert.reason}. Lokasi ${alert.lat}, ${alert.lon}.`,
          emails: leader ? [leader.email] : [],
          phones: leader?.phone ? [leader.phone] : [],
          skipWhatsapp: true,
        });
      }
      // waRecipients: nomor tujuan WA (ketiga kelompok A-4) — dipakai
      // tes integrasi + transparansi klien; bukan data sensitif baru
      // (pengirim sendiri yang memicu dispatch ini).
      res.status(201).json({
        data: { sos: alert, waRecipients: waRecipients.map((r) => r.phone) },
      });
    })().catch(next);
  });

  // status === null means "signal only": emit the event, do not change status.
  // RBAC: command-center operators are not trip members, but ack and
  // resolve are their core posko work, so those two transitions also
  // accept a dashboard role. All other transitions keep the strict
  // member/leader guards — the dashboard bypass never widens them.
  const sosOperator = (needLeader: boolean) => {
    const fallback = needLeader ? leader : member;
    return (
      req: import("express").Request,
      res: import("express").Response,
      next: import("express").NextFunction,
    ): void => {
      (async () => {
        const trip = await db.tripById(param(req, "id"));
        if (!trip) return next(notFound("TRIP_NOT_FOUND"));
        if (await db.isDashboardRole(req.user?.id)) {
          req.trip = trip;
          return next();
        }
        return fallback(req, res, next);
      })().catch(next);
    };
  };
  const sosTransition = (status: string | null, event: string, guardLeader = false, dashboardOk = false) => {
    const guard = dashboardOk ? sosOperator(guardLeader) : guardLeader ? leader : member;
    return [
      guard,
      (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
        (async () => {
          let alert = await db.sosById(param(req, "sosId"));
          if (!alert || alert.tripId !== req.trip!.id) return next(notFound("SOS_NOT_FOUND"));
          if (status === "CANCELLED" && alert.senderId !== req.user!.id) {
            return next(forbidden("SENDER_ONLY"));
          }
          if (status !== null) {
            alert = (await db.updateSosStatus(alert.id, status as typeof alert.status)) ?? alert;
          }
          io.toTrip(req.trip!.id, event, {
            sosId: alert.id,
            tripId: req.trip!.id,
            byUserId: req.user!.id,
            status: alert.status,
          });
          res.json({ data: { sos: alert } });
        })().catch(next);
      },
    ];
  };

  r.patch("/:id/sos/:sosId/acknowledge", ...sosTransition("ACKNOWLEDGED", "sos-acknowledge", false, true));
  r.patch("/:id/sos/:sosId/in-progress", ...sosTransition("IN_PROGRESS", "sos-in-progress", true));
  r.patch("/:id/sos/:sosId/resolve", ...sosTransition("RESOLVED", "sos-resolve", true, true));
  r.patch("/:id/sos/:sosId/cancel", ...sosTransition("CANCELLED", "sos-cancel"));
  r.patch("/:id/sos/:sosId/false-alarm", ...sosTransition("FALSE_ALARM", "sos-false-alarm", true));
  r.patch("/:id/sos/:sosId/flash-signal", ...sosTransition(null, "sos-flash-signal"));

  r.get("/:id/sos", reader, (req, res, next) => {
    (async () => {
      // [ACTIVITY] name the sender: the web used to render the raw
      // senderId because this endpoint carried no name. Additive only.
      const rows = await db.tripSos(req.trip!.id);
      const sos = await Promise.all(
        rows.map(async (s) =>
          withSosPhotos(db, "TRIP", {
            ...s,
            senderName: (await db.userById(s.senderId))?.name ?? null,
          }),
        ),
      );
      res.json({ data: { sos } });
    })().catch(next);
  });

  r.get("/:id/sos/:sosId", reader, (req, res, next) => {
    (async () => {
      const alert = await db.sosById(param(req, "sosId"));
      if (!alert || alert.tripId !== req.trip!.id) return next(notFound("SOS_NOT_FOUND"));
      res.json({ data: { sos: await withSosPhotos(db, "TRIP", alert) } });
    })().catch(next);
  });

  // ---- Safety (§5, M3 input) ----
  r.get("/:id/safety-score", reader, (req, res, next) => {
    (async () => {
      // Placeholder formula for F2; refined by M3/M6 cards.
      const now = Date.now();
      const latest = await db.latestLocations(req.trip!.id);
      const stale = latest.filter(
        (l) => now - Date.parse(l.ts) > config.signalLossMinutes * 60_000,
      ).length;
      const activeSos = (await db.tripSos(req.trip!.id)).filter(
        (s) => s.status === "ACTIVE",
      ).length;
      const score = Math.max(0, 100 - stale * 10 - activeSos * 25);
      res.json({ data: { score, staleMembers: stale, activeSos } });
    })().catch(next);
  });

  r.get("/:id/member-alerts", leaderOrAdmin, (req, res, next) => {
    (async () => {
      const now = Date.now();
      const trip = req.trip!;
      const latest = await db.latestLocations(trip.id);
      const stale = latest.filter(
        (l) =>
          now - Date.parse(l.ts) > config.signalLossMinutes * 60_000 ||
          (l.batteryLevel !== undefined && l.batteryLevel < 20),
      );
      // [ACTIVITY] name the alert owner: the web used to render the
      // raw userId because this endpoint carried no name. Additive only.
      // M6: old rows keep every field; `type` is additive (a member who
      // is both stale and low-battery keeps a single row, SIGNAL_LOSS
      // taking precedence, with batteryLevel still carried).
      const alerts: {
        userId: string;
        lastSeen: string;
        batteryLevel?: number;
        userName: string | null;
        type: string;
      }[] = await Promise.all(
        stale.map(async (l) => ({
          userId: l.userId,
          lastSeen: l.ts,
          batteryLevel: l.batteryLevel,
          userName: (await db.userById(l.userId))?.name ?? null,
          type:
            now - Date.parse(l.ts) > config.signalLossMinutes * 60_000
              ? "SIGNAL_LOSS"
              : "LOW_BATTERY",
        })),
      );
      // M6 (ACTIVE trips only): NO_MOVEMENT + OFF_ROUTE, computed from
      // bounded recent history per member. Stateless evaluation = the
      // anti-flood rule: at most one row per member+type per response,
      // reappearing only after the condition clears and re-qualifies.
      // Non-ACTIVE trips keep exactly the old behavior above.
      if (trip.status === "ACTIVE") {
        const checkpoints = await db.tripCheckpoints(trip.id);
        const since = new Date(now - 2 * config.signalLossMinutes * 60_000).toISOString();
        for (const l of latest) {
          const history = await db.locationsSince(trip.id, l.userId, since);
          const userName = (await db.userById(l.userId))?.name ?? null;
          if (isNoMovement(history, now)) {
            alerts.push({ userId: l.userId, lastSeen: l.ts, userName, type: "NO_MOVEMENT" });
          }
          if (isOffRoute(history.slice(-2), checkpoints)) {
            alerts.push({ userId: l.userId, lastSeen: l.ts, userName, type: "OFF_ROUTE" });
          }
        }
      }
      res.json({ data: { alerts } });
    })().catch(next);
  });

  // ---- Checkpoints (§6, M4) ----
  r.post("/:id/checkpoints", leader, (req, res, next) => {
    (async () => {
      const { name, lat, lon } = req.body ?? {};
      if (typeof name !== "string" || num(lat) === null || num(lon) === null) {
        throw badRequest("INVALID_PAYLOAD");
      }
      const cp = await db.createCheckpoint({
        tripId: req.trip!.id,
        name,
        lat: lat as number,
        lon: lon as number,
      });
      res.status(201).json({ data: { checkpoint: cp } });
    })().catch(next);
  });

  r.get("/:id/checkpoints", reader, (req, res, next) => {
    (async () => {
      res.json({ data: { checkpoints: await db.tripCheckpoints(req.trip!.id) } });
    })().catch(next);
  });

  r.patch("/:id/checkpoints/:checkpointId", leader, (req, res, next) => {
    (async () => {
      const cp = await db.checkpointById(param(req, "checkpointId"));
      if (!cp || cp.tripId !== req.trip!.id) return next(notFound("CHECKPOINT_NOT_FOUND"));
      const { name, lat, lon } = req.body ?? {};
      const data: { name?: string; lat?: number; lon?: number } = {};
      if (typeof name === "string") data.name = name;
      if (num(lat) !== null) data.lat = lat as number;
      if (num(lon) !== null) data.lon = lon as number;
      const updated = await db.updateCheckpoint(cp.id, data);
      res.json({ data: { checkpoint: updated ?? cp } });
    })().catch(next);
  });

  r.delete("/:id/checkpoints/:checkpointId", leader, (req, res, next) => {
    (async () => {
      const cp = await db.checkpointById(param(req, "checkpointId"));
      if (!cp || cp.tripId !== req.trip!.id) return next(notFound("CHECKPOINT_NOT_FOUND"));
      await db.deleteCheckpoint(cp.id);
      res.json({ data: { deleted: true } });
    })().catch(next);
  });

  r.post("/:id/checkpoints/:checkpointId/check-in", member, (req, res, next) => {
    (async () => {
      const cp = await db.checkpointById(param(req, "checkpointId"));
      if (!cp || cp.tripId !== req.trip!.id) return next(notFound("CHECKPOINT_NOT_FOUND"));
      const ci = await db.addCheckIn(cp.id, req.user!.id);
      const actorName = (await db.userById(req.user!.id))?.name ?? null;
      await db.notifyDashboard("CHECKPOINT_CHECKIN", {
        tripId: req.trip!.id,
        refId: cp.id,
        actorName,
      });
      // SET-3: leader trip ikut diberi tahu (keputusan Wella 1 Nov 2026:
      // penerima = leader). Check-in leader sendiri tidak memberi notif
      // dirinya; toggle notifCheckin mematikan jalur leader ini saja
      // (feed dashboard tetap).
      if (req.trip!.leaderId !== req.user!.id) {
        const settings = await db.platformSettings();
        if (settings.notifCheckin) {
          await db.notifyUser(req.trip!.leaderId, "CHECKPOINT_CHECKIN", {
            tripId: req.trip!.id,
            refId: cp.id,
            actorName,
          });
        }
        const leader = await db.userById(req.trip!.leaderId);
        void dispatchNotificationChannels(settings, "checkin", {
          subject: "GoBareng: peserta check-in",
          message: `${actorName ?? "Peserta"} check-in di ${cp.name} (trip ${req.trip!.name}).`,
          emails: leader ? [leader.email] : [],
          phones: leader?.phone ? [leader.phone] : [],
        });
      }
      res.status(201).json({ data: { checkIn: ci } });
    })().catch(next);
  });

  r.get("/:id/checkpoints/:checkpointId/check-ins", reader, (req, res, next) => {
    (async () => {
      const cp = await db.checkpointById(param(req, "checkpointId"));
      if (!cp || cp.tripId !== req.trip!.id) return next(notFound("CHECKPOINT_NOT_FOUND"));
      res.json({ data: { checkIns: await db.checkpointCheckIns(cp.id) } });
    })().catch(next);
  });

  // ---- Headcount & close (§17, M4) ----
  r.get("/:id/headcount", leaderOrAdmin, (req, res, next) => {
    (async () => {
      const members = await db.tripMembers(req.trip!.id);
      const departed = members.filter((m) => m.attendance === "DEPARTED");
      res.json({
        data: {
          total: members.length,
          counted: departed.length,
          unaccounted: members.filter((m) => m.attendance !== "DEPARTED"),
        },
      });
    })().catch(next);
  });

  r.post("/:id/close", leader, (req, res, next) => {
    (async () => {
      const members = await db.tripMembers(req.trip!.id);
      const unaccounted = members.filter((m) => m.attendance !== "DEPARTED");
      // A trip must never close silently with members unaccounted for:
      // explicit confirmation (confirmUnaccounted) is required, never implicit.
      if (unaccounted.length > 0 && req.body?.confirmUnaccounted !== true) {
        throw conflict("TRIP_HAS_UNACCOUNTED_MEMBERS");
      }
      const trip = await db.updateTrip(req.trip!.id, { status: "CLOSED" });
      res.json({ data: { trip, unaccountedCount: unaccounted.length } });
    })().catch(next);
  });

  // ---- A-5 §13: rating organizer pasca-trip ----
  // Member menilai leader trip; sekali per (trip, penilai); leader tidak
  // menilai dirinya sendiri. Skor 1..5 bulat, komentar opsional.
  r.post("/:id/ratings", member, (req, res, next) => {
    (async () => {
      const score = num(req.body?.score);
      if (score === null || !Number.isInteger(score) || score < 1 || score > 5) {
        throw badRequest("INVALID_PAYLOAD");
      }
      const comment =
        typeof req.body?.comment === "string" && req.body.comment.trim()
          ? req.body.comment.trim()
          : null;
      const organizerId = req.trip!.leaderId;
      if (organizerId === req.user!.id) throw badRequest("CANNOT_RATE_SELF");
      const created = await db.createRating({
        tripId: req.trip!.id,
        raterId: req.user!.id,
        organizerId,
        score,
        comment,
      });
      if (created === "DUPLICATE") throw conflict("ALREADY_RATED");
      res.status(201).json({ data: { rating: { id: created.id, score, comment } } });
    })().catch(next);
  });

  // ---- PAY: pembayaran trip berbayar ----
  // Member lihat tagihan sendiri; LEADER (organizer) lihat semua +
  // konfirmasi penerimaan transfer manual (S&K §4).
  r.get("/:id/payments/me", member, (req, res, next) => {
    (async () => {
      const payment = await db.tripPaymentOf(req.trip!.id, req.user!.id);
      if (!payment) throw notFound("PAYMENT_NOT_FOUND");
      // Rekening organizer (PR rekening-organizer): hanya member yang
      // sudah gabung (guard member) yang melihatnya; null = organizer
      // belum mengisi (trip berbayar lama) -> layar menampilkan state
      // jujur, bukan kosong dan bukan nomor palsu.
      res.json({
        data: {
          payment,
          organizerBank: await db.bankDetailsOf(req.trip!.leaderId),
        },
      });
    })().catch(next);
  });

  r.get("/:id/payments", leader, (req, res, next) => {
    (async () => {
      res.json({ data: { payments: await db.tripPayments(req.trip!.id) } });
    })().catch(next);
  });

  r.post("/:id/payments/:paymentId/confirm", leader, (req, res, next) => {
    (async () => {
      const ok = await db.confirmTripPayment(
        req.trip!.id,
        String(req.params.paymentId),
      );
      if (!ok) throw notFound("PAYMENT_NOT_FOUND");
      res.json({ data: { confirmed: true } });
    })().catch(next);
  });

  // ---- Share links (§16) ----
  r.post("/:id/share-links", member, (req, res, next) => {
    (async () => {
      const { label, scope } = req.body ?? {};
      if (typeof label !== "string" || (scope !== "EMERGENCY_CONTACT" && scope !== "ANYONE")) {
        throw badRequest("INVALID_PAYLOAD");
      }
      const link = await db.createShareLink({
        tripId: req.trip!.id,
        label,
        scope,
        token: randomUUID().replace(/-/g, ""),
        createdBy: req.user!.id,
      });
      res.status(201).json({ data: { shareLink: link } });
    })().catch(next);
  });

  r.get("/:id/share-links", member, (req, res, next) => {
    (async () => {
      res.json({ data: { shareLinks: await db.tripShareLinks(req.trip!.id) } });
    })().catch(next);
  });

  r.delete("/:id/share-links/:linkId", member, (req, res, next) => {
    (async () => {
      const link = await db.shareLinkById(param(req, "linkId"));
      if (!link || link.tripId !== req.trip!.id) return next(notFound("SHARE_LINK_NOT_FOUND"));
      await db.revokeShareLink(link.id);
      res.json({ data: { revoked: true } });
    })().catch(next);
  });

  // ---- Trip invites (INVITE 2 Nov 2026) ----
  // HANYA leader trip (guard `leader`, bukan leaderOrAdmin): admin
  // sengaja TIDAK boleh membuat/melihat/mencabut undangan. Undangan
  // berlaku sampai trip dimulai: status harus PLANNED, kalau tidak
  // pembuatan ditolak (ACTIVE -> TRIP_STARTED, CLOSED -> TRIP_CLOSED).
  function inviteNotStartedError(status: string): string | null {
    if (status === "CLOSED") return "TRIP_CLOSED";
    if (status !== "PLANNED") return "TRIP_STARTED";
    return null;
  }

  r.post("/:id/invites", leader, (req, res, next) => {
    (async () => {
      const { label } = req.body ?? {};
      if (typeof label !== "string" || !label.trim()) {
        throw badRequest("INVALID_PAYLOAD");
      }
      const blocked = inviteNotStartedError(req.trip!.status);
      if (blocked) throw conflict(blocked);
      const invite = await db.createTripInvite({
        tripId: req.trip!.id,
        label: label.trim(),
        token: randomUUID().replace(/-/g, ""),
        createdBy: req.user!.id,
      });
      res.status(201).json({ data: { invite } });
    })().catch(next);
  });

  r.get("/:id/invites", leader, (req, res, next) => {
    (async () => {
      res.json({ data: { invites: await db.tripInvites(req.trip!.id) } });
    })().catch(next);
  });

  r.delete("/:id/invites/:inviteId", leader, (req, res, next) => {
    (async () => {
      const invite = await db.tripInviteById(param(req, "inviteId"));
      if (!invite || invite.tripId !== req.trip!.id) {
        return next(notFound("INVITE_NOT_FOUND"));
      }
      await db.revokeTripInvite(invite.id);
      res.json({ data: { revoked: true } });
    })().catch(next);
  });

  // ---- Ubah kuota trip (2 Nov 2026): leader + admin. Nilai baru
  // minimal = jumlah anggota saat ini (tidak boleh memangkas di bawah
  // anggota yang sudah ada) dan minimal 2; null (tanpa batas) tidak
  // diterima untuk update. Kuota null di trip = tanpa batas (tidak
  // pernah penuh) dan tetap begitu sampai diubah jadi angka.
  r.patch("/:id/quota", leaderOrAdmin, (req, res, next) => {
    (async () => {
      const { quota } = req.body ?? {};
      if (typeof quota !== "number" || !Number.isInteger(quota) || quota < 2) {
        throw badRequest("INVALID_PAYLOAD");
      }
      const memberCount = (await db.tripMembersWithUser(req.trip!.id)).length;
      if (quota < memberCount) throw conflict("QUOTA_BELOW_MEMBERS");
      const trip = await db.updateTrip(req.trip!.id, { quota });
      res.json({ data: { trip } });
    })().catch(next);
  });

  return r;
}
