// Isi dokumen legal — disalin dari LEGAL_DOCS mockup (teks produk
// final dari desain, bukan placeholder). Struktur: judul + seksi
// {heading, paragraphs[], bullets[]} supaya render native rapi.
export interface LegalSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDoc {
  titleKey: string;
  sections: LegalSection[];
}

export const LEGAL_DOCS: Record<"privacy" | "terms" | "disclaimer", LegalDoc> =
  {
    privacy: {
      titleKey: "legal.privacyTitle",
      sections: [
        {
          paragraphs: [
            'Kebijakan Privasi ini menjelaskan bagaimana GoBareng mengumpulkan, menggunakan, menyimpan, dan melindungi data pribadi kamu saat menggunakan aplikasi GoBareng ("Aplikasi"). Dengan menggunakan Aplikasi, kamu menyetujui praktik yang dijelaskan di dokumen ini.',
          ],
        },
        {
          heading: "1. Data yang Kami Kumpulkan",
          bullets: [
            "Data akun — nama, alamat email, dan nomor WhatsApp yang kamu daftarkan.",
            "Data lokasi — lokasi GPS HP kamu selama trip berjalan. Lokasi hanya dibagikan ke anggota trip yang sama saat trip aktif, dan tidak pernah dibagikan ke publik atau pihak ketiga untuk iklan.",
            "Data beacon — posisi dari perangkat beacon satelit yang terhubung ke trip. Sumber posisi selalu diberi label jelas: GPS HP atau beacon satelit.",
            "Data darurat — alamat, kontak darurat, dan data lain yang kamu isi sukarela di Profil > Data Darurat. Data ini tidak pernah tampil di profil publik.",
            "Data komunitas — konten yang kamu kirim ke diskusi komunitas dan riwayat trip yang sudah selesai.",
          ],
        },
        {
          heading: "2. Profil Publik",
          paragraphs: [
            "Profil publikmu hanya menampilkan nama, status verifikasi/Pro, rating, statistik agregat (total trip, km touring, jumlah puncak), lencana yang terbuka, dan riwayat trip yang sudah selesai. Alamat email, nomor HP/WA, lokasi real-time, dan trip yang sedang berjalan tidak pernah tampil di profil publik.",
          ],
        },
        {
          heading: "3. Bagaimana Data Digunakan",
          bullets: [
            "Menjalankan fitur inti: koordinasi trip, tracking posisi tim, dan fitur keselamatan (SOS).",
            "Mengirim notifikasi terkait trip (pengingat, peringatan, status SOS).",
            "Memverifikasi identitas akun (OTP via WhatsApp) dan status GoBareng Pro.",
            "Meningkatkan keamanan dan mencegah penyalahgunaan (fraud, mock location).",
          ],
        },
        {
          heading: "4. Penyimpanan & Keamanan",
          paragraphs: [
            "Data disimpan di server yang aman dengan enkripsi saat transit. Kata sandi tidak pernah disimpan dalam bentuk teks biasa. Kami menerapkan kontrol akses berbasis peran — hanya staf berwenang yang dapat mengakses data operasional.",
          ],
        },
        {
          heading: "5. Berbagi Data ke Pihak Ketiga",
          paragraphs: [
            "Kami tidak menjual data pribadi kamu. Data hanya dibagikan ke penyedia layanan yang diperlukan untuk menjalankan Aplikasi (mis. penyedia OTP WhatsApp dan layanan peta), sebatas yang dibutuhkan fungsinya.",
          ],
        },
        {
          heading: "6. Hak Kamu",
          bullets: [
            "Mengakses dan memperbarui data profil serta data darurat kapan saja dari aplikasi.",
            "Mengunduh ringkasan data kamu lewat Pengaturan > Privasi > Kelola data saya.",
            "Menghapus akun beserta seluruh data terkait secara permanen lewat Pengaturan > Akun > Hapus akun.",
          ],
        },
        {
          heading: "7. Perubahan Kebijakan",
          paragraphs: [
            'Perubahan material pada kebijakan ini akan diumumkan di aplikasi sebelum berlaku. Tanggal "terakhir diperbarui" di atas selalu mencerminkan versi yang sedang berlaku.',
          ],
        },
      ],
    },
    terms: {
      titleKey: "legal.termsTitle",
      sections: [
        {
          paragraphs: [
            'Syarat & Ketentuan ini mengatur penggunaan aplikasi GoBareng ("Aplikasi", "Platform") oleh seluruh pengguna ("Kamu", "Pengguna"). Dengan mendaftar dan menggunakan Aplikasi, kamu dianggap telah membaca dan menyetujui seluruh ketentuan di bawah ini.',
          ],
        },
        {
          heading: "1. Akun & Verifikasi",
          bullets: [
            "Kamu wajib mendaftar dengan data yang benar: nama, email aktif, dan nomor WhatsApp aktif.",
            "Verifikasi nomor WhatsApp melalui kode OTP bersifat wajib dan tidak dapat dilewati.",
            "Satu orang hanya boleh memiliki satu akun. Akun tidak dapat dipindahtangankan.",
            "Kamu bertanggung jawab menjaga kerahasiaan kata sandi dan seluruh aktivitas dalam akunmu.",
          ],
        },
        {
          heading: "2. Jenis Trip & Visibilitas",
          bullets: [
            "Private — hanya peserta yang diundang/di-approve organizer yang dapat melihat dan bergabung.",
            "Public — tampil di pencarian (Jelajahi) dan dapat diikuti siapa pun selama kuota tersedia. Hanya untuk akun terverifikasi.",
            "Berbayar — trip dengan biaya partisipasi. Hanya dapat dibuat dan diikuti oleh member GoBareng Pro.",
          ],
        },
        {
          heading: "3. Masa Berlaku Trip (Expired)",
          bullets: [
            "Trip yang melewati jam kumpul dan belum dimulai akan berstatus expired secara otomatis setelah batas waktu mulai terlewati — yaitu jam titik kumpul ditambah 2 (dua) jam.",
            "Trip expired tidak dapat dimulai, dan peserta yang sudah bergabung akan menerima notifikasi pembatalan.",
            "Organizer bertanggung jawab memperbarui jadwal bila ada perubahan.",
          ],
        },
        {
          heading: "4. Trip Berbayar & Biaya Platform",
          bullets: [
            "Fee platform sebesar 5% dari harga trip dikenakan kepada organizer untuk setiap peserta yang terkonfirmasi membayar.",
            "Pembayaran dari peserta ke organizer dilakukan langsung melalui transfer manual ke rekening/dompet digital organizer yang ditampilkan di aplikasi.",
            "GoBareng bukan pihak dalam transaksi transfer manual tersebut; sengketa pembayaran diselesaikan antara peserta dan organizer (lihat juga Disclaimer).",
            "Status peserta berubah menjadi terkonfirmasi setelah organizer mengonfirmasi penerimaan pembayaran.",
          ],
        },
        {
          heading: "5. Keselamatan & Fitur SOS",
          bullets: [
            "Fitur keselamatan (tracking live, SOS, beacon) adalah alat bantu — bukan jaminan keselamatan.",
            "Kamu tetap bertanggung jawab atas persiapan, kondisi fisik, dan keputusanmu sendiri selama trip.",
            "Penyalahgunaan SOS (alarm palsu yang disengaja) dapat berakibat penangguhan akun.",
          ],
        },
        {
          heading: "6. Penangguhan & Penghapusan Akun",
          bullets: [
            "Kami dapat menangguhkan akun yang melanggar ketentuan, menyalahgunakan fitur keselamatan, atau merugikan pengguna lain.",
            "Kamu dapat menghapus akunmu kapan saja; penghapusan bersifat permanen.",
          ],
        },
      ],
    },
    disclaimer: {
      titleKey: "legal.disclaimerTitle",
      sections: [
        {
          paragraphs: [
            "Aplikasi GoBareng adalah alat bantu koordinasi dan keselamatan perjalanan. Dengan menggunakan Aplikasi, kamu memahami dan menyetujui batasan berikut.",
          ],
        },
        {
          heading: "1. Bukan Jaminan Keselamatan",
          paragraphs: [
            "Fitur tracking, SOS, dan beacon bergantung pada sinyal GPS, jaringan seluler, dan kondisi perangkat. GoBareng tidak menjamin fitur selalu berfungsi di segala kondisi, terutama di area tanpa sinyal.",
          ],
        },
        {
          heading: "2. Tanggung Jawab Pengguna",
          paragraphs: [
            "Keputusan untuk memulai, melanjutkan, atau membatalkan perjalanan sepenuhnya ada di tangan pengguna dan organizer. GoBareng tidak bertanggung jawab atas cedera, kehilangan, atau kerugian yang terjadi selama trip.",
          ],
        },
        {
          heading: "3. Transaksi Antar Pengguna",
          paragraphs: [
            "Pembayaran trip berbayar dilakukan langsung antara peserta dan organizer. GoBareng bukan pihak dalam transaksi tersebut dan tidak menanggung sengketa pembayaran.",
          ],
        },
        {
          heading: "4. Konten Pengguna",
          paragraphs: [
            "Konten diskusi komunitas adalah tanggung jawab masing-masing pengirim. Laporkan konten yang melanggar lewat fitur Laporkan.",
          ],
        },
      ],
    },
  };
