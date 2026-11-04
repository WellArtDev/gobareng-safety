// Aturan tampil/sembunyi detail trip untuk trip selesai (CLOSED) —
// perintah Wella 3 Nov 2026 18:35 + 18:37: form tambah checkpoint,
// tombol Invite Members, tombol Trip Q&A, dan tombol Start Trip
// disembunyikan total untuk CLOSED; tombol Ringkasan + Laporan hanya
// tampil untuk CLOSED. Trip PLANNED/ACTIVE tidak berubah.
import { describe, expect, test } from "bun:test";

import {
  canGenerateTripReport,
  resolveTripReportAction,
  showCheckpointForm,
  showFinishedActions,
  showInviteButton,
  showStartTripBlock,
  showTripQaButton,
} from "../utils/trip-finished-actions";

describe("trip selesai (CLOSED) disembunyikan", () => {
  test("form checkpoint tersembunyi saat CLOSED walau leader + TOURING", () => {
    expect(
      showCheckpointForm({ status: "CLOSED", isLeader: true, type: "TOURING" }),
    ).toBe(false);
  });

  test("tombol Invite tersembunyi saat CLOSED walau leader", () => {
    expect(showInviteButton({ status: "CLOSED", isLeader: true })).toBe(false);
  });

  test("tombol Trip Q&A tersembunyi saat CLOSED", () => {
    expect(showTripQaButton("CLOSED")).toBe(false);
  });

  test("blok Start Trip tersembunyi saat CLOSED", () => {
    expect(showStartTripBlock("CLOSED")).toBe(false);
  });

  test("tombol Ringkasan + Laporan tampil hanya saat CLOSED", () => {
    expect(showFinishedActions("CLOSED")).toBe(true);
    expect(showFinishedActions("PLANNED")).toBe(false);
    expect(showFinishedActions("ACTIVE")).toBe(false);
  });
});

describe("trip belum selesai tidak berubah", () => {
  test("form checkpoint tetap tampil untuk leader TOURING", () => {
    expect(
      showCheckpointForm({ status: "PLANNED", isLeader: true, type: "TOURING" }),
    ).toBe(true);
    expect(
      showCheckpointForm({ status: "ACTIVE", isLeader: true, type: "TOURING" }),
    ).toBe(true);
  });

  test("form checkpoint tetap tersembunyi untuk non-leader dan HIKING", () => {
    expect(
      showCheckpointForm({ status: "PLANNED", isLeader: false, type: "TOURING" }),
    ).toBe(false);
    expect(
      showCheckpointForm({ status: "PLANNED", isLeader: true, type: "HIKING" }),
    ).toBe(false);
  });

  test("Invite tetap tampil untuk leader trip belum selesai", () => {
    expect(showInviteButton({ status: "PLANNED", isLeader: true })).toBe(true);
    expect(showInviteButton({ status: "ACTIVE", isLeader: true })).toBe(true);
    expect(showInviteButton({ status: "PLANNED", isLeader: false })).toBe(false);
  });

  test("Trip Q&A dan Start Trip tetap tampil saat belum selesai", () => {
    expect(showTripQaButton("PLANNED")).toBe(true);
    expect(showTripQaButton("ACTIVE")).toBe(true);
    expect(showStartTripBlock("PLANNED")).toBe(true);
    expect(showStartTripBlock("ACTIVE")).toBe(true);
  });
});

describe("alur laporan trip selesai", () => {
  test("generate laporan hanya leader atau admin", () => {
    expect(canGenerateTripReport({ isLeader: true, isAdmin: false })).toBe(true);
    expect(canGenerateTripReport({ isLeader: false, isAdmin: true })).toBe(true);
    expect(canGenerateTripReport({ isLeader: false, isAdmin: false })).toBe(false);
  });

  test("tanpa laporan + bisa generate -> generate", () => {
    expect(
      resolveTripReportAction({ hasReport: false, canGenerate: true }),
    ).toBe("generate");
  });

  test("laporan ada + bisa generate -> regenerate (menimpa baris sama)", () => {
    expect(
      resolveTripReportAction({ hasReport: true, canGenerate: true }),
    ).toBe("regenerate");
  });

  test("laporan ada + tidak bisa generate -> refresh baca ulang", () => {
    expect(
      resolveTripReportAction({ hasReport: true, canGenerate: false }),
    ).toBe("refresh");
  });

  test("tanpa laporan + tidak bisa generate -> blocked (pesan jujur)", () => {
    expect(
      resolveTripReportAction({ hasReport: false, canGenerate: false }),
    ).toBe("blocked");
  });
});
