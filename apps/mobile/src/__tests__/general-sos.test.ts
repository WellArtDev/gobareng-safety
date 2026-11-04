// TDD — SOS Umum (mobile): 9 alasan + level, klien API /sos-general,
// pemetaan error -> kunci i18n, klien notifikasi.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ApiError } from "../utils/auth-api";
import {
  fetchNotifications,
  markNotificationRead,
} from "../utils/notifications-api";
import { setSessionCache } from "../utils/session-token";
import {
  cancelGeneralSos,
  fetchGeneralSos,
  resolveGeneralSos,
  respondGeneralSos,
  triggerGeneralSos,
} from "../utils/sos-api";
import {
  GENERAL_SOS_REASONS,
  generalReasonLabelKey,
  generalReasonLevel,
} from "../utils/sos-logic";

const realFetch = globalThis.fetch;
let lastRequest: { url: string; init?: RequestInit } | null = null;

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    lastRequest = { url: String(url), init };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  setSessionCache("jwt-tes", "Budi");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionCache(undefined, undefined);
  lastRequest = null;
});

describe("SOS umum — logika", () => {
  test("tepat 9 alasan, tanpa anak hilang", () => {
    expect(GENERAL_SOS_REASONS).toHaveLength(9);
    expect(GENERAL_SOS_REASONS).not.toContain("ANAK_HILANG");
  });

  test("level mengikuti server (EMERGENCY/URGENT/HELP)", () => {
    expect(generalReasonLevel("KECELAKAAN_LALU_LINTAS")).toBe("EMERGENCY");
    expect(generalReasonLevel("KEJAHATAN")).toBe("URGENT");
    expect(generalReasonLevel("BAN_BOCOR_BENSIN_HABIS")).toBe("HELP");
  });

  test("label lewat kunci sos.general.reasons.*", () => {
    expect(generalReasonLabelKey("KEBAKARAN")).toBe(
      "sos.general.reasons.KEBAKARAN",
    );
  });
});

describe("triggerGeneralSos", () => {
  test("POST /sos-general payload kontrak (tanpa tripId)", async () => {
    mockFetch(201, {
      data: {
        sos: { id: "g1", status: "ACTIVE", reason: "KEBAKARAN" },
        recipients: [{ userId: "u2", distanceKm: 0.5 }],
        waRecipients: ["0822222222"],
      },
    });
    const res = await triggerGeneralSos({
      reason: "KEBAKARAN",
      lat: -7.2,
      lon: 109.91,
    });
    expect(res.sos.id).toBe("g1");
    expect(lastRequest?.url).toContain("/sos-general");
    expect(lastRequest?.init?.method).toBe("POST");
    const body = JSON.parse(String(lastRequest?.init?.body));
    expect(body.reason).toBe("KEBAKARAN");
    expect(body.tripId).toBeUndefined();
    expect(res.waRecipients).toEqual(["0822222222"]);
  });

  test("403 GENERAL_SOS_UNVERIFIED_SENDER -> kunci i18n", async () => {
    mockFetch(403, { error: { code: "GENERAL_SOS_UNVERIFIED_SENDER" } });
    const err = await triggerGeneralSos({
      reason: "KEBAKARAN",
      lat: -7.2,
      lon: 109.91,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).i18nKey).toBe("sos.general.errors.unverified");
  });

  test("409 GENERAL_SOS_ALREADY_ACTIVE -> kunci i18n", async () => {
    mockFetch(409, { error: { code: "GENERAL_SOS_ALREADY_ACTIVE" } });
    const err = await triggerGeneralSos({
      reason: "KEBAKARAN",
      lat: -7.2,
      lon: 109.91,
    }).catch((e: unknown) => e);
    expect((err as ApiError).i18nKey).toBe("sos.general.errors.alreadyActive");
  });

  test("400 INVALID_LOCATION -> kunci i18n", async () => {
    mockFetch(400, { error: { code: "INVALID_LOCATION" } });
    const err = await triggerGeneralSos({
      reason: "KEBAKARAN",
      lat: 0,
      lon: 0,
    }).catch((e: unknown) => e);
    expect((err as ApiError).i18nKey).toBe("sos.general.errors.invalidLocation");
  });
});

