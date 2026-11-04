// TDD RED — body POST create trip: hiking wajib membawa mountainId /
// routeId (agar API PR #193 bisa menautkan rute + menyalin pos jalur);
// touring TIDAK BOLEH membawa field rute (API menolaknya 400).
import { describe, expect, test } from "bun:test";

import { buildCreateTripBody } from "../utils/create-trip-logic";

describe("buildCreateTripBody", () => {
  const base = {
    name: "Pendakian Gede",
    date: "2026-11-08",
    time: "05:30",
    meetingPoint: "Basecamp Cibodas",
    quota: 10,
  };

  test("hiking membawa mountainId + routeId", () => {
    const body = buildCreateTripBody({
      ...base,
      tripType: "HIKING",
      mountainId: "m-gede",
      routeId: "r-selabintana",
    });
    expect(body.type).toBe("HIKING");
    expect(body.mountainId).toBe("m-gede");
    expect(body.routeId).toBe("r-selabintana");
  });

  test("touring tidak membawa field rute meski param ada", () => {
    const body = buildCreateTripBody({
      ...base,
      tripType: "TOURING",
      destination: "Puncak, Bogor",
      mountainId: "m-gede",
      routeId: "r-selabintana",
    });
    expect(body.type).toBe("TOURING");
    expect("mountainId" in body).toBe(false);
    expect("routeId" in body).toBe(false);
  });

  test("hiking tanpa pilihan rute jalan seperti sebelumnya (tanpa field)", () => {
    const body = buildCreateTripBody({ ...base, tripType: "HIKING" });
    expect("mountainId" in body).toBe(false);
    expect("routeId" in body).toBe(false);
    expect(body.name).toBe("Pendakian Gede");
    expect(body.isOpenTrip).toBe(false);
  });

  test("hiking hanya mountainId membawa mountainId saja", () => {
    const body = buildCreateTripBody({
      ...base,
      tripType: "HIKING",
      mountainId: "m-gede",
    });
    expect(body.mountainId).toBe("m-gede");
    expect("routeId" in body).toBe(false);
  });

  test("aturan lama tetap: meetingLat/Lon hanya sepasang valid, destinasi hanya touring", () => {
    const hiking = buildCreateTripBody({
      ...base,
      tripType: "HIKING",
      meetLat: "-6.7",
      meetLon: "106.9",
      destination: "Puncak, Bogor",
    });
    expect(hiking.meetingLat).toBe(-6.7);
    expect(hiking.meetingLon).toBe(106.9);
    expect("destination" in hiking).toBe(false);

    const brokenPair = buildCreateTripBody({
      ...base,
      tripType: "HIKING",
      meetLat: "-6.7",
      meetLon: "bukan-angka",
    });
    expect("meetingLat" in brokenPair).toBe(false);
    expect("meetingLon" in brokenPair).toBe(false);
  });
});
