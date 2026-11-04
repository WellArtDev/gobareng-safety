// AI-L — unit tests for the leader-assistant fact collector + prompt.
// All numbers in the output MUST come from the fake Db below, never
// from the model: these tests pin the counts, the overdue-reminder
// kinds, and the no-invention wording of the system prompt.
import { describe, expect, test } from "bun:test";
import type { Db } from "../db.js";
import type { Trip } from "../store.js";

const NOW = Date.now();
const isoMinAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const trip: Trip = {
  id: "trip-1",
  name: "Gede Test",
  type: "HIKING",
  date: "2020-01-01", // past date: rainfall window closed, no network fetch
  meetingPoint: "Basecamp",
  meetingLat: -6.7,
  meetingLon: 106.9,
  quota: 10,
  durationDays: 2,
  prevJoined: null,
  image: null,
  note: null,
  isOpenTrip: false,
  price: null,
  mountainId: null,
  routeId: null,
  mountainName: null,
  routeName: null,
  distanceKm: null,
  gainM: null,
  estHours: null,
  status: "ACTIVE",
  leaderId: "u-leader",
  createdAt: isoMinAgo(120),
};

// Fake Db: only the methods collectLeaderFacts touches, cast to Db.
function fakeDb(): Db {
  const members = [
    {
      tripId: "trip-1",
      userId: "u-leader",
      role: "LEADER",
      attendance: "DEPARTED",
      user: { id: "u-leader", name: "Lia Leader", email: "l@t.local" },
    },
    {
      tripId: "trip-1",
      userId: "u-ani",
      role: "MEMBER",
      attendance: "DEPARTED",
      user: { id: "u-ani", name: "Ani", email: "a@t.local" },
    },
    {
      tripId: "trip-1",
      userId: "u-budi",
      role: "MEMBER",
      attendance: "NOT_DEPARTED",
      user: { id: "u-budi", name: "Budi", email: "b@t.local" },
    },
  ];
  return {
    tripMembersWithUser: async () => members,
    tripMembers: async () =>
      members.map(({ user: _u, ...m }) => m),
    userById: async (id: string) => {
      const m = members.find((x) => x.userId === id);
      return m ? ({ ...m.user, gender: null } as never) : null;
    },
    latestLocations: async () => [
      {
        id: "loc-1",
        tripId: "trip-1",
        userId: "u-leader",
        lat: -6.7,
        lon: 106.9,
        batteryLevel: 80,
        ts: isoMinAgo(2),
      },
      {
        id: "loc-2",
        tripId: "trip-1",
        userId: "u-ani",
        lat: -6.7,
        lon: 106.9,
        batteryLevel: 15,
        ts: isoMinAgo(30),
      },
    ],
    tripSos: async () => [
      {
        id: "sos-1",
        tripId: "trip-1",
        senderId: "u-ani",
        reason: "CEDERA",
        level: "URGENT",
        lat: -6.7,
        lon: 106.9,
        status: "ACTIVE",
        createdAt: isoMinAgo(5),
      },
    ],
    tripCheckpoints: async () => [
      { id: "cp-1", tripId: "trip-1", name: "Pos 1", lat: -6.7, lon: 106.9 },
    ],
    checkpointCheckIns: async () => [
      { id: "ci-1", checkpointId: "cp-1", userId: "u-leader", ts: isoMinAgo(10) },
    ],
    mountainById: async () => null,
  } as unknown as Db;
}

