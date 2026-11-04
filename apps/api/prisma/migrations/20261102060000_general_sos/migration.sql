-- SOS Umum (tanpa trip): enum alasan, tabel GeneralSos + responder,
-- kind notifikasi baru, dan WaDispatchLog.tripId dibuat nullable.
CREATE TYPE "GeneralSosReason" AS ENUM ('KECELAKAAN_LALU_LINTAS', 'KENDARAAN_MOGOK', 'BAN_BOCOR_BENSIN_HABIS', 'KEJAHATAN', 'SAKIT_MENDADAK', 'BUTUH_AMBULANS', 'KEBAKARAN', 'BANJIR_POHON_TUMBANG', 'BUTUH_BANTUAN_SEGERA');

ALTER TYPE "NotificationKind" ADD VALUE 'GENERAL_SOS_ALERT';
ALTER TYPE "NotificationKind" ADD VALUE 'GENERAL_SOS_CLOSED';

ALTER TABLE "WaDispatchLog" ALTER COLUMN "tripId" DROP NOT NULL;

CREATE TABLE "GeneralSos" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "reason" "GeneralSosReason" NOT NULL,
    "level" "SosLevel" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "status" "SosStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneralSos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GeneralSos_senderId_status_idx" ON "GeneralSos"("senderId", "status");

CREATE TABLE "GeneralSosResponder" (
    "id" TEXT NOT NULL,
    "generalSosId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneralSosResponder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GeneralSosResponder_generalSosId_userId_key" ON "GeneralSosResponder"("generalSosId", "userId");
CREATE INDEX "GeneralSosResponder_generalSosId_idx" ON "GeneralSosResponder"("generalSosId");

ALTER TABLE "GeneralSos" ADD CONSTRAINT "GeneralSos_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneralSosResponder" ADD CONSTRAINT "GeneralSosResponder_generalSosId_fkey" FOREIGN KEY ("generalSosId") REFERENCES "GeneralSos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneralSosResponder" ADD CONSTRAINT "GeneralSosResponder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
