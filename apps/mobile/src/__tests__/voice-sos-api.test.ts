// TDD RED — klien SOS suara (AI-V): transkripsi + konfirmasi lewat
// POST /voice-sos/transcribe dan /voice-sos/confirm; kode error server
// dipetakan ke kunci i18n sos.voice.* (bukan teks hardcode).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ApiError } from "../utils/auth-api";
import { setSessionCache } from "../utils/session-token";
import {
  confirmVoiceSos,
  transcribeVoiceSos,
} from "../utils/voice-sos-api";

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

describe("transcribeVoiceSos", () => {
  test("POST /voice-sos/transcribe + hasil server diteruskan apa adanya", async () => {
    mockFetch(200, {
      data: {
        transcript: "tolong saya tersesat di jalur pendakian",
        detectedReason: "TERSESAT",
        kind: "trip",
        model: null,
      },
    });
    const out = await transcribeVoiceSos({
      audioBase64: "aGVsbG8=",
      mimeType: "audio/m4a",
      kind: "trip",
      tripType: "HIKING",
    });
    expect(out.transcript).toBe("tolong saya tersesat di jalur pendakian");
    expect(out.detectedReason).toBe("TERSESAT");
    expect(out.model).toBeNull();
    expect(lastRequest?.url).toContain("/voice-sos/transcribe");
    expect(lastRequest?.init?.method).toBe("POST");
    const body = JSON.parse(String(lastRequest?.init?.body));
    expect(body.audioBase64).toBe("aGVsbG8=");
    expect(body.kind).toBe("trip");
  });

  test("503 STT_NOT_CONFIGURED -> kunci i18n sos.voice.errors.sttNotConfigured", async () => {
    mockFetch(503, { error: { code: "STT_NOT_CONFIGURED" } });
    const err = await transcribeVoiceSos({
      audioBase64: "aGVsbG8=",
      kind: "general",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).i18nKey).toBe("sos.voice.errors.sttNotConfigured");
  });
});

describe("confirmVoiceSos", () => {
  test("POST /voice-sos/confirm trip -> kind + sos diteruskan", async () => {
    mockFetch(201, {
      data: {
        kind: "trip",
        sos: { id: "s1", status: "ACTIVE", reason: "TERSESAT", tripId: "t1" },
        waRecipients: [],
      },
    });
    const out = await confirmVoiceSos({
      reason: "TERSESAT",
      lat: -7.2,
      lon: 109.91,
      tripId: "t1",
    });
    expect(out.kind).toBe("trip");
    expect(out.sos.id).toBe("s1");
    expect(lastRequest?.url).toContain("/voice-sos/confirm");
    const body = JSON.parse(String(lastRequest?.init?.body));
    expect(body.tripId).toBe("t1");
  });

  test("POST /voice-sos/confirm general tanpa tripId", async () => {
    mockFetch(201, {
      data: {
        kind: "general",
        sos: { id: "g1", status: "ACTIVE", reason: "KEBAKARAN", tripId: null },
        recipients: [],
        waRecipients: [],
      },
    });
    const out = await confirmVoiceSos({
      reason: "KEBAKARAN",
      lat: -7.2,
      lon: 109.91,
    });
    expect(out.kind).toBe("general");
    const body = JSON.parse(String(lastRequest?.init?.body));
    expect(body.tripId).toBeUndefined();
  });

  test("409 SOS_ALREADY_ACTIVE -> kunci i18n sos.errors.alreadyActive", async () => {
    mockFetch(409, { error: { code: "SOS_ALREADY_ACTIVE" } });
    const err = await confirmVoiceSos({
      reason: "TERSESAT",
      lat: -7.2,
      lon: 109.91,
      tripId: "t1",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).i18nKey).toBe("sos.errors.alreadyActive");
  });

  test("403 GENERAL_SOS_UNVERIFIED_SENDER -> kunci general unverified", async () => {
    mockFetch(403, { error: { code: "GENERAL_SOS_UNVERIFIED_SENDER" } });
    const err = await confirmVoiceSos({
      reason: "KEBAKARAN",
      lat: -7.2,
      lon: 109.91,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).i18nKey).toBe("sos.general.errors.unverified");
  });
});