describe("detail & aksi SOS umum", () => {
  test("GET /sos-general/:id", async () => {
    mockFetch(200, {
      data: {
        sos: {
          id: "g1",
          senderName: "Budi",
          reason: "KEBAKARAN",
          responderCount: 2,
          viewerIsSender: false,
          distanceKm: 0.4,
        },
      },
    });
    const sos = await fetchGeneralSos("g1");
    expect(sos.responderCount).toBe(2);
    expect(lastRequest?.url).toContain("/sos-general/g1");
  });

  test("PATCH respond GOING", async () => {
    mockFetch(200, { data: { sos: { id: "g1", responderCount: 3 } } });
    const sos = await respondGeneralSos("g1", "GOING");
    expect(sos.responderCount).toBe(3);
    expect(lastRequest?.url).toContain("/sos-general/g1/respond");
    expect(JSON.parse(String(lastRequest?.init?.body)).action).toBe("GOING");
  });

  test("PATCH cancel dan resolve", async () => {
    mockFetch(200, { data: { sos: { id: "g1", status: "CANCELLED" } } });
    const cancelled = await cancelGeneralSos("g1");
    expect(cancelled.status).toBe("CANCELLED");
    expect(lastRequest?.url).toContain("/sos-general/g1/cancel");

    mockFetch(200, { data: { sos: { id: "g1", status: "RESOLVED" } } });
    const resolved = await resolveGeneralSos("g1");
    expect(resolved.status).toBe("RESOLVED");
    expect(lastRequest?.url).toContain("/sos-general/g1/resolve");
  });

  test("403 GENERAL_SOS_NOT_ALLOWED -> kunci i18n", async () => {
    mockFetch(403, { error: { code: "GENERAL_SOS_NOT_ALLOWED" } });
    const err = await fetchGeneralSos("g1").catch((e: unknown) => e);
    expect((err as ApiError).i18nKey).toBe("sos.general.errors.notAllowed");
  });
});

describe("notifikasi", () => {
  test("GET /notifications dan PATCH read", async () => {
    mockFetch(200, {
      data: {
        notifications: [
          {
            id: "n1",
            kind: "GENERAL_SOS_ALERT",
            refId: "g1",
            actorName: "Budi",
            readAt: null,
          },
        ],
      },
    });
    const items = await fetchNotifications();
    expect(items).toHaveLength(1);
    expect(items[0].refId).toBe("g1");
    expect(lastRequest?.url).toContain("/notifications");

    mockFetch(200, { data: { ok: true } });
    await markNotificationRead("n1");
    expect(lastRequest?.url).toContain("/notifications/n1/read");
    expect(lastRequest?.init?.method).toBe("PATCH");
  });
});

describe("SOS umum — pengaman (Wella 2 Nov 2026)", () => {
  test("konfirmasi ganda: ketukan pertama mempersenjatai, kedua mengeksekusi", async () => {
    const { createDoubleConfirm } = await import("../utils/double-confirm");
    const dc = createDoubleConfirm(10_000);
    expect(dc.tap(1000)).toBe(false); // pertama: hanya dipersenjatai
    expect(dc.isArmed(1500)).toBe(true);
    expect(dc.tap(2000)).toBe(true); // kedua dalam jendela: eksekusi
    expect(dc.isArmed(2500)).toBe(false);
    // Setelah eksekusi, ketukan berikutnya mulai dari awal lagi.
    expect(dc.tap(3000)).toBe(false);
  });

  test("konfirmasi ganda: jendela kedaluwarsa membatalkan persenjataan", async () => {
    const { createDoubleConfirm } = await import("../utils/double-confirm");
    const dc = createDoubleConfirm(10_000);
    expect(dc.tap(1000)).toBe(false);
    expect(dc.isArmed(11_001)).toBe(false); // 10.001 ms kemudian: kedaluwarsa
    expect(dc.tap(11_002)).toBe(false); // mulai dari awal lagi
    expect(dc.tap(11_003)).toBe(true); // ketukan kedua yang sah
  });

  test("klien lapor SOS palsu POST ke /sos-general/:id/report", async () => {
    const { reportGeneralSos } = await import("../utils/sos-api");
    mockFetch(201, { data: { report: { id: "r1" } } });
    await reportGeneralSos("g9");
    expect(lastRequest?.url).toContain("/sos-general/g9/report");
    expect(lastRequest?.init?.method).toBe("POST");
  });

  test("error batas kirim + cooldown + lapor dipetakan ke kunci i18n", async () => {
    const { triggerGeneralSos, reportGeneralSos } = await import(
      "../utils/sos-api"
    );
    mockFetch(429, { error: { code: "GENERAL_SOS_DAILY_LIMIT" } });
    try {
      await triggerGeneralSos("KEBAKARAN", 1, 2);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).i18nKey).toBe(
        "sos.general.errors.dailyLimit",
      );
    }
    mockFetch(429, { error: { code: "GENERAL_SOS_COOLDOWN" } });
    try {
      await triggerGeneralSos("KEBAKARAN", 1, 2);
      expect.unreachable();
    } catch (error) {
      expect((error as ApiError).i18nKey).toBe("sos.general.errors.cooldown");
    }
    mockFetch(409, { error: { code: "GENERAL_SOS_ALREADY_REPORTED" } });
    try {
      await reportGeneralSos("g9");
      expect.unreachable();
    } catch (error) {
      expect((error as ApiError).i18nKey).toBe(
        "sos.general.errors.alreadyReported",
      );
    }
  });
});
