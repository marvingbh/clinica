-- CreateEnum
CREATE TYPE "NfseEmissionStatus" AS ENUM ('PENDENTE', 'EMITIDA', 'ERRO', 'CANCELADA');

-- AlterTable: Invoice NFS-e fields
ALTER TABLE "Invoice" ADD COLUMN     "nfseAliquotaIss" DECIMAL(5,2),
ADD COLUMN     "nfseCanceladaAt" TIMESTAMP(3),
ADD COLUMN     "nfseCancelamentoMotivo" TEXT,
ADD COLUMN     "nfseChaveAcesso" TEXT,
ADD COLUMN     "nfseCodigoServico" TEXT,
ADD COLUMN     "nfseCodigoVerificacao" TEXT,
ADD COLUMN     "nfseDescricao" TEXT,
ADD COLUMN     "nfseEmitidaAt" TIMESTAMP(3),
ADD COLUMN     "nfseErro" TEXT,
ADD COLUMN     "nfseNumero" TEXT,
ADD COLUMN     "nfseStatus" TEXT,
ADD COLUMN     "nfseXml" TEXT;

-- AlterTable: Patient billing/address/nfse fields
ALTER TABLE "Patient" ADD COLUMN     "addressCity" TEXT,
ADD COLUMN     "addressNeighborhood" TEXT,
ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "addressState" TEXT,
ADD COLUMN     "addressStreet" TEXT,
ADD COLUMN     "addressZip" TEXT,
ADD COLUMN     "billingCpf" TEXT,
ADD COLUMN     "billingResponsibleName" TEXT,
ADD COLUMN     "nfseDescriptionTemplate" TEXT,
ADD COLUMN     "nfsePerAppointment" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: NfseEmission (per-item NFS-e records)
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

-- CreateTable: NfseConfig (per-clinic NFS-e configuration)
CREATE TABLE "NfseConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "inscricaoMunicipal" TEXT NOT NULL,
    "codigoMunicipio" TEXT NOT NULL,
    "regimeTributario" TEXT NOT NULL DEFAULT '1',
    "opSimpNac" INTEGER NOT NULL DEFAULT 2,
    "codigoServico" TEXT NOT NULL,
    "codigoServicoMunicipal" TEXT,
    "cnae" TEXT,
    "codigoNbs" TEXT,
    "cClassNbs" TEXT,
    "aliquotaIss" DECIMAL(5,2) NOT NULL,
    "descricaoServico" TEXT,
    "nfseTaxPercentage" DECIMAL(5,2),
    "professionalCrp" TEXT,
    "certificatePem" TEXT NOT NULL,
    "privateKeyPem" TEXT NOT NULL,
    "useSandbox" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfseConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AdnLog (API communication log)
CREATE TABLE "AdnLog" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "operation" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "requestBody" TEXT,
    "statusCode" INTEGER,
    "responseBody" TEXT,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdnLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NfseEmission_invoiceId_idx" ON "NfseEmission"("invoiceId");
CREATE INDEX "NfseEmission_invoiceId_status_idx" ON "NfseEmission"("invoiceId", "status");
CREATE INDEX "NfseEmission_invoiceItemId_idx" ON "NfseEmission"("invoiceItemId");
CREATE UNIQUE INDEX "NfseConfig_clinicId_key" ON "NfseConfig"("clinicId");
CREATE INDEX "AdnLog_clinicId_createdAt_idx" ON "AdnLog"("clinicId", "createdAt");
CREATE INDEX "AdnLog_invoiceId_idx" ON "AdnLog"("invoiceId");

-- AddForeignKey
ALTER TABLE "NfseEmission" ADD CONSTRAINT "NfseEmission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NfseEmission" ADD CONSTRAINT "NfseEmission_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NfseConfig" ADD CONSTRAINT "NfseConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
