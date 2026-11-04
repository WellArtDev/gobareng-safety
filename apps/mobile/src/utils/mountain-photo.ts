// Helper foto + info detail gunung (murni, teruji).
// Aturan: foto HANYA dari imageUrl yang dikirim API. null / string
// kosong / spasi saja = belum ada foto -> pemanggil merender kotak
// huruf fallback. Tidak ada URL hardcode, tidak ada foto buatan.
// Deskripsi kosong juga tidak dirender — jangan mengarang deskripsi.
export function hasMountainPhoto(
  imageUrl: string | null | undefined,
): boolean {
  return typeof imageUrl === "string" && imageUrl.trim().length > 0;
}

export function mountainPhotoUri(
  imageUrl: string | null | undefined,
): string | null {
  return hasMountainPhoto(imageUrl) ? (imageUrl as string).trim() : null;
}

export function hasMountainDescription(
  description: string | null | undefined,
): boolean {
  return typeof description === "string" && description.trim().length > 0;
}

export function hasMountainProvince(
  province: string | null | undefined,
): boolean {
  return typeof province === "string" && province.trim().length > 0;
}

// Jumlah jalur: pakai routeCount server (relasi routes di DB) bila
// ada; kalau tidak, hitung dari array routes yang ikut dikirim.
export function mountainRouteCount(
  routeCount: number | null | undefined,
  routes: readonly unknown[],
): number {
  return typeof routeCount === "number" ? routeCount : routes.length;
}
