-- Per-clinic agenda color preferences. JSON shape:
-- { consulta, reuniao, lembrete, groupSession, availability } where each value
-- is a Tailwind palette name validated against PALETTE_NAMES in src/lib/clinic/colors/palette.ts.
-- Default is empty object so existing rows pick up code-side defaults via resolveAgendaColors().
ALTER TABLE "Clinic" ADD COLUMN "agendaColors" JSONB NOT NULL DEFAULT '{}';
