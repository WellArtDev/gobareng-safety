// TDD RED — klien kontak darurat A-4: list/create/delete.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  createEmergencyContact,
  deleteEmergencyContact,
  fetchEmergencyContacts,
} from "../utils/emergency-contacts-api";
import { setSessionCache } from "../utils/session-token";

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

const contact = { id: "c1", userId: "u1", name: "Kakak", phone: "081234567890" };

describe("emergency contacts client", () => {
  test("GET /auth/me/emergency-contacts", async () => {
    mockFetch(200, { data: { contacts: [contact] } });
    const contacts = await fetchEmergencyContacts();
    expect(contacts).toHaveLength(1);
    expect(lastRequest?.url).toContain("/auth/me/emergency-contacts");
  });

  test("POST dengan nama + nomor", async () => {
    mockFetch(201, { data: { contact } });
    const created = await createEmergencyContact("Kakak", "0812-3456-7890");
    expect(created.name).toBe("Kakak");
    const body = JSON.parse(String(lastRequest?.init?.body));
    // Nomor dinormalisasi klien sebelum kirim.
    expect(body.phone).toBe("081234567890");
  });

  test("DELETE /auth/me/emergency-contacts/:id", async () => {
    mockFetch(200, { data: { deleted: true } });
    await deleteEmergencyContact("c1");
    expect(lastRequest?.init?.method).toBe("DELETE");
    expect(lastRequest?.url).toContain("/auth/me/emergency-contacts/c1");
  });
});
