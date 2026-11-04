// M6 live-tracking alerts — pure geometry + evaluation logic (unit tests,
// no server). Run with JWT_SECRET set (member-alerts.js imports config).
import { describe, expect, test } from "bun:test";
import {
  OFF_ROUTE_DISTANCE_M,
  SAME_PLACE_RADIUS_M,
  distanceToPolylineMeters,
  haversineMeters,
  isNoMovement,
  isOffRoute,
} from "../member-alerts.js";

const A = { lat: -7.2, lon: 109.9 };
const B = { lat: -7.2, lon: 110.0 };
const ROUTE = [A, B];
const MIN = 60_000;

function loc(lat: number, lon: number, tsMs: number) {
  return {
    id: "x",
    tripId: "t",
    userId: "u",
    lat,
    lon,
    ts: new Date(tsMs).toISOString(),
  };
}

describe("haversineMeters", () => {
  test("same point = 0", () => {
    expect(haversineMeters(-7.2, 109.9, -7.2, 109.9)).toBe(0);
  });
  test("0.001 deg latitude ~= 111 m", () => {
    const d = haversineMeters(-7.2, 109.9, -7.199, 109.9);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
  test("25 m radius guard: 0.0002 deg lat is inside 25 m, 0.0003 is outside", () => {
    expect(haversineMeters(-7.2, 109.9, -7.1998, 109.9)).toBeLessThanOrEqual(
      SAME_PLACE_RADIUS_M,
    );
    expect(haversineMeters(-7.2, 109.9, -7.1997, 109.9)).toBeGreaterThan(
      SAME_PLACE_RADIUS_M,
    );
  });
});

describe("distanceToPolylineMeters", () => {
  test("no checkpoints = inapplicable (null)", () => {
    expect(distanceToPolylineMeters(A, [])).toBeNull();
  });
  test("single checkpoint = point distance", () => {
    expect(distanceToPolylineMeters(A, [A])).toBe(0);
    expect(distanceToPolylineMeters({ lat: -7.19, lon: 109.9 }, [A])).toBeGreaterThan(
      OFF_ROUTE_DISTANCE_M,
    );
  });
  test("point on segment = 0", () => {
    expect(distanceToPolylineMeters({ lat: -7.2, lon: 109.95 }, ROUTE)).toBeLessThan(1);
  });
  test("point beyond endpoint = distance to nearest endpoint", () => {
    const d = distanceToPolylineMeters({ lat: -7.2, lon: 110.01 }, ROUTE);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1120);
  });
  test("point 55 m off segment is within 100 m; 1111 m off is outside", () => {
    expect(distanceToPolylineMeters({ lat: -7.2005, lon: 109.95 }, ROUTE)).toBeLessThan(
      OFF_ROUTE_DISTANCE_M,
    );
    expect(distanceToPolylineMeters({ lat: -7.19, lon: 109.95 }, ROUTE)).toBeGreaterThan(
      OFF_ROUTE_DISTANCE_M,
    );
  });
});

describe("isNoMovement", () => {
  test("positions within 25 m spanning >= 10 min -> true", () => {
    const now = 1_000_000_000_000;
    expect(
      isNoMovement(
        [
          loc(-7.2, 109.9, now - 10 * MIN),
          loc(-7.20005, 109.9, now - 5 * MIN),
          loc(-7.20008, 109.9, now),
        ],
        now,
      ),
    ).toBe(true);
  });
  test("span under 10 min -> false (member who just joined does not alert)", () => {
    const now = 1_000_000_000_000;
    expect(
      isNoMovement([loc(-7.2, 109.9, now - 9 * MIN), loc(-7.2, 109.9, now)], now),
    ).toBe(false);
  });
  test("one position > 25 m away breaks the window -> false", () => {
    const now = 1_000_000_000_000;
    expect(
      isNoMovement(
        [
          loc(-7.2, 109.9, now - 10 * MIN),
          loc(-7.2, 109.9, now - 5 * MIN),
          loc(-7.1995, 109.9, now),
        ],
        now,
      ),
    ).toBe(false);
  });
  test("stale latest position -> false (silent member is signal loss, not no-movement)", () => {
    const now = 1_000_000_000_000;
    expect(
      isNoMovement(
        [
          loc(-7.2, 109.9, now - 21 * MIN),
          loc(-7.2, 109.9, now - 11 * MIN),
        ],
        now,
      ),
    ).toBe(false);
  });
  test("single position -> false", () => {
    expect(isNoMovement([loc(-7.2, 109.9, 1_000_000_000_000)], 1_000_000_000_000)).toBe(
      false,
    );
  });
});

describe("isOffRoute", () => {
  const far1 = loc(-7.19, 109.95, 1000);
  const far2 = loc(-7.19, 109.96, 2000);
  const near = loc(-7.2005, 109.95, 3000);
  test("two consecutive far positions -> true", () => {
    expect(isOffRoute([far1, far2], ROUTE)).toBe(true);
  });
  test("one far + one near -> false (clears)", () => {
    expect(isOffRoute([far1, near], ROUTE)).toBe(false);
  });
  test("single position -> false", () => {
    expect(isOffRoute([far1], ROUTE)).toBe(false);
  });
  test("no checkpoints -> false (inapplicable)", () => {
    expect(isOffRoute([far1, far2], [])).toBe(false);
  });
});
