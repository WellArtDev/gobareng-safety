// Bentuk katalog gunung + jalur untuk wizard buat trip. Hanya TIPE:
// datanya selalu dari API §10 lewat adaptor mountains-catalog.
// Katalog statis 4 gunung + mountainById dihapus 3 Nov 2026
// (perintah "jangan ada yang palsu").
export interface MountainRoute {
  id: string;
  name: string;
  meetingPoint: string;
  distance: string;
  gain: string;
  duration: string;
  recommended: boolean;
}

export interface Mountain {
  id: string;
  name: string;
  elevation: string;
  location: string;
  difficultyKey: string;
  // Foto katalog dari API; null = fallback kotak warna di kartu.
  imageUrl: string | null;
  routes: MountainRoute[];
}
