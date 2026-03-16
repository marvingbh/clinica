-- CreateEnum
CREATE TYPE "NfseEmissionStatus" AS ENUM ('PENDENTE', 'EMITIDA', 'ERRO', 'CANCELADA');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "nfsePerAppointment" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "NfseEmission" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceItemId" TEXT,
    "status" "NfseEmissionStatus" NOT NULL DEFAULT 'PENDENTE',
    "numero" TEXT,
    "chaveAcesso" TEXT,
    "codigoVerificacao" TEXT,
    "emitidaAt" TIMESTAMP(3),
    "erro" TEXT,
    "canceladaAt" TIMESTAMP(3),
    "cancelamentoMotivo" TEXT,
    "descricao" TEXT,
    "valor" DECIMAL(10,2) NOT NULL,
    "xml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfseEmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NfseEmission_invoiceId_idx" ON "NfseEmission"("invoiceId");

-- CreateIndex
CREATE INDEX "NfseEmission_invoiceId_status_idx" ON "NfseEmission"("invoiceId", "status");

-- AddForeignKey
ALTER TABLE "NfseEmission" ADD CONSTRAINT "NfseEmission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfseEmission" ADD CONSTRAINT "NfseEmission_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
