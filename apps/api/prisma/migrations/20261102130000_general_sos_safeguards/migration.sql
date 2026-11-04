-- Pengaman anti-penyalahgunaan SOS umum (Wella 2 Nov 2026):
-- flag admin di GeneralSos + tabel laporan SOS palsu dari penerima.
ALTER TABLE "GeneralSos" ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "GeneralSosReport" (
    "id" TEXT NOT NULL,
    "generalSosId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneralSosReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GeneralSosReport_generalSosId_reporterId_key" ON "GeneralSosReport"("generalSosId", "reporterId");
CREATE INDEX "GeneralSosReport_generalSosId_idx" ON "GeneralSosReport"("generalSosId");

ALTER TABLE "GeneralSosReport" ADD CONSTRAINT "GeneralSosReport_generalSosId_fkey" FOREIGN KEY ("generalSosId") REFERENCES "GeneralSos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneralSosReport" ADD CONSTRAINT "GeneralSosReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
