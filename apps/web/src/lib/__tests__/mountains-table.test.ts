// Guard tabel Gunung: daftar jadi <table> seperti contoh (bukan list
// alert-item), kolom Gambar/Nama/Lokasi/Provinsi/Ketinggian/Kesulitan/
// Tipe/Jumlah Jalur/Status/Action, ada search, form edit, dan aksi
// admin-only (Edit, Nonaktifkan/Aktifkan, Hapus) lewat klien api.
// Kunci i18n baru wajib ada di kedua bahasa (parity dijaga
// i18n-menus.test.ts).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { en } from "../i18n/en";
import { id } from "../i18n/id";

function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

type Dashboard = { dashboard: Record<string, unknown> };
const idD = (id as unknown as Dashboard).dashboard;
const enD = (en as unknown as Dashboard).dashboard;

const KEYS = [
  "mountainsTableImage",
  "mountainsTableName",
  "mountainsTableLocation",
  "mountainsTableProvince",
  "mountainsTableElevation",
  "mountainsTableDifficulty",
  "mountainsTableType",
  "mountainsTableTypeActive",
  "mountainsTableTypeInactive",
  "mountainsTableRoutes",
  "mountainsTableStatus",
  "mountainsTableStatusActive",
  "mountainsTableStatusInactive",
  "mountainsTableAction",
  "mountainsTableEdit",
  "mountainsTableDeactivate",
  "mountainsTableActivate",
  "mountainsTableDelete",
  "mountainsTableSearch",
  "mountainsEditTitle",
  "mountainsEditSave",
  "mountainsEditCancel",
  "mountainsDeleteConfirm",
  "mountainsImageUpload",
  "mountainsImageUploadHint",
  "mountainsImageUploading",
  "mountainsModalClose",
] as const;

describe("tabel Gunung", () => {
  test("kunci i18n tabel ada di id + en", () => {
    for (const k of KEYS) {
      expect(idD[k]).toBeDefined();
      expect(enD[k]).toBeDefined();
      expect(typeof idD[k]).toBe("string");
      expect(typeof enD[k]).toBe("string");
    }
  });

  test("halaman memakai <table> + search + form edit untuk gunung", () => {
    const page = read("../../routes/+page.svelte");
    expect(page).toContain("<table");
    expect(page).toContain("mountainsSearch");
    expect(page).toContain("editingMountain");
    expect(page).toContain("mountainsTableEdit");
    expect(page).toContain("mountainsTableDeactivate");
    expect(page).toContain("mountainsTableDelete");
    expect(page).toContain("mountainsTableRoutes");
  });

  test("klien api punya update + hapus + upload gambar gunung", () => {
    const apiSrc = read("../api.ts");
    expect(apiSrc).toContain("updateMountain");
    expect(apiSrc).toContain("deleteMountain");
    expect(apiSrc).toContain("method: 'PATCH'");
    expect(apiSrc).toContain("method: 'DELETE'");
    expect(apiSrc).toContain("uploadMountainImage");
    expect(apiSrc).toContain("/image");
    expect(apiSrc).toContain("FormData");
  });

  test("aksi tabel = tombol pil kecil (bukan teks link), edit = popup modal", () => {
    const page = read("../../routes/+page.svelte");
    expect(page).toContain("mountains-actions");
    expect(page).toContain("mountains-action-btn edit");
    expect(page).toContain("toggle-off");
    expect(page).toContain("toggle-on");
    expect(page).toContain("mountains-action-btn delete");
    expect(page).toContain("mountains-modal-backdrop");
    expect(page).toContain('role="dialog"');
    expect(page).toContain("closeMountainEdit");
  });

  test("form edit punya input file gambar + pratinjau", () => {
    const page = read("../../routes/+page.svelte");
    expect(page).toContain('type="file"');
    expect(page).toContain('accept="image/*"');
    expect(page).toContain("onMountainImageFile");
    expect(page).toContain("editMountainFilePreview");
    expect(page).toContain("mountainsImageUpload");
  });

  test("tipe Mountain memuat field tabel baru", () => {
    const types = read("../types.ts");
    expect(types).toContain("province: string");
    expect(types).toContain("routeCount: number");
    expect(types).toContain("isActive: boolean");
    expect(types).toContain("volcanoActive: boolean");
  });
});