describe("AI-L collectLeaderFacts", () => {
  test("headcount berasal dari DB: total/departed/notDeparted", async () => {
    const { collectLeaderFacts } = await import("../ai-leader.js");
    const facts = await collectLeaderFacts(fakeDb(), trip);
    expect(facts.headcount.total).toBe(3);
    expect(facts.headcount.departed).toBe(2);
    expect(facts.headcount.notDeparted).toBe(1);
    expect(facts.headcount.notDepartedUserIds).toEqual(["u-budi"]);
  });

  test("status anggota: sinyal basi, baterai rendah, SOS aktif", async () => {
    const { collectLeaderFacts } = await import("../ai-leader.js");
    const facts = await collectLeaderFacts(fakeDb(), trip);
    const ani = facts.members.find((m) => m.userId === "u-ani")!;
    expect(ani.signalStale).toBe(true); // 30 m > ambang 10 m
    expect(ani.batteryLevel).toBe(15);
    expect(ani.activeSos).toBe(true);
    const leader = facts.members.find((m) => m.userId === "u-leader")!;
    expect(leader.signalStale).toBe(false);
    expect(leader.activeSos).toBe(false);
  });

  test("pengingat tertunggak: titik kumpul + checkpoint + sinyal", async () => {
    const { collectLeaderFacts } = await import("../ai-leader.js");
    const facts = await collectLeaderFacts(fakeDb(), trip);
    const kinds = facts.overdueCheckins.map((o) => `${o.userId}:${o.kind}`);
    // Budi belum berangkat -> MEETING_POINT.
    expect(kinds).toContain("u-budi:MEETING_POINT");
    // Ani berangkat tapi belum check-in di Pos 1 yang sudah aktif
    // (leader sudah check-in) -> CHECKPOINT.
    expect(kinds).toContain("u-ani:CHECKPOINT");
    // Ani sinyal basi 30 menit -> SIGNAL_STALE.
    expect(kinds).toContain("u-ani:SIGNAL_STALE");
    // Leader tidak punya pengingat apa pun.
    expect(kinds.filter((k) => k.startsWith("u-leader:"))).toEqual([]);
  });

  test("checkpoint: hitungan check-in + siapa yang belum", async () => {
    const { collectLeaderFacts } = await import("../ai-leader.js");
    const facts = await collectLeaderFacts(fakeDb(), trip);
    expect(facts.checkpoints).toHaveLength(1);
    expect(facts.checkpoints[0].checkedInCount).toBe(1);
    expect(facts.checkpoints[0].missingUserIds).toContain("u-ani");
  });

  test("risiko memakai assessRisk: tanpa pemicu = tidak high-risk", async () => {
    const { collectLeaderFacts } = await import("../ai-leader.js");
    const facts = await collectLeaderFacts(fakeDb(), trip);
    expect(facts.risk.highRisk).toBe(false);
    expect(facts.risk.reasons).toEqual([]);
  });

  test("prompt hanya memuat data yang diberikan (angka + nama)", async () => {
    const { buildLeaderPrompt, collectLeaderFacts } = await import(
      "../ai-leader.js"
    );
    const facts = await collectLeaderFacts(fakeDb(), trip);
    const prompt = buildLeaderPrompt(facts);
    expect(prompt).toContain("3 total");
    expect(prompt).toContain("Budi");
    expect(prompt).toContain("Ani");
    expect(prompt).toContain("Pos 1");
  });

  test("system prompt melarang karangan + saran medis", async () => {
    const { LEADER_SYSTEM_PROMPT } = await import("../ai-leader.js");
    expect(LEADER_SYSTEM_PROMPT).toMatch(/HANYA dari data/);
    expect(LEADER_SYSTEM_PROMPT).toMatch(/jangan mengarang/);
    expect(LEADER_SYSTEM_PROMPT).toMatch(/saran medis/);
  });

  test("ringkasan tanpa konfigurasi AI = AI_NOT_CONFIGURED", async () => {
    const { collectLeaderFacts, summarizeLeaderBrief } = await import(
      "../ai-leader.js"
    );
    const facts = await collectLeaderFacts(fakeDb(), trip);
    const err = await summarizeLeaderBrief(facts).then(
      () => null,
      (e: { code?: string }) => e,
    );
    // Di env tes, META_MODEL_API_KEY tidak di-set.
    expect(err?.code).toBe("AI_NOT_CONFIGURED");
  });

  test("ringkasan dengan chat stub memakai model stub, tanpa angka baru", async () => {
    const { collectLeaderFacts, summarizeLeaderBrief } = await import(
      "../ai-leader.js"
    );
    const facts = await collectLeaderFacts(fakeDb(), trip);
    const out = await summarizeLeaderBrief(facts, async () => ({
      summary: "2 dari 3 berangkat; Budi belum check-in.",
      model: "stub-model",
    }));
    expect(out.model).toBe("stub-model");
    expect(out.summary).toContain("Budi");
  });
});
