-- Records authentication-related attempts (login, superadmin login, signup) for
-- brute-force / abuse protection. Persisted so rate limiting survives across the
-- many ephemeral serverless instances on Vercel (in-memory limiting does not).
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ipAddress" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginAttempt_identifier_kind_createdAt_idx" ON "LoginAttempt"("identifier", "kind", "createdAt");
CREATE INDEX "LoginAttempt_createdAt_idx" ON "LoginAttempt"("createdAt");
