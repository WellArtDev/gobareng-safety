// TDD RED — logika SOS (M2): 8 alasan kontekstual per tipe trip
// (keputusan terkunci; HIKING 4, TOURING 7), auto-level, kunci i18n.
import { describe, expect, test } from "bun:test";

import {
  reasonLabelKey,
  reasonLevel,
  reasonsForTripType,
} from "../utils/sos-logic";

describe("reasonsForTripType", () => {
  test("HIKING: 4 alasan tanpa alasan kendaraan", () => {
    expect(reasonsForTripType("HIKING")).toEqual([
      "TERSESAT",
      "CEDERA",
      "MEDIS",
      "LAINNYA",
    ]);
  });

  test("TOURING: 7 alasan termasuk kendaraan", () => {
    expect(reasonsForTripType("TOURING")).toEqual([
      "MOTOR_RUSAK",
      "BENSIN_HABIS",
      "BAN_BOCOR",
      "KECELAKAAN",
      "CEDERA",
      "MEDIS",
      "LAINNYA",
    ]);
  });
});

describe("reasonLevel", () => {
  test("auto-level sesuai server: EMERGENCY/URGENT/HELP", () => {
    expect(reasonLevel("CEDERA")).toBe("EMERGENCY");
    expect(reasonLevel("KECELAKAAN")).toBe("EMERGENCY");
    expect(reasonLevel("MEDIS")).toBe("EMERGENCY");
    expect(reasonLevel("TERSESAT")).toBe("URGENT");
    expect(reasonLevel("MOTOR_RUSAK")).toBe("URGENT");
    expect(reasonLevel("BENSIN_HABIS")).toBe("HELP");
    expect(reasonLevel("BAN_BOCOR")).toBe("HELP");
    expect(reasonLevel("LAINNYA")).toBe("HELP");
  });
});

describe("reasonLabelKey", () => {
  test("tiap alasan punya kunci i18n", () => {
    expect(reasonLabelKey("TERSESAT")).toBe("sos.reasons.TERSESAT");
    expect(reasonLabelKey("MOTOR_RUSAK")).toBe("sos.reasons.MOTOR_RUSAK");
  });
});
