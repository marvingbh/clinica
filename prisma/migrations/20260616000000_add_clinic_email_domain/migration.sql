-- Per-clinic white-label email sending domain (hybrid model).
-- When emailDomainStatus = 'verified', the clinic sends from its own domain;
-- otherwise the shared SaaS domain is used.
ALTER TABLE "Clinic" ADD COLUMN     "emailDomain" TEXT,
ADD COLUMN     "emailDomainRecords" JSONB,
ADD COLUMN     "emailDomainResendId" TEXT,
ADD COLUMN     "emailDomainStatus" TEXT;
