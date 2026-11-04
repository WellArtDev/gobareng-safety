-- Link peta deterministik untuk jawaban lokasi AI-Q (nullable: baris lama tetap sah).
ALTER TABLE "TripQuestion" ADD COLUMN "links" JSONB;
