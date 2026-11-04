// TDD RED — klien pembayaran: status upgrade Pro, ajukan upgrade,
// tagihan trip sendiri.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  fetchMyTripPayment,
  fetchUpgradeStatus,
  requestUpgrade,
  resolveProQrisUrl,
} from "../utils/pay-api";
import { setSessionCache } from "../utils/session-token";

const realFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

beforeEach(() => {
  setSessionCache("jwt-tes", "Budi");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionCache(undefined, undefined);
});

describe("upgrade Pro client", () => {
  test("status: isPro + price + request terakhir", async () => {
    mockFetch(200, {
      data: {
        isPro: false,
        price: 150000,
        request: { id: "u1", status: "PENDING", amount: 150000 },
      },
    });
    const status = await fetchUpgradeStatus();
    expect(status.isPro).toBe(false);
    expect(status.price).toBe(150000);
    expect(status.request?.status).toBe("PENDING");
  });

  test("status: proQrisUrl dari dashboard ikut terbaca bila ada", async () => {
    mockFetch(200, {
      data: {
        isPro: false,
        price: 150000,
        request: null,
        proQrisUrl: "https://jalur.gobareng.app/uploads/qris/q.png",
      },
    });
    const status = await fetchUpgradeStatus();
    expect(status.proQrisUrl).toBe(
      "https://jalur.gobareng.app/uploads/qris/q.png",
    );
  });

  test("resolveProQrisUrl: absolut diteruskan, relatif diprefix host API, kosong -> null", () => {
    expect(resolveProQrisUrl("https://jalur.gobareng.app/uploads/qris/q.png")).toBe(
      "https://jalur.gobareng.app/uploads/qris/q.png",
    );
    const rel = resolveProQrisUrl("/uploads/qris/q.png");
    expect(rel?.endsWith("/uploads/qris/q.png")).toBe(true);
    expect(rel?.startsWith("http")).toBe(true);
    expect(resolveProQrisUrl(null)).toBe(null);
    expect(resolveProQrisUrl("")).toBe(null);
  });

  test("ajukan -> request PENDING; UPGRADE_ALREADY_PENDING -> kunci i18n", async () => {
    mockFetch(201, {
      data: { request: { id: "u2", status: "PENDING", amount: 150000 } },
    });
    const request = await requestUpgrade();
    expect(request.status).toBe("PENDING");
    mockFetch(409, { error: { code: "UPGRADE_ALREADY_PENDING" } });
    const err = await requestUpgrade().catch((e: unknown) => e);
    expect((err as { i18nKey: string }).i18nKey).toBe(
      "upgrade.errors.alreadyPending",
    );
  });
});

describe("trip payment client", () => {
  test("tagihan sendiri; PAYMENT_NOT_FOUND -> null (gratis/leader)", async () => {
    mockFetch(200, {
      data: {
        payment: { id: "p1", status: "WAITING", amount: 150000 },
        organizerBank: null,
      },
    });
    const result = await fetchMyTripPayment("t1");
    expect(result?.payment.status).toBe("WAITING");
    expect(result?.organizerBank).toBeNull();
    mockFetch(404, { error: { code: "PAYMENT_NOT_FOUND" } });
    expect(await fetchMyTripPayment("t1")).toBeNull();
  });
});
