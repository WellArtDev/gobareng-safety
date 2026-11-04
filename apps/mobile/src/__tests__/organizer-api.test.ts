// TDD — klien pengajuan organizer: validasi sisi klien + GET
// pengajuan sendiri (JSON). Submit multipart diuji di API suite;
// di sini cukup kontrak respons GET + validasi murni.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  fetchMyOrganizerApplication,
  validateOrganizerApplication,
} from "../utils/organizer-api";
import { setSessionCache } from "../utils/session-token";

const realFetch = globalThis.fetch;

beforeEach(() => {
  setSessionCache("jwt-tes", "Budi");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionCache(undefined, undefined);
});

describe("validateOrganizerApplication", () => {
  test("nama < 2 karakter ditolak", () => {
    expect(
      validateOrganizerApplication({
        organizerName: "A",
        address: "Jl. Merdeka 1",
        organizerType: null,
        region: null,
      }),
    ).toBe("profile.orgErrors.nameRequired");
  });

  test("alamat < 2 karakter ditolak", () => {
    expect(
      validateOrganizerApplication({
        organizerName: "Komunitas A",
        address: " ",
        organizerType: "HIKING",
        region: "Wonosobo",
      }),
    ).toBe("profile.orgErrors.addressRequired");
  });

  test("nama + alamat valid lolos (KTP boleh menyusul)", () => {
    expect(
      validateOrganizerApplication({
        organizerName: "Komunitas A",
        address: "Jl. Merdeka 1",
        organizerType: "TOURING",
        region: null,
      }),
    ).toBeNull();
  });
});

describe("fetchMyOrganizerApplication", () => {
  test("GET mengembalikan pengajuan + tanpa nama file privat", async () => {
    const application = {
      id: "v1",
      organizerName: "Komunitas A",
      address: "Jl. Merdeka 1",
      organizerType: "HIKING",
      region: "Wonosobo",
      hasIdentityDocument: true,
      identityDocumentComplete: true,
      profileComplete: true,
      status: "PENDING",
      submittedAt: "2026-11-01T00:00:00.000Z",
    };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: { application } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    const got = await fetchMyOrganizerApplication();
    expect(got).toEqual(application);
    expect(got).not.toHaveProperty("identityDocumentFilename");
  });
});
